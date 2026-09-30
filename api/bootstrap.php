<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);
header_remove('X-Powered-By');

const DALLI_MAX_BODY_BYTES = 262144; // 256 KiB
const DALLI_SESSION_NAME = 'DALLISESSID';

function dalli_json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function dalli_fail(string $message, int $status): void
{
    dalli_json_response(['ok' => false, 'error' => $message], $status);
}

$configPath = dirname(__DIR__, 2) . '/molife-config.php';
if (!is_file($configPath)) {
    dalli_fail('MoLife server configuration is missing.', 503);
}

$DALLI_CONFIG = require $configPath;
if (!is_array($DALLI_CONFIG)) {
    dalli_fail('MoLife server configuration is invalid.', 503);
}

function dalli_config(string $section, string $key): string
{
    global $DALLI_CONFIG;
    $value = $DALLI_CONFIG[$section][$key] ?? '';
    return is_string($value) ? $value : '';
}

function dalli_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = dalli_config('database', 'host');
    $name = dalli_config('database', 'name');
    $user = dalli_config('database', 'user');
    $password = dalli_config('database', 'password');

    if ($host === '' || $name === '' || $user === '' || $password === '') {
        dalli_fail('Database configuration is incomplete.', 503);
    }

    try {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=utf8mb4',
            $host,
            $name
        );
        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        return $pdo;
    } catch (Throwable $e) {
        error_log('MoLife database connection failed: ' . $e->getMessage());
        dalli_fail('Database connection failed.', 503);
    }
}

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_trans_sid', '0');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', '1');
session_name(DALLI_SESSION_NAME);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function dalli_require_method(string $method): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== strtoupper($method)) {
        header('Allow: ' . strtoupper($method));
        dalli_fail('Method not allowed.', 405);
    }
}

function dalli_require_same_origin(): void
{
    $expected = rtrim(dalli_config('app', 'origin'), '/');
    if ($expected === '') {
        dalli_fail('Application origin is not configured.', 503);
    }

    $fetchSite = strtolower($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '');
    if ($fetchSite === 'cross-site' || $fetchSite === 'same-site') {
        dalli_fail('Cross-origin request rejected.', 403);
    }

    $origin = rtrim($_SERVER['HTTP_ORIGIN'] ?? '', '/');
    if ($origin !== '') {
        if (!hash_equals($expected, $origin)) {
            dalli_fail('Request origin rejected.', 403);
        }
        return;
    }

    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    if ($referer !== '') {
        $parts = parse_url($referer);
        $scheme = $parts['scheme'] ?? '';
        $host = $parts['host'] ?? '';
        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
        $refererOrigin = $scheme !== '' && $host !== '' ? $scheme . '://' . $host . $port : '';
        if ($refererOrigin !== '' && hash_equals($expected, $refererOrigin)) {
            return;
        }
    }

    // Modern browsers provide Sec-Fetch-Site even when privacy settings suppress
    // Origin/Referer. Accept only an explicit same-origin browser signal.
    if ($fetchSite === 'same-origin') {
        return;
    }

    dalli_fail('Request origin could not be verified.', 403);
}

function dalli_read_json_body(): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Request is too large.', 413);
    }

    $raw = file_get_contents('php://input', false, null, 0, DALLI_MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Request is too large.', 413);
    }

    try {
        $decoded = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        dalli_fail('Invalid JSON.', 400);
    }

    if (!is_array($decoded)) {
        dalli_fail('JSON object expected.', 400);
    }

    return $decoded;
}

function dalli_require_auth(): int
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!is_int($userId) && !ctype_digit((string) $userId)) {
        dalli_fail('Authentication required.', 401);
    }
    return (int) $userId;
}

function dalli_csrf_token(): string
{
    if (!isset($_SESSION['csrf']) || !is_string($_SESSION['csrf']) || strlen($_SESSION['csrf']) < 32) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function dalli_require_csrf(): void
{
    $expected = $_SESSION['csrf'] ?? '';
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($expected) || $expected === '' || !is_string($provided) || !hash_equals($expected, $provided)) {
        dalli_fail('Invalid CSRF token.', 403);
    }
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
