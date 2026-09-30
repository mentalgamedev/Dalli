<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// Authentication rate limiting and login throttle helpers.
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

function dalli_rate_consume_strict(
    string $action,
    string $subject,
    int $limit,
    int $windowSeconds
): bool {
    if (!dalli_auth_schema_ready()) {
        throw new RuntimeException('Authentication rate-limit storage is unavailable.');
    }

    $pdo = dalli_pdo();
    $bucket = dalli_rate_bucket_hash($action, $subject);
    $now = time();
    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare(
            'SELECT UNIX_TIMESTAMP(window_started_at) AS window_started,
                    hit_count,
                    UNIX_TIMESTAMP(blocked_until) AS blocked_until
             FROM auth_rate_limits
             WHERE action = ? AND bucket_hash = ?
             FOR UPDATE'
        );
        $stmt->execute([$action, $bucket]);
        $row = $stmt->fetch();

        $windowStarted = $now;
        $count = 0;
        $blockedUntil = 0;

        if (is_array($row)) {
            $storedWindow = (int) ($row['window_started'] ?? 0);
            if ($storedWindow >= $now - $windowSeconds) {
                $windowStarted = $storedWindow;
                $count = (int) ($row['hit_count'] ?? 0);
                $blockedUntil = (int) ($row['blocked_until'] ?? 0);
            }
        }

        if ($blockedUntil > $now || $count >= $limit) {
            $pdo->rollBack();
            return false;
        }

        $count++;
        $blockAt = $count >= $limit
            ? max($now + 1, $windowStarted + $windowSeconds)
            : null;

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
            $blockAt === null ? null : date('Y-m-d H:i:s', $blockAt),
        ]);
        $pdo->commit();
        return true;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw new RuntimeException('Authentication abuse control is unavailable.', 0, $e);
    }
}

function dalli_rate_status(string $action, string $subject, int $windowSeconds, int $limit): array
{
    if (!dalli_auth_schema_ready()) {
        throw new RuntimeException('Authentication rate-limit storage is unavailable.');
    }

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
    $now = time();

    if (!is_array($row) || (int) ($row['window_started'] ?? 0) < $now - $windowSeconds) {
        return ['used' => 0, 'limit' => $limit, 'blockedUntil' => null];
    }

    return [
        'used' => min($limit, max(0, (int) ($row['hit_count'] ?? 0))),
        'limit' => $limit,
        'blockedUntil' => (int) ($row['blocked_until'] ?? 0) > $now
            ? (int) $row['blocked_until']
            : null,
    ];
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
