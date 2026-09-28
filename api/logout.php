<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

dalli_require_method('POST');
dalli_require_same_origin();
dalli_require_auth();
dalli_require_csrf();

$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(DALLI_SESSION_NAME, '', [
        'expires' => time() - 42000,
        'path' => $params['path'] ?: '/',
        'domain' => $params['domain'] ?? '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

session_destroy();

dalli_json_response(['ok' => true]);
