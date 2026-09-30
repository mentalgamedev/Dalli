<?php
declare(strict_types=1);

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    http_response_code(404);
    exit;
}

// User identity, owner-role lookup, and PHP session activation.
function dalli_user_count(PDO $pdo): int
{
    return (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
}

function dalli_owner_setup_available(PDO $pdo): bool
{
    // Once any user has ever been created, losing/disableing the owner must not
    // silently reopen the public owner-claim path.
    return dalli_user_count($pdo) === 0;
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

function dalli_clear_authenticated_session(): void
{
    unset(
        $_SESSION['user_id'],
        $_SESSION['username'],
        $_SESSION['csrf'],
        $_SESSION['authenticated_at'],
        $_SESSION['last_activity_at']
    );
    session_regenerate_id(true);
}

function dalli_active_session_user(PDO $pdo): ?array
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!is_int($userId) && !ctype_digit((string) $userId)) {
        return null;
    }

    $userId = (int) $userId;
    $stmt = $pdo->prepare(
        dalli_auth_schema_ready($pdo)
            ? 'SELECT id, username, status FROM users WHERE id = ? LIMIT 1'
            : 'SELECT id, username, \'active\' AS status FROM users WHERE id = ? LIMIT 1'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    if (!is_array($row) || (string) ($row['status'] ?? '') !== 'active') {
        dalli_clear_authenticated_session();
        if (function_exists('dalli_clear_remember_cookie')) {
            dalli_clear_remember_cookie();
        }
        return null;
    }

    $_SESSION['username'] = (string) $row['username'];
    $_SESSION['last_activity_at'] = time();
    return $row;
}

function dalli_require_active_user(PDO $pdo): int
{
    $user = dalli_active_session_user($pdo);
    if (!is_array($user)) {
        dalli_fail('Authentication required.', 401);
    }
    return (int) $user['id'];
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
