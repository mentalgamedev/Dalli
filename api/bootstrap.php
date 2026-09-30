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
        error_log('Dalli database connection failed: ' . $e->getMessage());
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

function dalli_validate_state_v2(mixed $state): array
{
    if (!is_array($state)
        || !dalli_keys_allowed($state, ['version', 'settings', 'progression', 'current', 'history'])
        || ($state['version'] ?? null) !== 2) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
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
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'focus', 'color'])) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $focus = $category['focus'] ?? null;
        $validFocus = $id === 'uncategorized'
            ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
            : dalli_number_between($focus, 0.25, 10);

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
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
        if (!is_array($action) || !dalli_keys_allowed($action, ['id', 'categoryId', 'name', 'baseXp', 'type', 'trackVisible'])) {
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
            || !is_int($action['baseXp'] ?? null) || $action['baseXp'] < 1 || $action['baseXp'] > 200
            || !in_array($action['type'] ?? null, ['repeatable', 'once'], true)
            || (array_key_exists('trackVisible', $action) && !is_bool($action['trackVisible']))) {
            dalli_fail('Invalid action data.', 422);
        }

        $actionIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['lifetimeXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['lifetimeXp'] ?? null)
        || $progression['lifetimeXp'] < 0 || $progression['lifetimeXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateTransaction = static function (mixed $tx): bool {
        if (!is_array($tx)
            || !dalli_keys_allowed($tx, [
                'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                'baseXp', 'effectiveXp', 'efficiency', 'timestamp'
            ])) {
            return false;
        }

        $categoryId = $tx['categoryId'] ?? null;
        return dalli_string_ok($tx['id'] ?? null, 1, 128)
            && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
            && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
            && is_string($categoryId)
            && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
            && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
            && is_int($tx['baseXp'] ?? null) && $tx['baseXp'] >= 1 && $tx['baseXp'] <= 200
            && is_int($tx['effectiveXp'] ?? null) && $tx['effectiveXp'] >= 1 && $tx['effectiveXp'] <= 200
            && dalli_number_between($tx['efficiency'] ?? null, 0.01, 1)
            && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
            && (float) $tx['timestamp'] > 0;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) {
            return true;
        }

        if (!is_array($card)
            || !dalli_keys_allowed($card, ['date', 'type', 'headline', 'copy', 'xp', 'rank', 'streak'])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['xp'] ?? null) && $card['xp'] >= 0 && $card['xp'] <= 100000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };

    $validateXpMap = static function (mixed $map): bool {
        if (!is_array($map)) {
            return false;
        }

        foreach ($map as $categoryId => $xp) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($xp) || $xp < 0 || $xp > 100000) {
                return false;
            }
        }
        return true;
    };

    if (!is_array($current)
        || !dalli_keys_allowed($current, ['date', 'transactions', 'clearedAt', 'dayCard'])) {
        dalli_fail('Invalid current day.', 422);
    }

    $currentDate = $current['date'] ?? '';
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)) {
        dalli_fail('Invalid current date.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) {
            dalli_fail('Invalid transaction data.', 422);
        }
    }

    if (!$validTimestamp($current['clearedAt'] ?? null)
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current completion data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'xp', 'baseXp', 'goal', 'won', 'categoryXp', 'categoryBaseXp',
                'clearedAt', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['xp'] ?? null) || $day['xp'] < 0 || $day['xp'] > 100000
            || !is_int($day['baseXp'] ?? null) || $day['baseXp'] < 0 || $day['baseXp'] > 100000
            || !is_int($day['goal'] ?? null) || $day['goal'] < 20 || $day['goal'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateXpMap($day['categoryXp'] ?? null)
            || !$validateXpMap($day['categoryBaseXp'] ?? null)
            || !$validTimestamp($day['clearedAt'] ?? null)
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) {
                dalli_fail('Invalid historical transaction data.', 422);
            }
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}


function dalli_validate_state_v3(mixed $state): array
{
    if (!is_array($state)
        || !dalli_keys_allowed($state, ['version', 'settings', 'progression', 'current', 'history'])
        || ($state['version'] ?? null) !== 3) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;

    if (!is_array($settings)
        || !dalli_keys_allowed($settings, ['fullEnemyHp', 'categories', 'actions', 'combos'])
        || !is_int($settings['fullEnemyHp'] ?? null)
        || $settings['fullEnemyHp'] < 20
        || $settings['fullEnemyHp'] > 1000) {
        dalli_fail('Invalid settings.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'focus', 'color'])) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $focus = $category['focus'] ?? null;
        $validFocus = $id === 'uncategorized'
            ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
            : dalli_number_between($focus, 0.25, 10);

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
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
        if (!is_array($action)
            || !dalli_keys_allowed($action, ['id', 'categoryId', 'name', 'baseDamage', 'type', 'trackVisible'])) {
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
            || !is_int($action['baseDamage'] ?? null) || $action['baseDamage'] < 1 || $action['baseDamage'] > 200
            || !in_array($action['type'] ?? null, ['repeatable', 'once'], true)
            || !is_bool($action['trackVisible'] ?? null)) {
            dalli_fail('Invalid action data.', 422);
        }
        $actionIds[$id] = true;
    }

    $combos = $settings['combos'] ?? null;
    if (!is_array($combos) || count($combos) > 100) {
        dalli_fail('Invalid combos.', 422);
    }

    $comboIds = [];
    $enabledSequences = [];
    foreach ($combos as $combo) {
        if (!is_array($combo)
            || !dalli_keys_allowed($combo, ['id', 'name', 'multiplier', 'enabled', 'actionIds'])) {
            dalli_fail('Invalid combo.', 422);
        }

        $id = $combo['id'] ?? null;
        $sequence = $combo['actionIds'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($comboIds[$id])
            || !dalli_string_ok($combo['name'] ?? null, 1, 80)
            || !dalli_number_between($combo['multiplier'] ?? null, 1.05, 3)
            || !is_bool($combo['enabled'] ?? null)
            || !is_array($sequence) || count($sequence) > 8) {
            dalli_fail('Invalid combo data.', 422);
        }

        foreach ($sequence as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId])) {
                dalli_fail('Invalid combo action.', 422);
            }
        }

        if ($combo['enabled']) {
            if (count($sequence) < 2) {
                dalli_fail('Enabled combos need at least two actions.', 422);
            }
            $fingerprint = implode("\x1F", $sequence);
            if (isset($enabledSequences[$fingerprint])) {
                dalli_fail('Duplicate enabled combo sequence.', 422);
            }
            $enabledSequences[$fingerprint] = true;
        }

        $comboIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['victoryXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['victoryXp'] ?? null)
        || $progression['victoryXp'] < 0 || $progression['victoryXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateDamageMap = static function (mixed $map): bool {
        if (!is_array($map)) return false;
        foreach ($map as $categoryId => $damage) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($damage) || $damage < 0 || $damage > 100000) {
                return false;
            }
        }
        return true;
    };

    $validateTransaction = static function (mixed $tx): bool {
        if (!is_array($tx) || !is_string($tx['type'] ?? null)) return false;

        if ($tx['type'] === 'action') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                'baseDamage', 'damage', 'efficiency', 'timestamp'
            ])) {
                return false;
            }
            $categoryId = $tx['categoryId'] ?? null;
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
                && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
                && is_string($categoryId)
                && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
                && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
                && is_int($tx['baseDamage'] ?? null) && $tx['baseDamage'] >= 1 && $tx['baseDamage'] <= 200
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 200
                && dalli_number_between($tx['efficiency'] ?? null, 0.01, 1)
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        if ($tx['type'] === 'combo') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'comboId', 'comboName', 'multiplier', 'damage',
                'sourceTransactionIds', 'timestamp'
            ])) {
                return false;
            }
            $sources = $tx['sourceTransactionIds'] ?? null;
            if (!is_array($sources) || count($sources) < 2 || count($sources) > 8) return false;
            foreach ($sources as $sourceId) {
                if (!dalli_string_ok($sourceId, 1, 128)) return false;
            }
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboId'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboName'] ?? null, 1, 80)
                && dalli_number_between($tx['multiplier'] ?? null, 1.05, 3)
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 100000
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        return false;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) return true;
        if (!is_array($card)
            || !dalli_keys_allowed($card, [
                'date', 'type', 'headline', 'copy', 'victoryXp', 'enemyHp',
                'damage', 'overkill', 'combos', 'rank', 'streak'
            ])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['victoryXp'] ?? null) && $card['victoryXp'] >= 0 && $card['victoryXp'] <= 20
            && is_int($card['enemyHp'] ?? null) && $card['enemyHp'] >= 20 && $card['enemyHp'] <= 1000
            && is_int($card['damage'] ?? null) && $card['damage'] >= 0 && $card['damage'] <= 100000
            && is_int($card['overkill'] ?? null) && $card['overkill'] >= 0 && $card['overkill'] <= 100000
            && is_int($card['combos'] ?? null) && $card['combos'] >= 0 && $card['combos'] <= 10000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };

    if (!is_array($current)
        || !dalli_keys_allowed($current, [
            'date', 'maxHp', 'transactions', 'comboProgress', 'defeatedAt',
            'victoryXpAwarded', 'dayCard'
        ])) {
        dalli_fail('Invalid current fight.', 422);
    }

    $currentDate = $current['date'] ?? '';
    $maxHp = $current['maxHp'] ?? null;
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)
        || !is_int($maxHp)
        || ($currentDate === '' ? $maxHp !== 0 : ($maxHp < 20 || $maxHp > 1000))) {
        dalli_fail('Invalid current fight metadata.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) dalli_fail('Invalid transaction data.', 422);
    }

    $comboProgress = $current['comboProgress'] ?? null;
    if (!is_array($comboProgress)) {
        dalli_fail('Invalid combo progress.', 422);
    }
    foreach ($comboProgress as $comboId => $progress) {
        if (!is_string($comboId) || !isset($comboIds[$comboId])
            || !is_array($progress)
            || !dalli_keys_allowed($progress, ['index', 'sourceTransactionIds'])
            || !is_int($progress['index'] ?? null)
            || $progress['index'] < 0 || $progress['index'] > 7
            || !is_array($progress['sourceTransactionIds'] ?? null)
            || count($progress['sourceTransactionIds']) > 7) {
            dalli_fail('Invalid combo progress data.', 422);
        }
        foreach ($progress['sourceTransactionIds'] as $sourceId) {
            if (!dalli_string_ok($sourceId, 1, 128)) dalli_fail('Invalid combo progress source.', 422);
        }
    }

    if (!$validTimestamp($current['defeatedAt'] ?? null)
        || !is_int($current['victoryXpAwarded'] ?? null)
        || $current['victoryXpAwarded'] < 0 || $current['victoryXpAwarded'] > 20
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current victory data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'damage', 'baseDamage', 'maxHp', 'won', 'categoryDamage',
                'categoryBaseDamage', 'defeatedAt', 'victoryXp', 'combosLanded',
                'overkill', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['damage'] ?? null) || $day['damage'] < 0 || $day['damage'] > 100000
            || !is_int($day['baseDamage'] ?? null) || $day['baseDamage'] < 0 || $day['baseDamage'] > 100000
            || !is_int($day['maxHp'] ?? null) || $day['maxHp'] < 20 || $day['maxHp'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateDamageMap($day['categoryDamage'] ?? null)
            || !$validateDamageMap($day['categoryBaseDamage'] ?? null)
            || !$validTimestamp($day['defeatedAt'] ?? null)
            || !is_int($day['victoryXp'] ?? null) || $day['victoryXp'] < 0 || $day['victoryXp'] > 20
            || !is_int($day['combosLanded'] ?? null) || $day['combosLanded'] < 0 || $day['combosLanded'] > 10000
            || !is_int($day['overkill'] ?? null) || $day['overkill'] < 0 || $day['overkill'] > 100000
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) dalli_fail('Invalid historical transaction data.', 422);
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}

function dalli_validate_state_v4(mixed $state): array
{
    if (!is_array($state)
        || !dalli_keys_allowed($state, ['version', 'settings', 'progression', 'current', 'history', 'armory'])
        || ($state['version'] ?? null) !== 4) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;
    $armory = $state['armory'] ?? null;

    if (!is_array($settings)
        || !dalli_keys_allowed($settings, ['fullEnemyHp', 'categories', 'actions', 'combos'])
        || !is_int($settings['fullEnemyHp'] ?? null)
        || $settings['fullEnemyHp'] < 20
        || $settings['fullEnemyHp'] > 1000) {
        dalli_fail('Invalid settings.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'focus', 'color'])) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $focus = $category['focus'] ?? null;
        $validFocus = $id === 'uncategorized'
            ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
            : dalli_number_between($focus, 0.25, 10);

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
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
        if (!is_array($action)
            || !dalli_keys_allowed($action, ['id', 'categoryId', 'name', 'baseDamage', 'type', 'trackVisible'])) {
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
            || !is_int($action['baseDamage'] ?? null) || $action['baseDamage'] < 1 || $action['baseDamage'] > 200
            || !in_array($action['type'] ?? null, ['repeatable', 'once'], true)
            || !is_bool($action['trackVisible'] ?? null)) {
            dalli_fail('Invalid action data.', 422);
        }
        $actionIds[$id] = true;
    }

    $combos = $settings['combos'] ?? null;
    if (!is_array($combos) || count($combos) > 100) {
        dalli_fail('Invalid combos.', 422);
    }

    $comboIds = [];
    $enabledSequences = [];
    foreach ($combos as $combo) {
        if (!is_array($combo)
            || !dalli_keys_allowed($combo, ['id', 'name', 'multiplier', 'enabled', 'actionIds'])) {
            dalli_fail('Invalid combo.', 422);
        }

        $id = $combo['id'] ?? null;
        $sequence = $combo['actionIds'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($comboIds[$id])
            || !dalli_string_ok($combo['name'] ?? null, 1, 80)
            || !dalli_number_between($combo['multiplier'] ?? null, 1.05, 3)
            || !is_bool($combo['enabled'] ?? null)
            || !is_array($sequence) || count($sequence) > 8) {
            dalli_fail('Invalid combo data.', 422);
        }

        foreach ($sequence as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId])) {
                dalli_fail('Invalid combo action.', 422);
            }
        }

        if ($combo['enabled']) {
            if (count($sequence) < 2) {
                dalli_fail('Enabled combos need at least two actions.', 422);
            }
            $fingerprint = implode("\x1F", $sequence);
            if (isset($enabledSequences[$fingerprint])) {
                dalli_fail('Duplicate enabled combo sequence.', 422);
            }
            $enabledSequences[$fingerprint] = true;
        }

        $comboIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['victoryXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['victoryXp'] ?? null)
        || $progression['victoryXp'] < 0 || $progression['victoryXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateDamageMap = static function (mixed $map): bool {
        if (!is_array($map)) return false;
        foreach ($map as $categoryId => $damage) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($damage) || $damage < 0 || $damage > 100000) {
                return false;
            }
        }
        return true;
    };


    $weaponBases = [
        'snub-nosed' => 10,
        'sawed-off' => 20,
        'tommy-gun' => 25,
        'grenade-launcher' => 30,
        'bazooka' => 35,
        'flamethrower' => 40,
        'golden-gun' => 999,
    ];
    $conditionMultipliers = [
        'rusty' => 0.5,
        'clean' => 1.0,
        'pimped' => 1.5,
        'over-engineered' => 2.0,
    ];

    $validateWeaponItem = static function (mixed $item) use ($weaponBases, $conditionMultipliers, $validTimestamp): bool {
        if (!is_array($item)
            || !dalli_keys_allowed($item, [
                'id', 'weaponId', 'conditionId', 'multiplier', 'damage',
                'acquiredDate', 'acquiredAt'
            ])) {
            return false;
        }

        $weaponId = $item['weaponId'] ?? null;
        if (!is_string($weaponId) || !array_key_exists($weaponId, $weaponBases)
            || !dalli_string_ok($item['id'] ?? null, 1, 128)
            || !is_string($item['acquiredDate'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $item['acquiredDate']) !== 1
            || !$validTimestamp($item['acquiredAt'] ?? null)
            || !is_int($item['damage'] ?? null)) {
            return false;
        }

        if ($weaponId === 'golden-gun') {
            return ($item['conditionId'] ?? null) === null
                && dalli_number_between($item['multiplier'] ?? null, 1, 1)
                && $item['damage'] === 999;
        }

        $conditionId = $item['conditionId'] ?? null;
        if (!is_string($conditionId) || !array_key_exists($conditionId, $conditionMultipliers)) {
            return false;
        }

        $multiplier = $conditionMultipliers[$conditionId];
        $expectedDamage = (int) round($weaponBases[$weaponId] * $multiplier);
        return dalli_number_between($item['multiplier'] ?? null, $multiplier, $multiplier)
            && $item['damage'] === $expectedDamage;
    };

    $validateTransaction = static function (mixed $tx) use ($weaponBases, $conditionMultipliers): bool {
        if (!is_array($tx) || !is_string($tx['type'] ?? null)) return false;

        if ($tx['type'] === 'action') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                'baseDamage', 'damage', 'efficiency', 'timestamp'
            ])) {
                return false;
            }
            $categoryId = $tx['categoryId'] ?? null;
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
                && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
                && is_string($categoryId)
                && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
                && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
                && is_int($tx['baseDamage'] ?? null) && $tx['baseDamage'] >= 1 && $tx['baseDamage'] <= 200
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 200
                && dalli_number_between($tx['efficiency'] ?? null, 0.01, 1)
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        if ($tx['type'] === 'combo') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'comboId', 'comboName', 'multiplier', 'damage',
                'sourceTransactionIds', 'timestamp'
            ])) {
                return false;
            }
            $sources = $tx['sourceTransactionIds'] ?? null;
            if (!is_array($sources) || count($sources) < 2 || count($sources) > 8) return false;
            foreach ($sources as $sourceId) {
                if (!dalli_string_ok($sourceId, 1, 128)) return false;
            }
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboId'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboName'] ?? null, 1, 80)
                && dalli_number_between($tx['multiplier'] ?? null, 1.05, 3)
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 100000
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }


        if ($tx['type'] === 'weapon') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'weaponItemId', 'weaponId', 'weaponName',
                'conditionId', 'conditionName', 'multiplier', 'damage', 'timestamp'
            ])) {
                return false;
            }

            $weaponId = $tx['weaponId'] ?? null;

            if (!is_string($weaponId) || !array_key_exists($weaponId, $weaponBases)
                || !dalli_string_ok($tx['id'] ?? null, 1, 128)
                || !dalli_string_ok($tx['weaponItemId'] ?? null, 1, 128)
                || !dalli_string_ok($tx['weaponName'] ?? null, 1, 80)
                || !is_int($tx['damage'] ?? null)
                || (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null)) === false
                || (float) $tx['timestamp'] <= 0) {
                return false;
            }

            if ($weaponId === 'golden-gun') {
                return ($tx['conditionId'] ?? null) === null
                    && ($tx['conditionName'] ?? null) === null
                    && dalli_number_between($tx['multiplier'] ?? null, 1, 1)
                    && $tx['damage'] >= 999 && $tx['damage'] <= 1000;
            }

            $conditionId = $tx['conditionId'] ?? null;
            if (!is_string($conditionId)
                || !array_key_exists($conditionId, $conditionMultipliers)
                || !dalli_string_ok($tx['conditionName'] ?? null, 1, 80)) {
                return false;
            }

            $multiplier = $conditionMultipliers[$conditionId];
            $expectedDamage = (int) round($weaponBases[$weaponId] * $multiplier);
            return dalli_number_between($tx['multiplier'] ?? null, $multiplier, $multiplier)
                && $tx['damage'] === $expectedDamage;
        }

        return false;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) return true;
        if (!is_array($card)
            || !dalli_keys_allowed($card, [
                'date', 'type', 'headline', 'copy', 'victoryXp', 'enemyHp',
                'damage', 'overkill', 'combos', 'rank', 'streak'
            ])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['victoryXp'] ?? null) && $card['victoryXp'] >= 0 && $card['victoryXp'] <= 20
            && is_int($card['enemyHp'] ?? null) && $card['enemyHp'] >= 20 && $card['enemyHp'] <= 1000
            && is_int($card['damage'] ?? null) && $card['damage'] >= 0 && $card['damage'] <= 100000
            && is_int($card['overkill'] ?? null) && $card['overkill'] >= 0 && $card['overkill'] <= 100000
            && is_int($card['combos'] ?? null) && $card['combos'] >= 0 && $card['combos'] <= 10000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };


    if (!is_array($armory)
        || !dalli_keys_allowed($armory, ['weapons'])
        || !is_array($armory['weapons'] ?? null)
        || count($armory['weapons']) > 500) {
        dalli_fail('Invalid armory.', 422);
    }

    $weaponItemIds = [];
    foreach ($armory['weapons'] as $item) {
        if (!$validateWeaponItem($item)) {
            dalli_fail('Invalid armory weapon.', 422);
        }
        if (isset($weaponItemIds[$item['id']])) {
            dalli_fail('Duplicate armory weapon id.', 422);
        }
        $weaponItemIds[$item['id']] = true;
    }

    if (!is_array($current)
        || !dalli_keys_allowed($current, [
            'date', 'maxHp', 'transactions', 'comboProgress', 'defeatedAt',
            'victoryXpAwarded', 'loot', 'dayCard'
        ])) {
        dalli_fail('Invalid current fight.', 422);
    }

    $currentDate = $current['date'] ?? '';
    $maxHp = $current['maxHp'] ?? null;
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)
        || !is_int($maxHp)
        || ($currentDate === '' ? $maxHp !== 0 : ($maxHp < 20 || $maxHp > 1000))) {
        dalli_fail('Invalid current fight metadata.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) dalli_fail('Invalid transaction data.', 422);
    }

    $comboProgress = $current['comboProgress'] ?? null;
    if (!is_array($comboProgress)) {
        dalli_fail('Invalid combo progress.', 422);
    }
    foreach ($comboProgress as $comboId => $progress) {
        if (!is_string($comboId) || !isset($comboIds[$comboId])
            || !is_array($progress)
            || !dalli_keys_allowed($progress, ['index', 'sourceTransactionIds'])
            || !is_int($progress['index'] ?? null)
            || $progress['index'] < 0 || $progress['index'] > 7
            || !is_array($progress['sourceTransactionIds'] ?? null)
            || count($progress['sourceTransactionIds']) > 7) {
            dalli_fail('Invalid combo progress data.', 422);
        }
        foreach ($progress['sourceTransactionIds'] as $sourceId) {
            if (!dalli_string_ok($sourceId, 1, 128)) dalli_fail('Invalid combo progress source.', 422);
        }
    }


    $loot = $current['loot'] ?? null;
    if (!is_array($loot)
        || !dalli_keys_allowed($loot, ['rolled', 'available', 'claimed', 'pendingWeapon'])
        || !is_bool($loot['rolled'] ?? null)
        || !is_bool($loot['available'] ?? null)
        || !is_bool($loot['claimed'] ?? null)) {
        dalli_fail('Invalid victory loot.', 422);
    }

    $pendingWeapon = $loot['pendingWeapon'] ?? null;
    if ($pendingWeapon !== null && !$validateWeaponItem($pendingWeapon)) {
        dalli_fail('Invalid pending weapon.', 422);
    }
    if (!$loot['rolled'] && ($loot['available'] || $loot['claimed'] || $pendingWeapon !== null)) {
        dalli_fail('Invalid unrolled victory loot.', 422);
    }
    if ($loot['available'] && ($pendingWeapon === null || $loot['claimed'])) {
        dalli_fail('Invalid available victory loot.', 422);
    }
    if ($loot['claimed'] && ($pendingWeapon === null || $loot['available'])) {
        dalli_fail('Invalid claimed victory loot.', 422);
    }

    if (!$validTimestamp($current['defeatedAt'] ?? null)
        || !is_int($current['victoryXpAwarded'] ?? null)
        || $current['victoryXpAwarded'] < 0 || $current['victoryXpAwarded'] > 20
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current victory data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'damage', 'baseDamage', 'maxHp', 'won', 'categoryDamage',
                'categoryBaseDamage', 'defeatedAt', 'victoryXp', 'combosLanded',
                'overkill', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['damage'] ?? null) || $day['damage'] < 0 || $day['damage'] > 100000
            || !is_int($day['baseDamage'] ?? null) || $day['baseDamage'] < 0 || $day['baseDamage'] > 100000
            || !is_int($day['maxHp'] ?? null) || $day['maxHp'] < 20 || $day['maxHp'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateDamageMap($day['categoryDamage'] ?? null)
            || !$validateDamageMap($day['categoryBaseDamage'] ?? null)
            || !$validTimestamp($day['defeatedAt'] ?? null)
            || !is_int($day['victoryXp'] ?? null) || $day['victoryXp'] < 0 || $day['victoryXp'] > 20
            || !is_int($day['combosLanded'] ?? null) || $day['combosLanded'] < 0 || $day['combosLanded'] > 10000
            || !is_int($day['overkill'] ?? null) || $day['overkill'] < 0 || $day['overkill'] > 100000
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) dalli_fail('Invalid historical transaction data.', 422);
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}


function dalli_validate_state_v5_v6(mixed $state): array
{
    $version = is_array($state) ? ($state['version'] ?? null) : null;
    $isV6 = $version === 6;
    if (!is_array($state)
        || !dalli_keys_allowed($state, ['version', 'settings', 'progression', 'current', 'history', 'inventory'])
        || !in_array($version, [5, 6], true)) {
        dalli_fail('Unsupported Dalli state.', 422);
    }

    $settings = $state['settings'] ?? null;
    $progression = $state['progression'] ?? null;
    $current = $state['current'] ?? null;
    $history = $state['history'] ?? null;
    $inventory = $state['inventory'] ?? null;

    if (!is_array($settings)
        || !dalli_keys_allowed($settings, ['fullEnemyHp', 'categories', 'actions', 'combos'])
        || !is_int($settings['fullEnemyHp'] ?? null)
        || $settings['fullEnemyHp'] < 20
        || $settings['fullEnemyHp'] > 1000) {
        dalli_fail('Invalid settings.', 422);
    }

    $categories = $settings['categories'] ?? null;
    if (!is_array($categories) || count($categories) < 1 || count($categories) > 20) {
        dalli_fail('Invalid categories.', 422);
    }

    $categoryIds = [];
    foreach ($categories as $category) {
        if (!is_array($category) || !dalli_keys_allowed($category, ['id', 'name', 'icon', 'focus', 'color'])) {
            dalli_fail('Invalid category.', 422);
        }

        $id = $category['id'] ?? null;
        if (!is_string($id) || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) !== 1 || isset($categoryIds[$id])) {
            dalli_fail('Invalid category id.', 422);
        }

        $focus = $category['focus'] ?? null;
        $validFocus = $id === 'uncategorized'
            ? (is_int($focus) || is_float($focus)) && (float) $focus === 0.0
            : dalli_number_between($focus, 0.25, 10);

        $color = $category['color'] ?? null;
        $validColor = $color === null
            || (is_string($color) && preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1);

        if (!dalli_string_ok($category['name'] ?? null, 1, 80)
            || !dalli_string_ok($category['icon'] ?? null, 1, 24)
            || !$validFocus
            || !$validColor) {
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
        if (!is_array($action)
            || !dalli_keys_allowed($action, [
                'id', 'categoryId', 'name', 'baseDamage', 'type',
                'trackVisible', 'requiredForVictory', 'requiredCount'
            ])) {
            dalli_fail('Invalid action.', 422);
        }

        $id = $action['id'] ?? null;
        $categoryId = $action['categoryId'] ?? null;
        $type = $action['type'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($actionIds[$id])) {
            dalli_fail('Invalid action id.', 422);
        }
        if (!is_string($categoryId) || !isset($categoryIds[$categoryId])) {
            dalli_fail('Invalid action category.', 422);
        }

        $requiredCount = $action['requiredCount'] ?? null;
        $validRequiredCount = $isV6
            ? is_int($requiredCount)
                && $requiredCount >= 1
                && $requiredCount <= 1000
                && ($type !== 'once' || $requiredCount === 1)
            : !array_key_exists('requiredCount', $action);

        if (!dalli_string_ok($action['name'] ?? null, 1, 100)
            || !is_int($action['baseDamage'] ?? null) || $action['baseDamage'] < 1 || $action['baseDamage'] > 200
            || !in_array($type, ['repeatable', 'once'], true)
            || !is_bool($action['trackVisible'] ?? null)
            || !is_bool($action['requiredForVictory'] ?? null)
            || (($action['requiredForVictory'] ?? false) && !($action['trackVisible'] ?? false))
            || !$validRequiredCount) {
            dalli_fail('Invalid action data.', 422);
        }
        $actionIds[$id] = true;
    }

    $combos = $settings['combos'] ?? null;
    if (!is_array($combos) || count($combos) > 100) {
        dalli_fail('Invalid combos.', 422);
    }

    $comboIds = [];
    $enabledSequences = [];
    foreach ($combos as $combo) {
        if (!is_array($combo)
            || !dalli_keys_allowed($combo, ['id', 'name', 'multiplier', 'enabled', 'actionIds'])) {
            dalli_fail('Invalid combo.', 422);
        }

        $id = $combo['id'] ?? null;
        $sequence = $combo['actionIds'] ?? null;
        if (!is_string($id) || strlen($id) < 1 || strlen($id) > 128 || isset($comboIds[$id])
            || !dalli_string_ok($combo['name'] ?? null, 1, 80)
            || !dalli_number_between($combo['multiplier'] ?? null, 1.05, 3)
            || !is_bool($combo['enabled'] ?? null)
            || !is_array($sequence) || count($sequence) > 8) {
            dalli_fail('Invalid combo data.', 422);
        }

        foreach ($sequence as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId])) {
                dalli_fail('Invalid combo action.', 422);
            }
        }

        if ($combo['enabled']) {
            if (count($sequence) < 2) {
                dalli_fail('Enabled combos need at least two actions.', 422);
            }
            $fingerprint = implode("\x1F", $sequence);
            if (isset($enabledSequences[$fingerprint])) {
                dalli_fail('Duplicate enabled combo sequence.', 422);
            }
            $enabledSequences[$fingerprint] = true;
        }

        $comboIds[$id] = true;
    }

    if (!is_array($progression)
        || !dalli_keys_allowed($progression, ['victoryXp', 'bestStreak', 'archivedStreak', 'streakThrough'])
        || !is_int($progression['victoryXp'] ?? null)
        || $progression['victoryXp'] < 0 || $progression['victoryXp'] > 1000000000
        || !is_int($progression['bestStreak'] ?? null)
        || $progression['bestStreak'] < 0 || $progression['bestStreak'] > 1000000
        || !is_int($progression['archivedStreak'] ?? null)
        || $progression['archivedStreak'] < 0 || $progression['archivedStreak'] > 1000000) {
        dalli_fail('Invalid progression data.', 422);
    }

    $streakThrough = $progression['streakThrough'] ?? '';
    if (!is_string($streakThrough)
        || ($streakThrough !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $streakThrough) !== 1)) {
        dalli_fail('Invalid streak date.', 422);
    }

    $validTimestamp = static function (mixed $value): bool {
        return $value === null
            || ((is_int($value) || is_float($value)) && (float) $value > 0);
    };

    $validateDamageMap = static function (mixed $map): bool {
        if (!is_array($map)) return false;
        foreach ($map as $categoryId => $damage) {
            if (!is_string($categoryId)
                || preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) !== 1
                || !is_int($damage) || $damage < 0 || $damage > 100000) {
                return false;
            }
        }
        return true;
    };


    $itemBases = [
        'molight-pro' => 10,
        'cosmic-laser-gun' => 20,
        'flash-tube' => 25,
        'light-rabbit-launcher' => 30,
        'sunflower-beam' => 35,
        'light-sword' => 40,
        'rite-of-illumination' => 999,
    ];
    $conditionMultipliers = [
        'questionable' => 0.5,
        'standard' => 1.0,
        'pimped' => 1.5,
        'over-engineered' => 2.0,
    ];

    $validatePawnshopItem = static function (mixed $item) use ($itemBases, $conditionMultipliers, $validTimestamp): bool {
        if (!is_array($item)
            || !dalli_keys_allowed($item, [
                'id', 'itemId', 'conditionId', 'multiplier', 'damage',
                'acquiredDate', 'acquiredAt'
            ])) {
            return false;
        }

        $itemId = $item['itemId'] ?? null;
        if (!is_string($itemId) || !array_key_exists($itemId, $itemBases)
            || !dalli_string_ok($item['id'] ?? null, 1, 128)
            || !is_string($item['acquiredDate'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $item['acquiredDate']) !== 1
            || !$validTimestamp($item['acquiredAt'] ?? null)
            || !is_int($item['damage'] ?? null)) {
            return false;
        }

        if ($itemId === 'rite-of-illumination') {
            return ($item['conditionId'] ?? null) === null
                && dalli_number_between($item['multiplier'] ?? null, 1, 1)
                && $item['damage'] === 999;
        }

        $conditionId = $item['conditionId'] ?? null;
        if (!is_string($conditionId) || !array_key_exists($conditionId, $conditionMultipliers)) {
            return false;
        }

        $multiplier = $conditionMultipliers[$conditionId];
        $expectedDamage = (int) round($itemBases[$itemId] * $multiplier);
        return dalli_number_between($item['multiplier'] ?? null, $multiplier, $multiplier)
            && $item['damage'] === $expectedDamage;
    };

    $validateTransaction = static function (mixed $tx) use ($itemBases, $conditionMultipliers, $isV6): bool {
        if (!is_array($tx) || !is_string($tx['type'] ?? null)) return false;

        if ($tx['type'] === 'action') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'actionId', 'actionName', 'categoryId', 'categoryName',
                'baseDamage', 'damage', 'efficiency', 'timestamp'
            ])) {
                return false;
            }
            $categoryId = $tx['categoryId'] ?? null;
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['actionId'] ?? null, 0, 128)
                && dalli_string_ok($tx['actionName'] ?? null, 1, 100)
                && is_string($categoryId)
                && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $categoryId) === 1
                && dalli_string_ok($tx['categoryName'] ?? null, 1, 80)
                && is_int($tx['baseDamage'] ?? null) && $tx['baseDamage'] >= 1 && $tx['baseDamage'] <= 200
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= ($isV6 ? 800 : 200)
                && dalli_number_between($tx['efficiency'] ?? null, 0.01, $isV6 ? 4 : 1)
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }

        if ($tx['type'] === 'combo') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'comboId', 'comboName', 'multiplier', 'damage',
                'sourceTransactionIds', 'timestamp'
            ])) {
                return false;
            }
            $sources = $tx['sourceTransactionIds'] ?? null;
            if (!is_array($sources) || count($sources) < 2 || count($sources) > 8) return false;
            foreach ($sources as $sourceId) {
                if (!dalli_string_ok($sourceId, 1, 128)) return false;
            }
            return dalli_string_ok($tx['id'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboId'] ?? null, 1, 128)
                && dalli_string_ok($tx['comboName'] ?? null, 1, 80)
                && dalli_number_between($tx['multiplier'] ?? null, 1.05, 3)
                && is_int($tx['damage'] ?? null) && $tx['damage'] >= 1 && $tx['damage'] <= 100000
                && (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null))
                && (float) $tx['timestamp'] > 0;
        }


        if ($tx['type'] === 'item') {
            if (!dalli_keys_allowed($tx, [
                'type', 'id', 'itemInstanceId', 'itemId', 'itemName',
                'conditionId', 'conditionName', 'multiplier', 'damage', 'timestamp'
            ])) {
                return false;
            }

            $itemId = $tx['itemId'] ?? null;

            if (!is_string($itemId) || !array_key_exists($itemId, $itemBases)
                || !dalli_string_ok($tx['id'] ?? null, 1, 128)
                || !dalli_string_ok($tx['itemInstanceId'] ?? null, 1, 128)
                || !dalli_string_ok($tx['itemName'] ?? null, 1, 80)
                || !is_int($tx['damage'] ?? null)
                || (is_int($tx['timestamp'] ?? null) || is_float($tx['timestamp'] ?? null)) === false
                || (float) $tx['timestamp'] <= 0) {
                return false;
            }

            if ($itemId === 'rite-of-illumination') {
                return ($tx['conditionId'] ?? null) === null
                    && ($tx['conditionName'] ?? null) === null
                    && dalli_number_between($tx['multiplier'] ?? null, 1, 1)
                    && $tx['damage'] >= 999 && $tx['damage'] <= 1000;
            }

            $conditionId = $tx['conditionId'] ?? null;
            if (!is_string($conditionId)
                || !array_key_exists($conditionId, $conditionMultipliers)
                || !dalli_string_ok($tx['conditionName'] ?? null, 1, 80)) {
                return false;
            }

            $multiplier = $conditionMultipliers[$conditionId];
            $expectedDamage = (int) round($itemBases[$itemId] * $multiplier);
            return dalli_number_between($tx['multiplier'] ?? null, $multiplier, $multiplier)
                && $tx['damage'] === $expectedDamage;
        }

        return false;
    };

    $validateDayCard = static function (mixed $card): bool {
        if ($card === null) return true;
        if (!is_array($card)
            || !dalli_keys_allowed($card, [
                'date', 'type', 'headline', 'copy', 'victoryXp', 'enemyHp',
                'damage', 'overkill', 'combos', 'rank', 'streak'
            ])) {
            return false;
        }

        return is_string($card['date'] ?? null)
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $card['date']) === 1
            && dalli_string_ok($card['type'] ?? null, 1, 80)
            && dalli_string_ok($card['headline'] ?? null, 1, 220)
            && dalli_string_ok($card['copy'] ?? null, 0, 500)
            && is_int($card['victoryXp'] ?? null) && $card['victoryXp'] >= 0 && $card['victoryXp'] <= 20
            && is_int($card['enemyHp'] ?? null) && $card['enemyHp'] >= 20 && $card['enemyHp'] <= 1000
            && is_int($card['damage'] ?? null) && $card['damage'] >= 0 && $card['damage'] <= 100000
            && is_int($card['overkill'] ?? null) && $card['overkill'] >= 0 && $card['overkill'] <= 100000
            && is_int($card['combos'] ?? null) && $card['combos'] >= 0 && $card['combos'] <= 10000
            && dalli_string_ok($card['rank'] ?? null, 1, 40)
            && is_int($card['streak'] ?? null) && $card['streak'] >= 0 && $card['streak'] <= 1000000;
    };


    if (!is_array($inventory)
        || !dalli_keys_allowed($inventory, ['items'])
        || !is_array($inventory['items'] ?? null)
        || count($inventory['items']) > 500) {
        dalli_fail('Invalid Pawnshop inventory.', 422);
    }

    $itemInstanceIds = [];
    foreach ($inventory['items'] as $item) {
        if (!$validatePawnshopItem($item)) {
            dalli_fail('Invalid Pawnshop item.', 422);
        }
        if (isset($itemInstanceIds[$item['id']])) {
            dalli_fail('Duplicate Pawnshop item id.', 422);
        }
        $itemInstanceIds[$item['id']] = true;
    }

    if (!is_array($current)
        || !dalli_keys_allowed($current, [
            'date', 'maxHp', 'transactions', 'comboProgress', 'requiredActionIds', 'requiredActions', 'defeatedAt',
            'victoryXpAwarded', 'loot', 'dayCard'
        ])) {
        dalli_fail('Invalid current fight.', 422);
    }

    $currentDate = $current['date'] ?? '';
    $maxHp = $current['maxHp'] ?? null;
    if (!is_string($currentDate)
        || ($currentDate !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $currentDate) !== 1)
        || !is_int($maxHp)
        || ($currentDate === '' ? $maxHp !== 0 : ($maxHp < 20 || $maxHp > 1000))) {
        dalli_fail('Invalid current fight metadata.', 422);
    }

    $transactions = $current['transactions'] ?? null;
    if (!is_array($transactions) || count($transactions) > 3000) {
        dalli_fail('Invalid transactions.', 422);
    }
    foreach ($transactions as $tx) {
        if (!$validateTransaction($tx)) dalli_fail('Invalid transaction data.', 422);
    }

    if ($isV6) {
        if (array_key_exists('requiredActionIds', $current)) {
            dalli_fail('Legacy required action snapshot is not valid for v6.', 422);
        }

        $requiredActions = $current['requiredActions'] ?? null;
        if (!is_array($requiredActions) || count($requiredActions) > 500) {
            dalli_fail('Invalid required action snapshot.', 422);
        }

        $seenRequiredActionIds = [];
        foreach ($requiredActions as $required) {
            if (!is_array($required)
                || !dalli_keys_allowed($required, ['actionId', 'requiredCount'])) {
                dalli_fail('Invalid required action requirement.', 422);
            }

            $actionId = $required['actionId'] ?? null;
            $requiredCount = $required['requiredCount'] ?? null;
            if (!is_string($actionId)
                || !isset($actionIds[$actionId])
                || isset($seenRequiredActionIds[$actionId])
                || !is_int($requiredCount)
                || $requiredCount < 1
                || $requiredCount > 1000) {
                dalli_fail('Invalid required action requirement.', 422);
            }
            $seenRequiredActionIds[$actionId] = true;
        }
    } else {
        if (array_key_exists('requiredActions', $current)) {
            dalli_fail('v6 required action snapshot is not valid for v5.', 422);
        }

        $requiredActionIds = $current['requiredActionIds'] ?? null;
        if (!is_array($requiredActionIds) || count($requiredActionIds) > 500) {
            dalli_fail('Invalid required action snapshot.', 422);
        }
        $seenRequiredActionIds = [];
        foreach ($requiredActionIds as $actionId) {
            if (!is_string($actionId) || !isset($actionIds[$actionId]) || isset($seenRequiredActionIds[$actionId])) {
                dalli_fail('Invalid required action id.', 422);
            }
            $seenRequiredActionIds[$actionId] = true;
        }
    }

    $comboProgress = $current['comboProgress'] ?? null;
    if (!is_array($comboProgress)) {
        dalli_fail('Invalid combo progress.', 422);
    }
    foreach ($comboProgress as $comboId => $progress) {
        if (!is_string($comboId) || !isset($comboIds[$comboId])
            || !is_array($progress)
            || !dalli_keys_allowed($progress, ['index', 'sourceTransactionIds'])
            || !is_int($progress['index'] ?? null)
            || $progress['index'] < 0 || $progress['index'] > 7
            || !is_array($progress['sourceTransactionIds'] ?? null)
            || count($progress['sourceTransactionIds']) > 7) {
            dalli_fail('Invalid combo progress data.', 422);
        }
        foreach ($progress['sourceTransactionIds'] as $sourceId) {
            if (!dalli_string_ok($sourceId, 1, 128)) dalli_fail('Invalid combo progress source.', 422);
        }
    }


    $loot = $current['loot'] ?? null;
    if (!is_array($loot)
        || !dalli_keys_allowed($loot, ['rolled', 'available', 'claimed', 'pendingItem'])
        || !is_bool($loot['rolled'] ?? null)
        || !is_bool($loot['available'] ?? null)
        || !is_bool($loot['claimed'] ?? null)) {
        dalli_fail('Invalid victory loot.', 422);
    }

    $pendingItem = $loot['pendingItem'] ?? null;
    if ($pendingItem !== null && !$validatePawnshopItem($pendingItem)) {
        dalli_fail('Invalid pending item.', 422);
    }
    if (!$loot['rolled'] && ($loot['available'] || $loot['claimed'] || $pendingItem !== null)) {
        dalli_fail('Invalid unrolled victory loot.', 422);
    }
    if ($loot['available'] && ($pendingItem === null || $loot['claimed'])) {
        dalli_fail('Invalid available victory loot.', 422);
    }
    if ($loot['claimed'] && ($pendingItem === null || $loot['available'])) {
        dalli_fail('Invalid claimed victory loot.', 422);
    }

    if (!$validTimestamp($current['defeatedAt'] ?? null)
        || !is_int($current['victoryXpAwarded'] ?? null)
        || $current['victoryXpAwarded'] < 0 || $current['victoryXpAwarded'] > 20
        || !$validateDayCard($current['dayCard'] ?? null)) {
        dalli_fail('Invalid current victory data.', 422);
    }

    if (!is_array($history) || count($history) > 365) {
        dalli_fail('Invalid history.', 422);
    }

    foreach ($history as $day) {
        if (!is_array($day)
            || !dalli_keys_allowed($day, [
                'date', 'damage', 'baseDamage', 'maxHp', 'won', 'categoryDamage',
                'categoryBaseDamage', 'defeatedAt', 'victoryXp', 'combosLanded',
                'overkill', 'dayCard', 'transactions'
            ])) {
            dalli_fail('Invalid history entry.', 422);
        }

        if (!is_string($day['date'] ?? null)
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $day['date']) !== 1
            || !is_int($day['damage'] ?? null) || $day['damage'] < 0 || $day['damage'] > 100000
            || !is_int($day['baseDamage'] ?? null) || $day['baseDamage'] < 0 || $day['baseDamage'] > 100000
            || !is_int($day['maxHp'] ?? null) || $day['maxHp'] < 20 || $day['maxHp'] > 1000
            || !is_bool($day['won'] ?? null)
            || !$validateDamageMap($day['categoryDamage'] ?? null)
            || !$validateDamageMap($day['categoryBaseDamage'] ?? null)
            || !$validTimestamp($day['defeatedAt'] ?? null)
            || !is_int($day['victoryXp'] ?? null) || $day['victoryXp'] < 0 || $day['victoryXp'] > 20
            || !is_int($day['combosLanded'] ?? null) || $day['combosLanded'] < 0 || $day['combosLanded'] > 10000
            || !is_int($day['overkill'] ?? null) || $day['overkill'] < 0 || $day['overkill'] > 100000
            || !$validateDayCard($day['dayCard'] ?? null)) {
            dalli_fail('Invalid history data.', 422);
        }

        $dayTransactions = $day['transactions'] ?? null;
        if (!is_array($dayTransactions) || count($dayTransactions) > 3000) {
            dalli_fail('Invalid history transactions.', 422);
        }
        foreach ($dayTransactions as $tx) {
            if (!$validateTransaction($tx)) dalli_fail('Invalid historical transaction data.', 422);
        }
    }

    $encoded = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false || strlen($encoded) > DALLI_MAX_BODY_BYTES) {
        dalli_fail('Dalli state is too large.', 413);
    }

    return $state;
}


function dalli_validate_state(mixed $state): array
{
    $version = is_array($state) ? ($state['version'] ?? null) : null;
    if ($version === 2) return dalli_validate_state_v2($state);
    if ($version === 3) return dalli_validate_state_v3($state);
    if ($version === 4) return dalli_validate_state_v4($state);
    if ($version === 5 || $version === 6) return dalli_validate_state_v5_v6($state);
    dalli_fail('Unsupported Dalli state.', 422);
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
