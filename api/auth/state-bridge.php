<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// Legacy MoLife cloud-state bridge kept only for pre-auth-schema session/invite migration.
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
