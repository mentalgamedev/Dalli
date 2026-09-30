<?php
declare(strict_types=1);
require __DIR__ . '/auth/bootstrap.php';
require __DIR__ . '/auth/mailer.php';

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
            'authFoundationReady' => dalli_auth_schema_ready($pdo),
        ]);
    }

    $ownerId = dalli_owner_id($pdo);
    $mode = $ownerId === null ? 'owner-setup' : dalli_registration_mode();
    dalli_json_response([
        'ok' => true,
        'authenticated' => false,
        'registration' => [
            'mode' => $mode,
            'authFoundationReady' => dalli_auth_schema_ready($pdo),
            'publicSignupReady' => dalli_public_signup_ready(),
        ],
    ]);
}

$userId = (int) $userId;

if (dalli_auth_schema_ready($pdo)) {
    $statusStmt = $pdo->prepare('SELECT status FROM users WHERE id = ? LIMIT 1');
    $statusStmt->execute([$userId]);
    if ((string) ($statusStmt->fetchColumn() ?: '') !== 'active') {
        $_SESSION = [];
        session_regenerate_id(true);
        dalli_json_response([
            'ok' => true,
            'authenticated' => false,
            'registration' => [
                'mode' => dalli_registration_mode(),
                'authFoundationReady' => true,
                'publicSignupReady' => dalli_public_signup_ready(),
            ],
        ]);
    }
}

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
    'authFoundationReady' => dalli_auth_schema_ready($pdo),
]);
