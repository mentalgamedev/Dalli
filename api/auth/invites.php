<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// Owner invitation token lifecycle, including legacy migration compatibility.
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
