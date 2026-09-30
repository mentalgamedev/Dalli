<?php
declare(strict_types=1);

require __DIR__ . '/auth/bootstrap.php';
require __DIR__ . '/auth/mailer.php';

dalli_require_method('POST');
dalli_require_same_origin();

$pdo = dalli_pdo();
$userId = dalli_require_active_user($pdo);
dalli_require_csrf();

if (!dalli_is_owner($pdo, $userId)) {
    dalli_fail('Only the MoLife owner can view security status.', 403);
}

try {
    $snapshot = dalli_public_security_snapshot($pdo);

    $counts = $pdo->query(
        "SELECT
            SUM(status = 'active') AS active_accounts,
            SUM(status = 'pending') AS pending_accounts
         FROM users"
    )->fetch();

    dalli_json_response([
        'ok' => true,
        'registrationMode' => dalli_registration_mode(),
        'publicSignupReady' => dalli_public_signup_ready()
            && $snapshot['registrationOpen']
            && $snapshot['mailOpen'],
        'hmacReady' => dalli_auth_hmac_ready(),
        'mailConfigured' => dalli_mail_configured(),
        'activeAccounts' => (int) ($counts['active_accounts'] ?? 0),
        'pendingAccounts' => (int) ($counts['pending_accounts'] ?? 0),
        'limits' => $snapshot,
    ]);
} catch (Throwable $e) {
    error_log('MoLife security status failed: ' . $e->getMessage());
    dalli_fail('Could not read registration security status.', 503);
}
