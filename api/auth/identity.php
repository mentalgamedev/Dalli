<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// User identity, owner-role lookup, and PHP session activation.
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
