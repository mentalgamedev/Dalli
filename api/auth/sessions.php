<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// Remembered-device cookie and persistent-session lifecycle.
function dalli_remember_cookie_options(int $expires): array
{
    return [
        'expires' => $expires,
        'path' => '/',
        'domain' => '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ];
}

function dalli_set_remember_cookie(int $userId, string $selector, string $validator, int $expires): void
{
    $value = $userId . '.' . $selector . '.' . $validator;
    setcookie(DALLI_REMEMBER_COOKIE, $value, dalli_remember_cookie_options($expires));
    $_COOKIE[DALLI_REMEMBER_COOKIE] = $value;
    $_SESSION['remember_selector'] = $selector;
}

function dalli_clear_remember_cookie(): void
{
    setcookie(DALLI_REMEMBER_COOKIE, '', dalli_remember_cookie_options(time() - 42000));
    unset($_COOKIE[DALLI_REMEMBER_COOKIE]);
    unset($_SESSION['remember_selector']);
}

function dalli_parse_remember_cookie(): ?array
{
    $raw = $_COOKIE[DALLI_REMEMBER_COOKIE] ?? '';
    if (!is_string($raw) || $raw === '') {
        return null;
    }

    $parts = explode('.', $raw);
    if (count($parts) !== 3) {
        return null;
    }

    [$userId, $selector, $validator] = $parts;
    if (!ctype_digit($userId)
        || preg_match('/^[a-f0-9]{32}$/', $selector) !== 1
        || preg_match('/^[a-f0-9]{64}$/', $validator) !== 1) {
        return null;
    }

    return [
        'userId' => (int) $userId,
        'selector' => $selector,
        'validator' => $validator,
    ];
}

function dalli_clean_remember_tokens(array $tokens): array
{
    $now = time();
    $clean = [];

    foreach ($tokens as $token) {
        if (!is_array($token)) {
            continue;
        }

        $selector = $token['selector'] ?? '';
        $hash = $token['hash'] ?? '';
        $expires = (int) ($token['expires'] ?? 0);

        if (!is_string($selector) || preg_match('/^[a-f0-9]{32}$/', $selector) !== 1
            || !is_string($hash) || preg_match('/^[a-f0-9]{64}$/', $hash) !== 1
            || $expires <= $now) {
            continue;
        }

        $clean[] = [
            'selector' => $selector,
            'hash' => $hash,
            'created' => (int) ($token['created'] ?? $now),
            'lastUsed' => (int) ($token['lastUsed'] ?? $now),
            'expires' => $expires,
        ];
    }

    usort($clean, static fn(array $a, array $b): int => $b['lastUsed'] <=> $a['lastUsed']);
    return array_slice($clean, 0, DALLI_MAX_REMEMBER_TOKENS);
}

function dalli_remove_remember_selector(array $tokens, string $selector): array
{
    return array_values(array_filter(
        $tokens,
        static fn($token): bool => !is_array($token) || ($token['selector'] ?? '') !== $selector
    ));
}

function dalli_trim_modern_sessions(PDO $pdo, int $userId): void
{
    $pdo->prepare('DELETE FROM auth_sessions WHERE user_id = ? AND expires_at <= NOW()')->execute([$userId]);

    $stmt = $pdo->prepare(
        'SELECT id FROM auth_sessions WHERE user_id = ? ORDER BY last_used_at DESC, id DESC'
    );
    $stmt->execute([$userId]);
    $ids = array_map('intval', array_column($stmt->fetchAll(), 'id'));

    foreach (array_slice($ids, DALLI_MAX_REMEMBER_TOKENS) as $id) {
        $pdo->prepare('DELETE FROM auth_sessions WHERE id = ? AND user_id = ?')->execute([$id, $userId]);
    }
}

function dalli_create_modern_remember(PDO $pdo, int $userId): void
{
    $selector = bin2hex(random_bytes(16));
    $validator = bin2hex(random_bytes(32));
    $now = time();
    $expires = $now + DALLI_REMEMBER_SECONDS;

    $stmt = $pdo->prepare(
        'INSERT INTO auth_sessions
            (user_id, selector, validator_hash, created_at, last_used_at, expires_at)
         VALUES (?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), FROM_UNIXTIME(?))'
    );
    $stmt->execute([
        $userId,
        $selector,
        hash('sha256', $validator),
        $now,
        $now,
        $expires,
    ]);

    dalli_trim_modern_sessions($pdo, $userId);
    dalli_set_remember_cookie($userId, $selector, $validator, $expires);
}

function dalli_remove_legacy_remember(PDO $pdo, int $userId, string $selector): void
{
    $row = dalli_user_state_row($pdo, $userId, true);
    if ($row === null) {
        return;
    }

    $envelope = dalli_envelope_from_row($row);
    $tokens = dalli_clean_remember_tokens($envelope['auth']['rememberTokens'] ?? []);
    $envelope['auth']['rememberTokens'] = dalli_remove_remember_selector($tokens, $selector);
    dalli_update_envelope_only($pdo, $userId, $envelope);
}

function dalli_revoke_current_remember(PDO $pdo): void
{
    $cookie = dalli_parse_remember_cookie();
    if ($cookie === null) {
        dalli_clear_remember_cookie();
        return;
    }

    try {
        if (dalli_auth_schema_ready($pdo)) {
            $stmt = $pdo->prepare(
                'DELETE FROM auth_sessions WHERE user_id = ? AND selector = ?'
            );
            $stmt->execute([$cookie['userId'], $cookie['selector']]);

            // A cookie issued before the schema migration may still live in the
            // legacy envelope. Remove it too during the transition.
            $pdo->beginTransaction();
            try {
                dalli_remove_legacy_remember($pdo, $cookie['userId'], $cookie['selector']);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        } else {
            $pdo->beginTransaction();
            try {
                dalli_remove_legacy_remember($pdo, $cookie['userId'], $cookie['selector']);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $e;
            }
        }
    } catch (Throwable $e) {
        error_log('MoLife remember-token revoke failed: ' . $e->getMessage());
    }

    dalli_clear_remember_cookie();
}

function dalli_issue_remember(PDO $pdo, int $userId): void
{
    // Logging into another account in the same browser revokes the old browser token.
    dalli_revoke_current_remember($pdo);

    if (dalli_auth_schema_ready($pdo)) {
        dalli_create_modern_remember($pdo, $userId);
        return;
    }

    $selector = bin2hex(random_bytes(16));
    $validator = bin2hex(random_bytes(32));
    $now = time();
    $expires = $now + DALLI_REMEMBER_SECONDS;

    $pdo->beginTransaction();
    try {
        $row = dalli_user_state_row($pdo, $userId, true);
        $envelope = dalli_envelope_from_row($row);
        $tokens = dalli_clean_remember_tokens($envelope['auth']['rememberTokens'] ?? []);
        $tokens[] = [
            'selector' => $selector,
            'hash' => hash('sha256', $validator),
            'created' => $now,
            'lastUsed' => $now,
            'expires' => $expires,
        ];
        $envelope['auth']['rememberTokens'] = dalli_clean_remember_tokens($tokens);
        dalli_update_envelope_only($pdo, $userId, $envelope);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    dalli_set_remember_cookie($userId, $selector, $validator, $expires);
}

function dalli_try_legacy_remember(PDO $pdo, array $cookie): ?array
{
    $stmt = $pdo->prepare(
        dalli_auth_schema_ready($pdo)
            ? "SELECT id, username, status FROM users WHERE id = ? LIMIT 1"
            : "SELECT id, username FROM users WHERE id = ? LIMIT 1"
    );
    $stmt->execute([$cookie['userId']]);
    $user = $stmt->fetch();
    if (!is_array($user)
        || (dalli_auth_schema_ready($pdo) && (string) ($user['status'] ?? '') !== 'active')) {
        return null;
    }

    $valid = false;
    $pdo->beginTransaction();
    try {
        $row = dalli_user_state_row($pdo, $cookie['userId'], true);
        $envelope = dalli_envelope_from_row($row);
        $tokens = dalli_clean_remember_tokens($envelope['auth']['rememberTokens'] ?? []);

        foreach ($tokens as $token) {
            if (($token['selector'] ?? '') !== $cookie['selector']) {
                continue;
            }
            $valid = hash_equals((string) $token['hash'], hash('sha256', $cookie['validator']));
            break;
        }

        if ($valid) {
            $envelope['auth']['rememberTokens'] = dalli_remove_remember_selector($tokens, $cookie['selector']);
            dalli_update_envelope_only($pdo, $cookie['userId'], $envelope);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    return $valid ? $user : null;
}

function dalli_try_remember_login(PDO $pdo): ?array
{
    $cookie = dalli_parse_remember_cookie();
    if ($cookie === null) {
        if (isset($_COOKIE[DALLI_REMEMBER_COOKIE])) {
            dalli_clear_remember_cookie();
        }
        return null;
    }

    if (dalli_auth_schema_ready($pdo)) {
        $stmt = $pdo->prepare(
            "SELECT s.id AS session_id, s.validator_hash,
                    UNIX_TIMESTAMP(s.created_at) AS created_at,
                    UNIX_TIMESTAMP(s.expires_at) AS expires_at,
                    u.id, u.username, u.status
             FROM auth_sessions s
             JOIN users u ON u.id = s.user_id
             WHERE s.user_id = ? AND s.selector = ?
             LIMIT 1"
        );
        $stmt->execute([$cookie['userId'], $cookie['selector']]);
        $row = $stmt->fetch();

        if (is_array($row)) {
            $valid = (string) ($row['status'] ?? '') === 'active'
                && (int) ($row['expires_at'] ?? 0) > time()
                && hash_equals((string) $row['validator_hash'], hash('sha256', $cookie['validator']));

            if (!$valid) {
                $pdo->prepare('DELETE FROM auth_sessions WHERE id = ?')->execute([(int) $row['session_id']]);
                dalli_clear_remember_cookie();
                return null;
            }

            $newValidator = bin2hex(random_bytes(32));
            $now = time();
            // Rotate the secret on every use, but never extend the original
            // remember-me expiry. A stolen token therefore has a hard lifetime.
            $newExpires = (int) $row['expires_at'];
            $update = $pdo->prepare(
                'UPDATE auth_sessions
                 SET validator_hash = ?, last_used_at = FROM_UNIXTIME(?)
                 WHERE id = ?'
            );
            $update->execute([
                hash('sha256', $newValidator),
                $now,
                (int) $row['session_id'],
            ]);
            dalli_set_remember_cookie(
                (int) $row['id'],
                $cookie['selector'],
                $newValidator,
                $newExpires
            );

            return dalli_start_user_session($pdo, (int) $row['id'], (string) $row['username']);
        }

        // Lazy migration: an existing browser token from before the schema
        // migration is accepted once, removed from user_state, and re-issued
        // into auth_sessions.
        try {
            $legacyUser = dalli_try_legacy_remember($pdo, $cookie);
            if (is_array($legacyUser)) {
                dalli_create_modern_remember($pdo, (int) $legacyUser['id']);
                return dalli_start_user_session(
                    $pdo,
                    (int) $legacyUser['id'],
                    (string) $legacyUser['username']
                );
            }
        } catch (Throwable $e) {
            error_log('MoLife legacy remember-token migration failed: ' . $e->getMessage());
        }

        dalli_clear_remember_cookie();
        return null;
    }

    try {
        $user = dalli_try_legacy_remember($pdo, $cookie);
        if (!is_array($user)) {
            dalli_clear_remember_cookie();
            return null;
        }

        // Legacy mode rotates by issuing a new token.
        dalli_issue_remember($pdo, (int) $user['id']);
        return dalli_start_user_session($pdo, (int) $user['id'], (string) $user['username']);
    } catch (Throwable $e) {
        error_log('MoLife remember-token validation failed: ' . $e->getMessage());
        return null;
    }
}
