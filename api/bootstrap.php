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

$configPath = dirname(__DIR__, 2) . '/dalli-config.php';
if (!is_file($configPath)) {
    dalli_fail('Dalli server configuration is missing.', 503);
}

$DALLI_CONFIG = require $configPath;
if (!is_array($DALLI_CONFIG)) {
    dalli_fail('Dalli server configuration is invalid.', 503);
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
        error_log('Dalli database connection failed: ' . $e->getMessage());
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

function dalli_string_ok(mixed $value, int $min, int $max): bool
{
    return is_string($value) && strlen($value) >= $min && strlen($value) <= $max;
}

function dalli_number_between(mixed $value, float $min, float $max): bool
{
    return is_int($value) || is_float($value)
        ? (float) $value >= $min && (float) $value <= $max
        : false;
}

function dalli_keys_allowed(array $value, array $allowed): bool
{
    return count(array_diff(array_keys($value), $allowed)) === 0;
}

function dalli_validate_state(mixed $state): array
{
    if (!is_array($state) || !dalli_keys_allowed($state, ['version', 'settings', 'current', 'history'])) {
        dalli_fail('Invalid Dalli state.', 422);
    }
    if (($state['version'] ?? null) !== 1) {
        dalli_fail('Unsupported Dalli state version.', 422);
    }

    $settings = $state['settings'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;

    if (!is_array($settings) || !dalli_keys_allowed($settings, ['goal', 'categories', 'actions'])) {
        dalli_fail('Invalid settings.', 422);
    }
    if (!is_int($settings['goal'] ?? null) || $settings['goal'] < 20 || $settings['goal'] > 1000) {
        dalli_fail('Invalid daily goal.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'weight'])) {
            dalli_fail('Invalid category.', 422);
        }
        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }
        $weight = $category['weight'] ?? null;
        $validWeight = $id === 'uncategorized'
            ? (is_int($weight) || is_float($weight)) && (float) $weight === 0.0
            : dalli_number_between($weight, 0.25, 10);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validWeight) {
            dalli_fail('Invalid category data.', 422);
        }
        $categoryIds[$id] = true;
    }

    $actions = $settings['actions'] ?? null;
    if (!is_array($actions) || count($actions) > 500) {
        dalli_fail('Invalid actions.', 422);
    }
    $actionIds = [];
    foreach ($actions as $action) {
        if (!is_array($action) || !dalli_keys_allowed($action, ['id', 'categoryId', 'name', 'xp', 'type'])) {
            dalli_fail('Invalid action.', 422);
        }
        $id = $action['id'] ?? null;
        $categoryId = $action['categoryId'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($actionIds[$id])) {
            dalli_fail('Invalid action id.', 422);
        }
        if (!is_string($categoryId) || !isset($categoryIds[$categoryId])) {
            dalli_fail('Invalid action category.', 422);
        }
        if (!dalli_string_ok($action['name'] ?? null, 1, 100)
            || !is_int($action['xp'] ?? null) || $action['xp'] < 1 || $action['xp'] > 200
            || !in_array($action['type'] ?? null, ['repeatable', 'once'], true)) {
            dalli_fail('Invalid action data.', 422);
        }
        $actionIds[$id] = true;
    }

    if (!is_array($current) || !dalli_keys_allowed($current, ['date', 'transactions'])) {
        dalli_fail('Invalid current day.', 422);
    }
    $date = $current['date'] ?? '';
    if (!is_string($date) || ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1)) {
        dalli_fail('Invalid current date.', 422);
    }
    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!is_array($tx) || !dalli_keys_allowed($tx, ['id', 'actionId', 'actionName', 'categoryId', 'xp', 'timestamp'])) {
            dalli_fail('Invalid transaction.', 422);
        }
        if (!dalli_string_ok($tx['id'] ?? null, 1, 128)
            || !dalli_string_ok($tx['actionId'] ?? null, 0, 128)
            || !dalli_string_ok($tx['actionName'] ?? null, 1, 100)
            || !is_string($tx['categoryId'] ?? null) || !isset($categoryIds[$tx['categoryId']])
            || !is_int($tx['xp'] ?? null) || $tx['xp'] < 1 || $tx['xp'] > 200
            || (!is_int($tx['timestamp'] ?? null) && !is_float($tx['timestamp'] ?? null))) {
            dalli_fail('Invalid transaction data.', 422);
        }
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }
    foreach ($history as $day) {
        if (!is_array($day) || !dalli_keys_allowed($day, ['date', 'xp', 'goal', 'won', 'categoryXp'])) {
            dalli_fail('Invalid history entry.', 422);
        }
        if (!is_string($day['date'] ?? null) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['xp'] ?? null) || $day['xp'] < 0 || $day['xp'] > 100000
            || !is_int($day['goal'] ?? null) || $day['goal'] < 20 || $day['goal'] > 1000
            || !is_bool($day['won'] ?? null)
            || !is_array($day['categoryXp'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }
        foreach ($day['categoryXp'] as $categoryId => $xp) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($xp) || $xp < 0 || $xp > 100000) {
                dalli_fail('Invalid history category data.', 422);
            }
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}

function dalli_login_rate_key(string $username): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return hash('sha256', $ip . '|' . strtolower($username));
}

function dalli_login_rate_status(string $username): array
{
    $path = sys_get_temp_dir() . '/dalli-login-' . dalli_login_rate_key($username) . '.json';
    $now = time();
    $data = ['window' => $now, 'count' => 0, 'blocked_until' => 0];

    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        return [$path, $data];
    }

    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $data = array_merge($data, $decoded);
        }
    }

    if (($data['window'] ?? 0) < $now - 600) {
        $data = ['window' => $now, 'count' => 0, 'blocked_until' => 0];
    }

    flock($handle, LOCK_UN);
    fclose($handle);
    return [$path, $data];
}

function dalli_login_rate_check(string $username): void
{
    [, $data] = dalli_login_rate_status($username);
    $blockedUntil = (int) ($data['blocked_until'] ?? 0);
    if ($blockedUntil > time()) {
        header('Retry-After: ' . max(1, $blockedUntil - time()));
        dalli_fail('Too many login attempts. Try again later.', 429);
    }
}

function dalli_login_rate_failure(string $username): void
{
    [$path, $data] = dalli_login_rate_status($username);
    $now = time();
    $count = (int) ($data['count'] ?? 0) + 1;
    $blockedUntil = $count >= 5 ? $now + 900 : 0;
    $next = ['window' => (int) ($data['window'] ?? $now), 'count' => $count, 'blocked_until' => $blockedUntil];
    @file_put_contents($path, json_encode($next), LOCK_EX);
}

function dalli_login_rate_clear(string $username): void
{
    [$path] = dalli_login_rate_status($username);
    @unlink($path);
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
