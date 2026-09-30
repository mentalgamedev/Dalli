<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/auth-store.php';

dalli_require_method('POST');
dalli_require_same_origin();
dalli_registration_rate_check();

$body = dalli_read_json_body();
$username = trim((string) ($body['username'] ?? ''));
$password = (string) ($body['password'] ?? '');
$inviteRaw = trim((string) ($body['inviteToken'] ?? ''));
$ownerSetupRaw = (string) ($body['ownerSetupToken'] ?? '');
$remember = ($body['remember'] ?? true) !== false;

if (preg_match('/^[A-Za-z0-9._-]{3,64}$/', $username) !== 1) {
    dalli_registration_rate_failure();
    dalli_fail('Username must be 3–64 characters using letters, numbers, dot, underscore or hyphen.', 422);
}

if (strlen($password) < 12 || strlen($password) > 200) {
    dalli_registration_rate_failure();
    dalli_fail('Password must be at least 12 characters.', 422);
}

$pdo = dalli_pdo();
$initialOwnerId = dalli_owner_id($pdo);
$registrationMode = dalli_registration_mode();

if ($initialOwnerId === null) {
    $expectedSetupToken = dalli_owner_setup_token();
    if ($expectedSetupToken === '') {
        dalli_fail('Owner account setup is not configured.', 503);
    }

    if ($ownerSetupRaw === '' || !hash_equals($expectedSetupToken, $ownerSetupRaw)) {
        dalli_registration_rate_failure();
        usleep(150000);
        dalli_fail('Invalid owner setup code.', 403);
    }
} else {
    if ($registrationMode === 'closed') {
        dalli_registration_rate_failure();
        dalli_fail('Account creation is currently closed.', 403);
    }

    // Pass 1 deliberately fails closed. "public" becomes usable only when
    // verified-email registration is implemented in the next pass.
    if (dalli_parse_invite_token($inviteRaw) === null) {
        dalli_registration_rate_failure();
        usleep(100000);
        dalli_fail('A valid invite link is required to create an account.', 403);
    }
}

try {
    $passwordHash = dalli_hash_password($password);
} catch (Throwable $e) {
    error_log('MoLife password hashing failed during registration: ' . $e->getMessage());
    dalli_fail('Could not create account.', 500);
}

try {
    $pdo->beginTransaction();

    // Re-check inside the transaction in case the first account was created moments ago.
    $ownerId = dalli_owner_id($pdo);
    $role = 'user';

    if ($ownerId === null) {
        $expectedSetupToken = dalli_owner_setup_token();
        if ($ownerSetupRaw === '' || $expectedSetupToken === '' || !hash_equals($expectedSetupToken, $ownerSetupRaw)) {
            $pdo->rollBack();
            dalli_registration_rate_failure();
            dalli_fail('Invalid owner setup code.', 403);
        }
        $role = 'owner';
    } else {
        if (dalli_registration_mode() === 'closed') {
            $pdo->rollBack();
            dalli_registration_rate_failure();
            dalli_fail('Account creation is currently closed.', 403);
        }

        $inviteToken = dalli_parse_invite_token($inviteRaw);
        if ($inviteToken === null || !dalli_consume_invite($pdo, $ownerId, $inviteToken)) {
            $pdo->rollBack();
            dalli_registration_rate_failure();
            usleep(100000);
            dalli_fail('Invite link is invalid or expired.', 403);
        }
    }

    if (dalli_auth_schema_ready($pdo)) {
        $insert = $pdo->prepare(
            'INSERT INTO users (username, password_hash, role, status, password_changed_at)
             VALUES (?, ?, ?, \'active\', NOW())'
        );
        $insert->execute([$username, $passwordHash, $role]);
    } else {
        $insert = $pdo->prepare(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)'
        );
        $insert->execute([$username, $passwordHash]);
    }

    $userId = (int) $pdo->lastInsertId();
    dalli_store_envelope($pdo, $userId, dalli_empty_envelope(), 0);
    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    $driverCode = (int) ($e->errorInfo[1] ?? 0);
    if ($driverCode === 1062) {
        dalli_registration_rate_failure();
        dalli_fail('That username is already taken.', 409);
    }

    error_log('MoLife registration failed: ' . $e->getMessage());
    dalli_fail('Could not create account.', 500);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('MoLife registration failed: ' . $e->getMessage());
    dalli_fail('Could not create account.', 500);
}

dalli_registration_rate_clear();

$userPayload = dalli_start_user_session($pdo, $userId, $username);

$remembered = false;
try {
    if ($remember) {
        dalli_issue_remember($pdo, $userId);
        $remembered = true;
    } else {
        dalli_revoke_current_remember($pdo);
    }
} catch (Throwable $e) {
    error_log('MoLife persistent login setup failed after registration: ' . $e->getMessage());
    dalli_clear_remember_cookie();
}

dalli_json_response([
    'ok' => true,
    'authenticated' => true,
    'newAccount' => true,
    'user' => $userPayload,
    'csrfToken' => $_SESSION['csrf'],
    'remembered' => $remembered,
]);
