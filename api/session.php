<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth-store.php';

dalli_require_method('POST');
dalli_require_same_origin();
dalli_read_json_body();

$pdo = dalli_pdo();

$userId = $_SESSION['user_id'] ?? null;
if (!is_int($userId) && !ctype_digit((string) $userId)) {
    $rememberedUser = dalli_try_remember_login($pdo);
    if (is_array($rememberedUser)) {
        dalli_json_response([
            'ok' => true,
            'authenticated' => true,
            'user' => $rememberedUser,
            'csrfToken' => dalli_csrf_token(),
            'remembered' => true,
        ]);
    }

    $ownerId = dalli_owner_id($pdo);
    dalli_json_response([
        'ok' => true,
        'authenticated' => false,
        'registration' => [
            'mode' => $ownerId === null ? 'owner-setup' : 'invite-only',
        ],
    ]);
}

$userId = (int) $userId;
$username = (string) ($_SESSION['username'] ?? '');

if ($username === '') {
    $stmt = $pdo->prepare('SELECT username FROM users WHERE id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $username = (string) ($stmt->fetchColumn() ?: '');
    $_SESSION['username'] = $username;
}

dalli_json_response([
    'ok' => true,
    'authenticated' => true,
    'user' => dalli_session_user_payload($pdo, $userId, $username),
    'csrfToken' => dalli_csrf_token(),
    'remembered' => dalli_parse_remember_cookie() !== null,
]);
