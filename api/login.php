<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

dalli_require_method('POST');
dalli_require_same_origin();

$body = dalli_read_json_body();
$username = trim((string) ($body['username'] ?? ''));
$password = (string) ($body['password'] ?? '');

if (strlen($username) < 1 || strlen($username) > 64 || strlen($password) < 1 || strlen($password) > 200) {
    dalli_fail('Invalid username or password.', 401);
}

dalli_login_rate_check($username);

$pdo = dalli_pdo();
$stmt = $pdo->prepare('SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1');
$stmt->execute([$username]);
$user = $stmt->fetch();

$dummyHash = '$2y$12$4Umg0rCJwMswRw/l.SwHvuQV01coP0eWmGzd61QH2RvAOMANUBGC.';
$hash = is_array($user) ? (string) $user['password_hash'] : $dummyHash;
$valid = password_verify($password, $hash);

if (!$valid || !is_array($user)) {
    dalli_login_rate_failure($username);
    usleep(150000);
    dalli_fail('Invalid username or password.', 401);
}

dalli_login_rate_clear($username);

if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
    $newHash = password_hash($password, PASSWORD_DEFAULT);
    if (is_string($newHash)) {
        $update = $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $update->execute([$newHash, (int) $user['id']]);
    }
}

session_regenerate_id(true);
$_SESSION['user_id'] = (int) $user['id'];
$_SESSION['username'] = (string) $user['username'];
$_SESSION['csrf'] = bin2hex(random_bytes(32));

dalli_json_response([
    'ok' => true,
    'authenticated' => true,
    'user' => [
        'id' => (int) $user['id'],
        'username' => (string) $user['username'],
    ],
    'csrfToken' => $_SESSION['csrf'],
]);
