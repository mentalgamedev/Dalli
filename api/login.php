<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth-store.php';

dalli_require_method('POST');
dalli_require_same_origin();

$body = dalli_read_json_body();
$username = trim((string) ($body['username'] ?? ''));
$password = (string) ($body['password'] ?? '');
$remember = ($body['remember'] ?? true) !== false;

if (strlen($username) < 1 || strlen($username) > 64 || strlen($password) < 1 || strlen($password) > 200) {
    dalli_fail('Invalid username or password.', 401);
}

dalli_login_rate_check($username);

$pdo = dalli_pdo();
$stmt = $pdo->prepare(
    dalli_auth_schema_ready($pdo)
        ? "SELECT id, username, password_hash, status FROM users WHERE username = ? LIMIT 1"
        : "SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1"
);
$stmt->execute([$username]);
$user = $stmt->fetch();

$dummyHash = '$2y$12$4Umg0rCJwMswRw/l.SwHvuQV01coP0eWmGzd61QH2RvAOMANUBGC.';
$hash = is_array($user) ? (string) $user['password_hash'] : $dummyHash;
$valid = password_verify($password, $hash);
$active = !dalli_auth_schema_ready($pdo)
    || (is_array($user) && (string) ($user['status'] ?? '') === 'active');

if (!$valid || !is_array($user) || !$active) {
    dalli_login_rate_failure($username);
    usleep(150000);
    dalli_fail('Invalid username or password.', 401);
}

dalli_login_rate_clear($username);

if (dalli_password_needs_rehash($hash)) {
    try {
        $newHash = dalli_hash_password($password);
        $update = $pdo->prepare(
            dalli_auth_schema_ready($pdo)
                ? 'UPDATE users SET password_hash = ?, password_changed_at = COALESCE(password_changed_at, NOW()) WHERE id = ?'
                : 'UPDATE users SET password_hash = ? WHERE id = ?'
        );
        $update->execute([$newHash, (int) $user['id']]);
    } catch (Throwable $e) {
        error_log('MoLife password rehash failed: ' . $e->getMessage());
    }
}

$userPayload = dalli_start_user_session(
    $pdo,
    (int) $user['id'],
    (string) $user['username']
);

$remembered = false;
try {
    if ($remember) {
        dalli_issue_remember($pdo, (int) $user['id']);
        $remembered = true;
    } else {
        dalli_revoke_current_remember($pdo);
    }
} catch (Throwable $e) {
    error_log('Dalli persistent login setup failed: ' . $e->getMessage());
    dalli_clear_remember_cookie();
}

dalli_json_response([
    'ok' => true,
    'authenticated' => true,
    'user' => $userPayload,
    'csrfToken' => $_SESSION['csrf'],
    'remembered' => $remembered,
]);
