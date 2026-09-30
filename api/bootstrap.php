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


function dalli_auth_schema_ready(?PDO $pdo = null): bool
{
    static $ready = null;
    if (is_bool($ready)) {
        return $ready;
    }

    $pdo ??= dalli_pdo();
    try {
        $pdo->query('SELECT email, role, status, email_verified_at FROM users LIMIT 0');
        $pdo->query('SELECT selector FROM auth_sessions LIMIT 0');
        $pdo->query('SELECT selector FROM auth_tokens LIMIT 0');
        $pdo->query('SELECT bucket_hash FROM auth_rate_limits LIMIT 0');
        $ready = true;
    } catch (Throwable $e) {
        $ready = false;
    }

    return $ready;
}

function dalli_registration_mode(): string
{
    $mode = strtolower(trim(dalli_config('app', 'registration_mode')));
    if (!in_array($mode, ['invite', 'closed', 'public'], true)) {
        return 'invite';
    }
    return $mode;
}

function dalli_password_algorithm(): string|int|null
{
    return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
}

function dalli_password_options(): array
{
    if (defined('PASSWORD_ARGON2ID')) {
        return [
            'memory_cost' => 19456,
            'time_cost' => 2,
            'threads' => 1,
        ];
    }
    return [];
}

function dalli_hash_password(string $password): string
{
    $hash = password_hash($password, dalli_password_algorithm(), dalli_password_options());
    if (!is_string($hash)) {
        throw new RuntimeException('Password hashing failed.');
    }
    return $hash;
}

function dalli_password_needs_rehash(string $hash): bool
{
    return password_needs_rehash($hash, dalli_password_algorithm(), dalli_password_options());
}

function dalli_rate_hmac_key(): string
{
    $key = dalli_config('app', 'auth_hmac_key');
    if ($key !== '') {
        return $key;
    }

    // Backward-compatible fallback until the private config is updated.
    return dalli_config('app', 'owner_setup_token');
}

function dalli_rate_bucket_hash(string $action, string $subject): string
{
    $payload = $action . "\x1F" . strtolower(trim($subject));
    $key = dalli_rate_hmac_key();
    return $key !== ''
        ? hash_hmac('sha256', $payload, $key)
        : hash('sha256', $payload);
}

function dalli_rate_file_path(string $action, string $subject): string
{
    return sys_get_temp_dir() . '/molife-rate-' . dalli_rate_bucket_hash($action, $subject) . '.json';
}

function dalli_rate_read_file(string $action, string $subject, int $windowSeconds): array
{
    $path = dalli_rate_file_path($action, $subject);
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

    if ((int) ($data['window'] ?? 0) < $now - $windowSeconds) {
        $data = ['window' => $now, 'count' => 0, 'blocked_until' => 0];
    }

    flock($handle, LOCK_UN);
    fclose($handle);
    return [$path, $data];
}

function dalli_rate_check(string $action, string $subject, int $windowSeconds): void
{
    $now = time();

    if (dalli_auth_schema_ready()) {
        $stmt = dalli_pdo()->prepare(
            'SELECT UNIX_TIMESTAMP(window_started_at) AS window_started,
                    hit_count,
                    UNIX_TIMESTAMP(blocked_until) AS blocked_until
             FROM auth_rate_limits
             WHERE action = ? AND bucket_hash = ?
             LIMIT 1'
        );
        $stmt->execute([$action, dalli_rate_bucket_hash($action, $subject)]);
        $row = $stmt->fetch();

        if (is_array($row)) {
            $blockedUntil = (int) ($row['blocked_until'] ?? 0);
            if ($blockedUntil > $now) {
                header('Retry-After: ' . max(1, $blockedUntil - $now));
                dalli_fail('Too many attempts. Try again later.', 429);
            }
        }
        return;
    }

    [, $data] = dalli_rate_read_file($action, $subject, $windowSeconds);
    $blockedUntil = (int) ($data['blocked_until'] ?? 0);
    if ($blockedUntil > $now) {
        header('Retry-After: ' . max(1, $blockedUntil - $now));
        dalli_fail('Too many attempts. Try again later.', 429);
    }
}

function dalli_rate_failure(
    string $action,
    string $subject,
    int $limit,
    int $windowSeconds,
    int $blockSeconds
): void {
    $now = time();

    if (dalli_auth_schema_ready()) {
        $pdo = dalli_pdo();
        $bucket = dalli_rate_bucket_hash($action, $subject);
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT UNIX_TIMESTAMP(window_started_at) AS window_started,
                        hit_count
                 FROM auth_rate_limits
                 WHERE action = ? AND bucket_hash = ?
                 FOR UPDATE'
            );
            $stmt->execute([$action, $bucket]);
            $row = $stmt->fetch();

            $count = 0;
            $windowStarted = $now;
            if (is_array($row)) {
                $storedWindow = (int) ($row['window_started'] ?? 0);
                if ($storedWindow >= $now - $windowSeconds) {
                    $windowStarted = $storedWindow;
                    $count = (int) ($row['hit_count'] ?? 0);
                }
            }

            $count++;
            $blockedUntil = $count >= $limit ? $now + $blockSeconds : null;

            $upsert = $pdo->prepare(
                'INSERT INTO auth_rate_limits
                    (action, bucket_hash, window_started_at, hit_count, blocked_until)
                 VALUES (?, ?, FROM_UNIXTIME(?), ?, ?)
                 ON DUPLICATE KEY UPDATE
                    window_started_at = VALUES(window_started_at),
                    hit_count = VALUES(hit_count),
                    blocked_until = VALUES(blocked_until)'
            );
            $upsert->execute([
                $action,
                $bucket,
                $windowStarted,
                $count,
                $blockedUntil === null ? null : date('Y-m-d H:i:s', $blockedUntil),
            ]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('MoLife DB rate-limit update failed: ' . $e->getMessage());
        }
        return;
    }

    [$path, $data] = dalli_rate_read_file($action, $subject, $windowSeconds);
    $count = (int) ($data['count'] ?? 0) + 1;
    $blockedUntil = $count >= $limit ? $now + $blockSeconds : 0;
    $next = [
        'window' => (int) ($data['window'] ?? $now),
        'count' => $count,
        'blocked_until' => $blockedUntil,
    ];
    @file_put_contents($path, json_encode($next), LOCK_EX);
}

function dalli_rate_clear(string $action, string $subject): void
{
    if (dalli_auth_schema_ready()) {
        try {
            $stmt = dalli_pdo()->prepare(
                'DELETE FROM auth_rate_limits WHERE action = ? AND bucket_hash = ?'
            );
            $stmt->execute([$action, dalli_rate_bucket_hash($action, $subject)]);
        } catch (Throwable $e) {
            error_log('MoLife DB rate-limit clear failed: ' . $e->getMessage());
        }
        return;
    }

    @unlink(dalli_rate_file_path($action, $subject));
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

function dalli_login_rate_check(string $username): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_check('login_account', $username, 600);
    dalli_rate_check('login_ip', $ip, 600);
}

function dalli_login_rate_failure(string $username): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_failure('login_account', $username, 5, 600, 900);
    dalli_rate_failure('login_ip', $ip, 20, 600, 900);
}

function dalli_login_rate_clear(string $username): void
{
    // Clear only the account bucket. Keeping the IP bucket prevents a bot from
    // erasing its aggregate failure history by eventually finding one valid login.
    dalli_rate_clear('login_account', $username);
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
