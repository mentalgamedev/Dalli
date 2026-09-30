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

    $pdo->exec(
        "DELETE FROM auth_tokens
         WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
            OR (consumed_at IS NOT NULL AND consumed_at < DATE_SUB(NOW(), INTERVAL 1 DAY))"
    );
    $pdo->exec(
        "DELETE FROM auth_rate_limits
         WHERE updated_at < DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    $pdo->exec(
        "DELETE FROM users
         WHERE status = 'pending'
           AND email_verified_at IS NULL
           AND created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)"
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

function dalli_public_registration_rate_check(string $email): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_check('public_register_ip', $ip, 3600);
    dalli_rate_check('public_register_email', $email, 3600);
}

function dalli_public_registration_rate_hit(string $email): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_failure('public_register_ip', $ip, 5, 3600, 3600);
    dalli_rate_failure('public_register_email', $email, 3, 3600, 3600);
}

function dalli_verification_resend_rate_check(string $email): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_check('verify_resend_ip', $ip, 3600);
    dalli_rate_check('verify_resend_email', $email, 3600);
}

function dalli_verification_resend_rate_hit(string $email): void
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    dalli_rate_failure('verify_resend_ip', $ip, 10, 3600, 3600);
    dalli_rate_failure('verify_resend_email', $email, 3, 3600, 3600);
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
