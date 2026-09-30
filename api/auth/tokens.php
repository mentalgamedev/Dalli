<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// Email normalization, one-use auth tokens, auth housekeeping, and auth-specific throttling helpers.
function dalli_normalize_email(string $email): ?string
{
    $email = trim($email);
    if ($email === '' || strlen($email) > 254 || preg_match('/[\r\n]/', $email)) {
        return null;
    }

    $email = function_exists('mb_strtolower')
        ? mb_strtolower($email, 'UTF-8')
        : strtolower($email);

    return filter_var($email, FILTER_VALIDATE_EMAIL) !== false ? $email : null;
}

function dalli_cleanup_auth_housekeeping(PDO $pdo): void
{
    if (!dalli_auth_schema_ready($pdo)) {
        return;
    }

    // Keep opportunistic cleanup bounded so an attacker cannot turn one request
    // into an unbounded maintenance job after a long backlog.
    $pdo->exec(
        "DELETE FROM auth_sessions
         WHERE expires_at <= NOW()
         LIMIT 200"
    );
    $pdo->exec(
        "DELETE FROM auth_tokens
         WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
            OR (consumed_at IS NOT NULL AND consumed_at < DATE_SUB(NOW(), INTERVAL 1 DAY))
         LIMIT 200"
    );
    $pdo->exec(
        "DELETE FROM auth_rate_limits
         WHERE updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
         LIMIT 200"
    );
    $pdo->exec(
        "DELETE FROM users
         WHERE status = 'pending'
           AND email_verified_at IS NULL
           AND created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
         LIMIT 100"
    );
}

function dalli_issue_auth_token(
    PDO $pdo,
    int $userId,
    string $purpose,
    int $ttlSeconds,
    array $metadata = []
): array {
    if (!dalli_auth_schema_ready($pdo)) {
        throw new RuntimeException('Modern authentication storage is unavailable.');
    }
    if (preg_match('/^[a-z_]{1,32}$/', $purpose) !== 1) {
        throw new InvalidArgumentException('Invalid auth token purpose.');
    }
    if ($ttlSeconds < 60 || $ttlSeconds > 2592000) {
        throw new InvalidArgumentException('Invalid auth token lifetime.');
    }

    $selector = bin2hex(random_bytes(16));
    $secret = bin2hex(random_bytes(32));
    $expires = time() + $ttlSeconds;
    $metadataJson = $metadata === []
        ? null
        : json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

    $delete = $pdo->prepare(
        'DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?'
    );
    $delete->execute([$userId, $purpose]);

    $insert = $pdo->prepare(
        'INSERT INTO auth_tokens
            (user_id, purpose, selector, secret_hash, metadata_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, NOW(), FROM_UNIXTIME(?))'
    );
    $insert->execute([
        $userId,
        $purpose,
        $selector,
        hash('sha256', $secret),
        $metadataJson,
        $expires,
    ]);

    return [
        'token' => $selector . '.' . $secret,
        'selector' => $selector,
        'expiresAt' => $expires,
    ];
}

function dalli_parse_auth_token(string $raw): ?array
{
    $parts = explode('.', trim($raw));
    if (count($parts) !== 2) {
        return null;
    }

    [$selector, $secret] = $parts;
    if (preg_match('/^[a-f0-9]{32}$/', $selector) !== 1
        || preg_match('/^[a-f0-9]{64}$/', $secret) !== 1) {
        return null;
    }

    return ['selector' => $selector, 'secret' => $secret];
}

function dalli_consume_auth_token(PDO $pdo, string $purpose, array $token): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, user_id, secret_hash, metadata_json,
                UNIX_TIMESTAMP(expires_at) AS expires_at
         FROM auth_tokens
         WHERE purpose = ? AND selector = ? AND consumed_at IS NULL
         LIMIT 1
         FOR UPDATE'
    );
    $stmt->execute([$purpose, $token['selector'] ?? '']);
    $row = $stmt->fetch();

    if (!is_array($row)
        || (int) ($row['expires_at'] ?? 0) <= time()
        || !hash_equals((string) ($row['secret_hash'] ?? ''), hash('sha256', (string) ($token['secret'] ?? '')))) {
        return null;
    }

    $update = $pdo->prepare(
        'UPDATE auth_tokens SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL'
    );
    $update->execute([(int) $row['id']]);

    $metadata = [];
    $metadataRaw = $row['metadata_json'] ?? null;
    if (is_string($metadataRaw) && $metadataRaw !== '') {
        try {
            $decoded = json_decode($metadataRaw, true, 16, JSON_THROW_ON_ERROR);
            if (is_array($decoded)) {
                $metadata = $decoded;
            }
        } catch (JsonException $e) {
            $metadata = [];
        }
    }

    return [
        'id' => (int) $row['id'],
        'userId' => (int) $row['user_id'],
        'metadata' => $metadata,
    ];
}

function dalli_verification_url(string $token): string
{
    $origin = rtrim(dalli_config('app', 'origin'), '/');
    return $origin . '/#verify=' . rawurlencode($token);
}

function dalli_public_security_snapshot(PDO $pdo): array
{
    $limits = dalli_security_limits();
    $pendingStmt = $pdo->query("SELECT COUNT(*) FROM users WHERE status = 'pending'");
    $pending = (int) $pendingStmt->fetchColumn();

    $registrationHour = dalli_rate_status('pub_reg_hour', 'global', 3600, $limits['registrationsPerHour']);
    $registrationDay = dalli_rate_status('pub_reg_day', 'global', 86400, $limits['registrationsPerDay']);
    $mailHour = dalli_rate_status('pub_mail_hour', 'global', 3600, $limits['mailPerHour']);
    $mailDay = dalli_rate_status('pub_mail_day', 'global', 86400, $limits['mailPerDay']);

    $registrationOpen = $pending < $limits['maxPendingAccounts']
        && $registrationHour['blockedUntil'] === null
        && $registrationHour['used'] < $registrationHour['limit']
        && $registrationDay['blockedUntil'] === null
        && $registrationDay['used'] < $registrationDay['limit'];

    $mailOpen = $mailHour['blockedUntil'] === null
        && $mailHour['used'] < $mailHour['limit']
        && $mailDay['blockedUntil'] === null
        && $mailDay['used'] < $mailDay['limit'];

    return [
        'registrationOpen' => $registrationOpen,
        'mailOpen' => $mailOpen,
        'pendingAccounts' => $pending,
        'maxPendingAccounts' => $limits['maxPendingAccounts'],
        'registrationHour' => $registrationHour,
        'registrationDay' => $registrationDay,
        'mailHour' => $mailHour,
        'mailDay' => $mailDay,
    ];
}

function dalli_public_circuit_ready(?PDO $pdo = null): bool
{
    if (!dalli_auth_schema_ready()) {
        return false;
    }

    try {
        $snapshot = dalli_public_security_snapshot($pdo ?? dalli_pdo());
        return $snapshot['registrationOpen'] && $snapshot['mailOpen'];
    } catch (Throwable $e) {
        error_log('MoLife public signup circuit status failed: ' . $e->getMessage());
        return false;
    }
}

function dalli_public_capacity_check(PDO $pdo): void
{
    $limits = dalli_security_limits();
    $stmt = $pdo->query("SELECT COUNT(*) FROM users WHERE status = 'pending'");
    $pending = (int) $stmt->fetchColumn();

    if ($pending >= $limits['maxPendingAccounts']) {
        dalli_fail('Public account creation is temporarily unavailable.', 503);
    }
}

function dalli_public_registration_guard(string $email): void
{
    $limits = dalli_security_limits();
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

    try {
        $allowed = dalli_rate_consume_strict('pub_reg_ip', $ip, 5, 3600)
            && dalli_rate_consume_strict('pub_reg_email', $email, 3, 3600);

        if (!$allowed) {
            header('Retry-After: 3600');
            dalli_fail('Too many account creation attempts. Try again later.', 429);
        }

        $globalAllowed = dalli_rate_consume_strict(
            'pub_reg_hour',
            'global',
            $limits['registrationsPerHour'],
            3600
        ) && dalli_rate_consume_strict(
            'pub_reg_day',
            'global',
            $limits['registrationsPerDay'],
            86400
        );

        if (!$globalAllowed) {
            dalli_fail('Public account creation is temporarily unavailable.', 503);
        }
    } catch (Throwable $e) {
        error_log('MoLife public registration abuse control failed: ' . $e->getMessage());
        dalli_fail('Public account creation is temporarily unavailable.', 503);
    }
}

function dalli_public_mail_budget_guard(): void
{
    $limits = dalli_security_limits();

    try {
        $allowed = dalli_rate_consume_strict(
            'pub_mail_hour',
            'global',
            $limits['mailPerHour'],
            3600
        ) && dalli_rate_consume_strict(
            'pub_mail_day',
            'global',
            $limits['mailPerDay'],
            86400
        );

        if (!$allowed) {
            dalli_fail('Account email is temporarily unavailable. Try again later.', 503);
        }
    } catch (Throwable $e) {
        error_log('MoLife public mail abuse control failed: ' . $e->getMessage());
        dalli_fail('Account email is temporarily unavailable. Try again later.', 503);
    }
}

function dalli_existing_account_notice_allowed(string $email): bool
{
    try {
        return dalli_rate_consume_strict('dup_notice', $email, 1, 86400);
    } catch (Throwable $e) {
        // Duplicate-account notices are optional privacy notifications. On any
        // limiter failure, suppress mail instead of risking an email flood.
        error_log('MoLife duplicate notice limiter failed: ' . $e->getMessage());
        return false;
    }
}

function dalli_verification_resend_guard(string $email): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');

    try {
        $allowed = dalli_rate_consume_strict('verify_resend_ip', $ip, 10, 3600)
            && dalli_rate_consume_strict('verify_resend_email', $email, 3, 3600);

        if (!$allowed) {
            header('Retry-After: 3600');
            dalli_fail('Too many activation requests. Try again later.', 429);
        }
    } catch (Throwable $e) {
        error_log('MoLife verification resend abuse control failed: ' . $e->getMessage());
        dalli_fail('Activation email is temporarily unavailable. Try again later.', 503);
    }
}

function dalli_verification_attempt_rate_check(): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_check('verify_ip', $ip, 3600);
}

function dalli_verification_attempt_rate_failure(): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_failure('verify_ip', $ip, 30, 3600, 1800);
}


function dalli_owner_setup_token(): string
{
    $token = dalli_config('app', 'owner_setup_token');
    if ($token !== '') {
        return $token;
    }

    // Compatibility with the earlier setup.php configuration.
    return dalli_config('app', 'setup_token');
}

function dalli_registration_rate_check(): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_check('register_ip', $ip, 3600);
}

function dalli_registration_rate_failure(): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_failure('register_ip', $ip, 10, 3600, 1800);
}

function dalli_registration_rate_clear(): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_clear('register_ip', $ip);
}
