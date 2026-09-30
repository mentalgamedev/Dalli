<?php
declare(strict_types=1);
require __DIR__ . '/auth/bootstrap.php';

dalli_require_method('POST');
dalli_require_same_origin();
dalli_verification_attempt_rate_check();

if (!dalli_auth_schema_ready()) {
    dalli_fail('Account activation is unavailable.', 503);
}

$body = dalli_read_json_body();
$token = dalli_parse_auth_token((string) ($body['token'] ?? ''));
$password = (string) ($body['password'] ?? '');

if ($token === null || strlen($password) < 1 || strlen($password) > 200) {
    dalli_verification_attempt_rate_failure();
    dalli_fail('Activation link is invalid or expired.', 400);
}

$pdo = dalli_pdo();

try {
    $pdo->beginTransaction();
    $consumed = dalli_consume_auth_token($pdo, 'email_verify', $token);

    if ($consumed === null) {
        $pdo->rollBack();
        dalli_verification_attempt_rate_failure();
        dalli_fail('Activation link is invalid or expired.', 400);
    }

    $userId = (int) $consumed['userId'];
    $stmt = $pdo->prepare(
        'SELECT id, username, email, status, password_hash FROM users WHERE id = ? LIMIT 1 FOR UPDATE'
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!is_array($user) || (string) ($user['status'] ?? '') !== 'pending') {
        $pdo->rollBack();
        dalli_verification_attempt_rate_failure();
        dalli_fail('Activation link is invalid or expired.', 400);
    }

    if (!password_verify($password, (string) ($user['password_hash'] ?? ''))) {
        $pdo->rollBack();
        dalli_verification_attempt_rate_failure();
        dalli_fail('Activation link or password is invalid.', 401);
    }

    if (dalli_password_needs_rehash((string) $user['password_hash'])) {
        $rehash = $pdo->prepare('UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?');
        $rehash->execute([dalli_hash_password($password), $userId]);
    }

    $update = $pdo->prepare(
        "UPDATE users
         SET status = 'active', email_verified_at = NOW()
         WHERE id = ? AND status = 'pending'"
    );
    $update->execute([$userId]);

    $pdo->prepare(
        "DELETE FROM auth_tokens WHERE user_id = ? AND purpose = 'email_verify'"
    )->execute([$userId]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('MoLife account activation failed: ' . $e->getMessage());
    dalli_fail('Could not activate account.', 500);
}

$userPayload = dalli_start_user_session($pdo, $userId, (string) $user['username']);

$remember = ($consumed['metadata']['remember'] ?? true) !== false;
$remembered = false;
try {
    if ($remember) {
        dalli_issue_remember($pdo, $userId);
        $remembered = true;
    } else {
        dalli_revoke_current_remember($pdo);
    }
} catch (Throwable $e) {
    error_log('MoLife persistent login setup failed after activation: ' . $e->getMessage());
    dalli_clear_remember_cookie();
}

dalli_json_response([
    'ok' => true,
    'authenticated' => true,
    'activated' => true,
    'newAccount' => true,
    'user' => $userPayload,
    'csrfToken' => $_SESSION['csrf'],
    'remembered' => $remembered,
]);
