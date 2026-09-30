<?php
declare(strict_types=1);
require __DIR__ . '/auth/bootstrap.php';
require __DIR__ . '/auth/mailer.php';

dalli_require_method('POST');
dalli_require_same_origin();

if (!dalli_public_signup_ready()) {
    dalli_fail('Public account activation is temporarily unavailable.', 503);
}

$body = dalli_read_json_body();
$email = dalli_normalize_email((string) ($body['email'] ?? ''));
$remember = ($body['remember'] ?? true) !== false;

if ($email === null) {
    dalli_fail('Enter a valid email address.', 422);
}

dalli_verification_resend_rate_check($email);
dalli_verification_resend_rate_hit($email);

$pdo = dalli_pdo();
dalli_cleanup_auth_housekeeping($pdo);

$verificationUrl = null;
$username = null;
$existingActive = false;

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'SELECT id, username, status FROM users WHERE email = ? LIMIT 1 FOR UPDATE'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (is_array($user) && (string) ($user['status'] ?? '') === 'pending') {
        $userId = (int) $user['id'];
        $username = (string) $user['username'];
        $issued = dalli_issue_auth_token(
            $pdo,
            $userId,
            'email_verify',
            DALLI_EMAIL_VERIFY_SECONDS,
            ['remember' => $remember]
        );
        $verificationUrl = dalli_verification_url($issued['token']);
    } elseif (is_array($user) && (string) ($user['status'] ?? '') === 'active') {
        $existingActive = true;
        $username = (string) $user['username'];
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('MoLife verification resend failed: ' . $e->getMessage());
    dalli_fail('Could not process activation request.', 500);
}

try {
    if (is_string($verificationUrl) && is_string($username)) {
        dalli_send_verification_email($email, $username, $verificationUrl);
    } elseif ($existingActive && is_string($username)) {
        dalli_send_existing_account_email($email, $username);
    }
} catch (Throwable $e) {
    error_log('MoLife verification resend email delivery failed: ' . $e->getMessage());
    if (is_string($verificationUrl)) {
        dalli_fail('Activation email could not be sent. Try again later.', 503);
    }
}

dalli_json_response([
    'ok' => true,
    'message' => 'If this address has a pending MoLife account, fresh activation instructions have been sent.',
]);
