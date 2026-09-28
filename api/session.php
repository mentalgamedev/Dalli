<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

dalli_require_method('GET');

$userId = $_SESSION['user_id'] ?? null;
if (!is_int($userId) && !ctype_digit((string) $userId)) {
    dalli_json_response([
        'ok' => true,
        'authenticated' => false,
    ]);
}

dalli_json_response([
    'ok' => true,
    'authenticated' => true,
    'user' => [
        'id' => (int) $userId,
        'username' => (string) ($_SESSION['username'] ?? ''),
    ],
    'csrfToken' => dalli_csrf_token(),
]);
