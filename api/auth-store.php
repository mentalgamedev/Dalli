<?php
declare(strict_types=1);

if (!defined('DALLI_SESSION_NAME')) {
    require __DIR__ . '/bootstrap.php';
}

const DALLI_REMEMBER_COOKIE = 'DALLIREMEMBER';
const DALLI_REMEMBER_SECONDS = 2592000; // 30 days
const DALLI_INVITE_SECONDS = 604800; // 7 days
const DALLI_MAX_REMEMBER_TOKENS = 8;
const DALLI_MAX_INVITES = 20;

function dalli_empty_envelope(): array
{
    return [
        'serverVersion' => 1,
        'state' => null,
        'auth' => [
            'rememberTokens' => [],
            'invites' => [],
        ],
    ];
}

function dalli_normalize_envelope(array $decoded): array
{
    if (($decoded['serverVersion'] ?? null) === 1 && array_key_exists('state', $decoded)) {
        $envelope = dalli_empty_envelope();
        $envelope['state'] = $decoded['state'];

        $auth = $decoded['auth'] ?? null;
        if (is_array($auth)) {
            $remember = $auth['rememberTokens'] ?? [];
            $invites = $auth['invites'] ?? [];
            $envelope['auth']['rememberTokens'] = is_array($remember) ? array_values($remember) : [];
            $envelope['auth']['invites'] = is_array($invites) ? array_values($invites) : [];
        }

        return $envelope;
    }

    // Backward compatibility: early cloud state was stored directly.
    $envelope = dalli_empty_envelope();
    $envelope['state'] = $decoded;
    return $envelope;
}

function dalli_decode_envelope(string $json): array
{
    try {
        $decoded = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new RuntimeException('Stored MoLife data is invalid.', 0, $e);
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Stored MoLife data is invalid.');
    }

    return dalli_normalize_envelope($decoded);
}

function dalli_encode_envelope(array $envelope): string
{
    $json = json_encode(
        $envelope,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );

    if (strlen($json) > DALLI_MAX_BODY_BYTES + 65536) {
        throw new RuntimeException('Stored MoLife envelope is too large.');
    }

    return $json;
}

function dalli_user_state_row(PDO $pdo, int $userId, bool $forUpdate = false): ?array
{
    $sql = 'SELECT state_json, revision, updated_at FROM user_state WHERE user_id = ? LIMIT 1';
    if ($forUpdate) {
        $sql .= ' FOR UPDATE';
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    return is_array($row) ? $row : null;
}

function dalli_envelope_from_row(?array $row): array
{
    if ($row === null) {
        return dalli_empty_envelope();
    }

    return dalli_decode_envelope((string) $row['state_json']);
}

function dalli_store_envelope(PDO $pdo, int $userId, array $envelope, int $revision = 0): void
{
    $json = dalli_encode_envelope($envelope);
    $stmt = $pdo->prepare(
        'INSERT INTO user_state (user_id, state_json, revision)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)'
    );
    $stmt->execute([$userId, $json, $revision]);
}

function dalli_update_envelope_only(PDO $pdo, int $userId, array $envelope): void
{
    $json = dalli_encode_envelope($envelope);
    $stmt = $pdo->prepare('UPDATE user_state SET state_json = ? WHERE user_id = ?');
    $stmt->execute([$json, $userId]);

    if ($stmt->rowCount() === 0) {
        $check = $pdo->prepare('SELECT 1 FROM user_state WHERE user_id = ? LIMIT 1');
        $check->execute([$userId]);
        if ($check->fetchColumn() === false) {
            dalli_store_envelope($pdo, $userId, $envelope, 0);
        }
    }
}

function dalli_owner_id(PDO $pdo): ?int
{
    if (dalli_auth_schema_ready($pdo)) {
        $stmt = $pdo->query(
            "SELECT id FROM users WHERE role = 'owner' AND status = 'active' ORDER BY id ASC LIMIT 1"
        );
        $value = $stmt->fetchColumn();
        return $value === false ? null : (int) $value;
    }

    $stmt = $pdo->query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    $value = $stmt->fetchColumn();
    return $value === false ? null : (int) $value;
}

function dalli_is_owner(PDO $pdo, int $userId): bool
{
    if (dalli_auth_schema_ready($pdo)) {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM users WHERE id = ? AND role = 'owner' AND status = 'active' LIMIT 1"
        );
        $stmt->execute([$userId]);
        return $stmt->fetchColumn() !== false;
    }

    $ownerId = dalli_owner_id($pdo);
    return $ownerId !== null && $ownerId === $userId;
}

function dalli_session_user_payload(PDO $pdo, int $userId, string $username): array
{
    $payload = [
        'id' => $userId,
        'username' => $username,
        'isOwner' => dalli_is_owner($pdo, $userId),
    ];

    if (dalli_auth_schema_ready($pdo)) {
        $stmt = $pdo->prepare(
            'SELECT email, role, status, email_verified_at FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if (is_array($row)) {
            $payload['role'] = (string) ($row['role'] ?? 'user');
            $payload['status'] = (string) ($row['status'] ?? 'active');
            $payload['email'] = $row['email'] === null ? null : (string) $row['email'];
            $payload['emailVerified'] = $row['email_verified_at'] !== null;
        }
    }

    return $payload;
}

function dalli_start_user_session(PDO $pdo, int $userId, string $username): array
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['username'] = $username;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['authenticated_at'] = time();
    $_SESSION['last_activity_at'] = time();

    return dalli_session_user_payload($pdo, $userId, $username);
}

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
    $stmt = $pdo->prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$cookie['userId']]);
    $user = $stmt->fetch();
    if (!is_array($user)) {
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
            "SELECT s.id AS session_id, s.validator_hash, UNIX_TIMESTAMP(s.expires_at) AS expires_at,
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
            $newExpires = $now + DALLI_REMEMBER_SECONDS;
            $update = $pdo->prepare(
                'UPDATE auth_sessions
                 SET validator_hash = ?, last_used_at = FROM_UNIXTIME(?), expires_at = FROM_UNIXTIME(?)
                 WHERE id = ?'
            );
            $update->execute([
                hash('sha256', $newValidator),
                $now,
                $newExpires,
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

function dalli_clean_invites(array $invites): array
{
    $now = time();
    $clean = [];

    foreach ($invites as $invite) {
        if (!is_array($invite)) {
            continue;
        }

        $id = $invite['id'] ?? '';
        $hash = $invite['hash'] ?? '';
        $expires = (int) ($invite['expires'] ?? 0);

        if (!is_string($id) || preg_match('/^[a-f0-9]{16}$/', $id) !== 1
            || !is_string($hash) || preg_match('/^[a-f0-9]{64}$/', $hash) !== 1
            || $expires <= $now) {
            continue;
        }

        $clean[] = [
            'id' => $id,
            'hash' => $hash,
            'created' => (int) ($invite['created'] ?? $now),
            'expires' => $expires,
        ];
    }

    usort($clean, static fn(array $a, array $b): int => $b['created'] <=> $a['created']);
    return array_slice($clean, 0, DALLI_MAX_INVITES);
}

function dalli_parse_invite_token(string $raw): ?array
{
    $parts = explode('.', trim($raw));
    if (count($parts) !== 2) {
        return null;
    }

    [$id, $secret] = $parts;
    if (preg_match('/^[a-f0-9]{16}$/', $id) !== 1
        || preg_match('/^[a-f0-9]{64}$/', $secret) !== 1) {
        return null;
    }

    return ['id' => $id, 'secret' => $secret];
}

function dalli_invite_matches(array $invite, array $token): bool
{
    return ($invite['id'] ?? '') === $token['id']
        && hash_equals((string) ($invite['hash'] ?? ''), hash('sha256', $token['secret']))
        && (int) ($invite['expires'] ?? 0) > time();
}

function dalli_create_invite(PDO $pdo, int $ownerId): array
{
    $id = bin2hex(random_bytes(8));
    $secret = bin2hex(random_bytes(32));
    $created = time();
    $expires = $created + DALLI_INVITE_SECONDS;

    if (dalli_auth_schema_ready($pdo)) {
        $pdo->prepare(
            "DELETE FROM auth_tokens
             WHERE purpose = 'invite' AND user_id = ? AND (expires_at <= NOW() OR consumed_at IS NOT NULL)"
        )->execute([$ownerId]);

        $stmt = $pdo->prepare(
            "INSERT INTO auth_tokens
                (user_id, purpose, selector, secret_hash, created_at, expires_at)
             VALUES (?, 'invite', ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?))"
        );
        $stmt->execute([$ownerId, $id, hash('sha256', $secret), $created, $expires]);

        $list = $pdo->prepare(
            "SELECT id FROM auth_tokens
             WHERE purpose = 'invite' AND user_id = ? AND consumed_at IS NULL AND expires_at > NOW()
             ORDER BY created_at DESC, id DESC"
        );
        $list->execute([$ownerId]);
        $ids = array_map('intval', array_column($list->fetchAll(), 'id'));
        foreach (array_slice($ids, DALLI_MAX_INVITES) as $tokenId) {
            $pdo->prepare('DELETE FROM auth_tokens WHERE id = ? AND user_id = ?')->execute([$tokenId, $ownerId]);
        }
    } else {
        $pdo->beginTransaction();
        try {
            $row = dalli_user_state_row($pdo, $ownerId, true);
            $envelope = dalli_envelope_from_row($row);
            $invites = dalli_clean_invites($envelope['auth']['invites'] ?? []);
            $invites[] = [
                'id' => $id,
                'hash' => hash('sha256', $secret),
                'created' => $created,
                'expires' => $expires,
            ];
            $envelope['auth']['invites'] = dalli_clean_invites($invites);
            dalli_update_envelope_only($pdo, $ownerId, $envelope);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    $origin = rtrim(dalli_config('app', 'origin'), '/');
    $token = $id . '.' . $secret;

    return [
        'id' => $id,
        'createdAt' => $created,
        'expiresAt' => $expires,
        // Fragment keeps the secret out of HTTP requests and server logs.
        'url' => $origin . '/#invite=' . rawurlencode($token),
    ];
}

function dalli_list_invites(PDO $pdo, int $ownerId): array
{
    $result = [];

    if (dalli_auth_schema_ready($pdo)) {
        $pdo->prepare(
            "DELETE FROM auth_tokens
             WHERE purpose = 'invite' AND user_id = ? AND (expires_at <= NOW() OR consumed_at IS NOT NULL)"
        )->execute([$ownerId]);

        $stmt = $pdo->prepare(
            "SELECT selector,
                    UNIX_TIMESTAMP(created_at) AS created_at,
                    UNIX_TIMESTAMP(expires_at) AS expires_at
             FROM auth_tokens
             WHERE purpose = 'invite' AND user_id = ? AND consumed_at IS NULL AND expires_at > NOW()
             ORDER BY created_at DESC"
        );
        $stmt->execute([$ownerId]);
        foreach ($stmt->fetchAll() as $row) {
            $result[] = [
                'id' => (string) $row['selector'],
                'createdAt' => (int) $row['created_at'],
                'expiresAt' => (int) $row['expires_at'],
            ];
        }
    }

    // Keep legacy outstanding invites visible and usable through the migration.
    $pdo->beginTransaction();
    try {
        $row = dalli_user_state_row($pdo, $ownerId, true);
        $envelope = dalli_envelope_from_row($row);
        $invites = dalli_clean_invites($envelope['auth']['invites'] ?? []);
        $envelope['auth']['invites'] = $invites;
        dalli_update_envelope_only($pdo, $ownerId, $envelope);
        $pdo->commit();

        foreach ($invites as $invite) {
            $result[] = [
                'id' => $invite['id'],
                'createdAt' => $invite['created'],
                'expiresAt' => $invite['expires'],
            ];
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    usort($result, static fn(array $a, array $b): int => $b['createdAt'] <=> $a['createdAt']);
    return array_slice($result, 0, DALLI_MAX_INVITES);
}

function dalli_revoke_invite(PDO $pdo, int $ownerId, string $inviteId): void
{
    if (dalli_auth_schema_ready($pdo)) {
        $stmt = $pdo->prepare(
            "DELETE FROM auth_tokens WHERE purpose = 'invite' AND user_id = ? AND selector = ?"
        );
        $stmt->execute([$ownerId, $inviteId]);
    }

    $pdo->beginTransaction();
    try {
        $row = dalli_user_state_row($pdo, $ownerId, true);
        $envelope = dalli_envelope_from_row($row);
        $invites = dalli_clean_invites($envelope['auth']['invites'] ?? []);
        $envelope['auth']['invites'] = array_values(array_filter(
            $invites,
            static fn(array $invite): bool => $invite['id'] !== $inviteId
        ));
        dalli_update_envelope_only($pdo, $ownerId, $envelope);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function dalli_consume_invite(PDO $pdo, int $ownerId, array $token): bool
{
    if (dalli_auth_schema_ready($pdo)) {
        $stmt = $pdo->prepare(
            "SELECT id, secret_hash, UNIX_TIMESTAMP(expires_at) AS expires_at
             FROM auth_tokens
             WHERE purpose = 'invite' AND user_id = ? AND selector = ? AND consumed_at IS NULL
             LIMIT 1
             FOR UPDATE"
        );
        $stmt->execute([$ownerId, $token['id']]);
        $row = $stmt->fetch();

        if (is_array($row)
            && (int) $row['expires_at'] > time()
            && hash_equals((string) $row['secret_hash'], hash('sha256', $token['secret']))) {
            $pdo->prepare('DELETE FROM auth_tokens WHERE id = ?')->execute([(int) $row['id']]);
            return true;
        }
    }

    $ownerRow = dalli_user_state_row($pdo, $ownerId, true);
    $ownerEnvelope = dalli_envelope_from_row($ownerRow);
    $invites = dalli_clean_invites($ownerEnvelope['auth']['invites'] ?? []);

    foreach ($invites as $index => $invite) {
        if (!dalli_invite_matches($invite, $token)) {
            continue;
        }

        array_splice($invites, $index, 1);
        $ownerEnvelope['auth']['invites'] = array_values($invites);
        dalli_update_envelope_only($pdo, $ownerId, $ownerEnvelope);
        return true;
    }

    return false;
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

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
