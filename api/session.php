<?php
declare(strict_types=1);
require __DIR__ . '/auth/bootstrap.php';
require __DIR__ . '/auth/mailer.php';

dalli_require_method('POST');
dalli_require_same_origin();
dalli_read_json_body();

$pdo = dalli_pdo();

$sessionUser = dalli_active_session_user($pdo);
if (!is_array($sessionUser)) {
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
    $mode = $ownerId === null
        ? (dalli_owner_setup_available($pdo) ? 'owner-setup' : 'closed')
        : dalli_registration_mode();

    dalli_json_response([
        'ok' => true,
        'authenticated' => false,
        'registration' => [
            'mode' => $mode,
            'authFoundationReady' => dalli_auth_schema_ready($pdo),
            'publicSignupReady' => $mode === 'public' && dalli_public_signup_ready(),
        ],
    ]);
}

$userId = (int) $sessionUser['id'];
$username = (string) $sessionUser['username'];

dalli_json_response([
    'ok' => true,
    'authenticated' => true,
    'user' => dalli_session_user_payload($pdo, $userId, $username),
    'csrfToken' => dalli_csrf_token(),
    'remembered' => dalli_parse_remember_cookie() !== null,
    'authFoundationReady' => dalli_auth_schema_ready($pdo),
]);
