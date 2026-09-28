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

    // Backward compatibility: V2 initially stored the app state directly.
    $envelope = dalli_empty_envelope();
    $envelope['state'] = $decoded;
    return $envelope;
}

function dalli_decode_envelope(string $json): array
{
    try {
        $decoded = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new RuntimeException('Stored Dalli data is invalid.', 0, $e);
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('Stored Dalli data is invalid.');
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
        throw new RuntimeException('Stored Dalli envelope is too large.');
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
    $stmt = $pdo->query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
    $value = $stmt->fetchColumn();
    return $value === false ? null : (int) $value;
}

function dalli_is_owner(PDO $pdo, int $userId): bool
{
    $ownerId = dalli_owner_id($pdo);
    return $ownerId !== null && $ownerId === $userId;
}

function dalli_session_user_payload(PDO $pdo, int $userId, string $username): array
{
    return [
        'id' => $userId,
        'username' => $username,
        'isOwner' => dalli_is_owner($pdo, $userId),
    ];
}

function dalli_start_user_session(PDO $pdo, int $userId, string $username): array
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['username'] = $username;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));

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

function dalli_revoke_current_remember(PDO $pdo): void
{
    $cookie = dalli_parse_remember_cookie();
    if ($cookie === null) {
        dalli_clear_remember_cookie();
        return;
    }

    try {
        $pdo->beginTransaction();
        $row = dalli_user_state_row($pdo, $cookie['userId'], true);
        if ($row !== null) {
            $envelope = dalli_envelope_from_row($row);
            $tokens = dalli_clean_remember_tokens($envelope['auth']['rememberTokens'] ?? []);
            $envelope['auth']['rememberTokens'] = dalli_remove_remember_selector($tokens, $cookie['selector']);
            dalli_update_envelope_only($pdo, $cookie['userId'], $envelope);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Dalli remember-token revoke failed: ' . $e->getMessage());
    }

    dalli_clear_remember_cookie();
}

function dalli_issue_remember(PDO $pdo, int $userId): void
{
    // Logging into another account in the same browser should revoke the old browser token.
    dalli_revoke_current_remember($pdo);

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

    setcookie(
        DALLI_REMEMBER_COOKIE,
        $userId . '.' . $selector . '.' . $validator,
        dalli_remember_cookie_options($expires)
    );
    $_COOKIE[DALLI_REMEMBER_COOKIE] = $userId . '.' . $selector . '.' . $validator;
    $_SESSION['remember_selector'] = $selector;
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

    $stmt = $pdo->prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$cookie['userId']]);
    $user = $stmt->fetch();

    if (!is_array($user)) {
        dalli_clear_remember_cookie();
        return null;
    }

    $newValidator = bin2hex(random_bytes(32));
    $now = time();
    $newExpires = $now + DALLI_REMEMBER_SECONDS;
    $valid = false;

    $pdo->beginTransaction();
    try {
        $row = dalli_user_state_row($pdo, $cookie['userId'], true);
        $envelope = dalli_envelope_from_row($row);
        $tokens = dalli_clean_remember_tokens($envelope['auth']['rememberTokens'] ?? []);

        foreach ($tokens as &$token) {
            if (($token['selector'] ?? '') !== $cookie['selector']) {
                continue;
            }

            $valid = hash_equals((string) $token['hash'], hash('sha256', $cookie['validator']));
            if ($valid) {
                $token['hash'] = hash('sha256', $newValidator);
                $token['lastUsed'] = $now;
                $token['expires'] = $newExpires;
            }
            break;
        }
        unset($token);

        if (!$valid) {
            $tokens = dalli_remove_remember_selector($tokens, $cookie['selector']);
        }

        $envelope['auth']['rememberTokens'] = $tokens;
        dalli_update_envelope_only($pdo, $cookie['userId'], $envelope);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('Dalli remember-token validation failed: ' . $e->getMessage());
        return null;
    }

    if (!$valid) {
        dalli_clear_remember_cookie();
        return null;
    }

    setcookie(
        DALLI_REMEMBER_COOKIE,
        $cookie['userId'] . '.' . $cookie['selector'] . '.' . $newValidator,
        dalli_remember_cookie_options($newExpires)
    );
    $_COOKIE[DALLI_REMEMBER_COOKIE] = $cookie['userId'] . '.' . $cookie['selector'] . '.' . $newValidator;
    $_SESSION['remember_selector'] = $cookie['selector'];

    return dalli_start_user_session(
        $pdo,
        (int) $user['id'],
        (string) $user['username']
    );
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
    $pdo->beginTransaction();
    try {
        $row = dalli_user_state_row($pdo, $ownerId, true);
        $envelope = dalli_envelope_from_row($row);
        $invites = dalli_clean_invites($envelope['auth']['invites'] ?? []);
        $envelope['auth']['invites'] = $invites;
        dalli_update_envelope_only($pdo, $ownerId, $envelope);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    return array_map(
        static fn(array $invite): array => [
            'id' => $invite['id'],
            'createdAt' => $invite['created'],
            'expiresAt' => $invite['expires'],
        ],
        $invites
    );
}

function dalli_revoke_invite(PDO $pdo, int $ownerId, string $inviteId): void
{
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

function dalli_owner_setup_token(): string
{
    $token = dalli_config('app', 'owner_setup_token');
    if ($token !== '') {
        return $token;
    }

    // Compatibility with the earlier setup.php configuration.
    return dalli_config('app', 'setup_token');
}

function dalli_registration_rate_path(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return sys_get_temp_dir() . '/dalli-register-' . hash('sha256', $ip) . '.json';
}

function dalli_registration_rate_check(): void
{
    $path = dalli_registration_rate_path();
    $now = time();
    $data = ['window' => $now, 'count' => 0, 'blocked_until' => 0];

    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        return;
    }

    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $data = array_merge($data, $decoded);
        }
    }

    if ((int) ($data['window'] ?? 0) < $now - 3600) {
        $data = ['window' => $now, 'count' => 0, 'blocked_until' => 0];
    }

    flock($handle, LOCK_UN);
    fclose($handle);

    $blockedUntil = (int) ($data['blocked_until'] ?? 0);
    if ($blockedUntil > $now) {
        header('Retry-After: ' . max(1, $blockedUntil - $now));
        dalli_fail('Too many account-creation attempts. Try again later.', 429);
    }
}

function dalli_registration_rate_failure(): void
{
    $path = dalli_registration_rate_path();
    $now = time();
    $data = ['window' => $now, 'count' => 0, 'blocked_until' => 0];

    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        return;
    }

    flock($handle, LOCK_EX);
    $raw = stream_get_contents($handle);
    if (is_string($raw) && $raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $data = array_merge($data, $decoded);
        }
    }

    if ((int) ($data['window'] ?? 0) < $now - 3600) {
        $data = ['window' => $now, 'count' => 0, 'blocked_until' => 0];
    }

    $data['count'] = (int) ($data['count'] ?? 0) + 1;
    if ($data['count'] >= 10) {
        $data['blocked_until'] = $now + 1800;
    }

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($data));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
}

function dalli_registration_rate_clear(): void
{
    @unlink(dalli_registration_rate_path());
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
