<?php
declare(strict_types=1);

require __DIR__ . '/auth/bootstrap.php';
require __DIR__ . '/auth/mailer.php';

dalli_require_method('POST');
dalli_require_same_origin();

$userId = dalli_require_auth();
dalli_require_csrf();

$pdo = dalli_pdo();
if (!dalli_is_owner($pdo, $userId)) {
    dalli_fail('Only the MoLife owner can send SMTP test email.', 403);
}

$body = dalli_read_json_body();
$email = dalli_normalize_email((string) ($body['email'] ?? ''));

if ($email === null) {
    dalli_fail('Enter a valid email address.', 422);
}

if (!dalli_mail_configured()) {
    dalli_fail('Transactional email is not configured.', 503);
}

try {
    if (!dalli_rate_consume_strict('owner_mail_test', (string) $userId, 10, 3600)) {
        header('Retry-After: 3600');
        dalli_fail('Too many SMTP test messages. Try again later.', 429);
    }
} catch (Throwable $e) {
    error_log('MoLife SMTP test limiter failed: ' . $e->getMessage());
    dalli_fail('SMTP diagnostics are temporarily unavailable.', 503);
}

try {
    dalli_send_test_email($email);
} catch (Throwable $e) {
    error_log('MoLife SMTP test failed: ' . $e->getMessage());
    dalli_fail('Could not send the SMTP test email. Check the server mail settings and logs.', 502);
}

dalli_json_response([
    'ok' => true,
    'message' => 'SMTP test email sent.',
]);
