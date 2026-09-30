<?php
declare(strict_types=1);
require __DIR__ . '/auth/bootstrap.php';
require __DIR__ . '/auth/mailer.php';

dalli_require_method('POST');
dalli_require_same_origin();
dalli_registration_rate_check();

$body = dalli_read_json_body();
$username = trim((string) ($body['username'] ?? ''));
$password = (string) ($body['password'] ?? '');
$emailRaw = (string) ($body['email'] ?? '');
$inviteRaw = trim((string) ($body['inviteToken'] ?? ''));
$ownerSetupRaw = (string) ($body['ownerSetupToken'] ?? '');
$honeypot = trim((string) ($body['website'] ?? ''));
$remember = ($body['remember'] ?? true) !== false;

if ($honeypot !== '') {
    usleep(120000);
    dalli_fail('Could not create account.', 422);
}

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
$parsedInvite = dalli_parse_invite_token($inviteRaw);
$isOwnerSetup = $initialOwnerId === null;
$isInviteAttempt = $initialOwnerId !== null && $parsedInvite !== null;
$isPublicAttempt = $initialOwnerId !== null
    && !$isInviteAttempt
    && $registrationMode === 'public';

if ($isOwnerSetup) {
    $expectedSetupToken = dalli_owner_setup_token();
    if ($expectedSetupToken === '') {
        dalli_fail('Owner account setup is not configured.', 503);
    }

    if ($ownerSetupRaw === '' || !hash_equals($expectedSetupToken, $ownerSetupRaw)) {
        dalli_registration_rate_failure();
        usleep(150000);
        dalli_fail('Invalid owner setup code.', 403);
    }
} elseif ($registrationMode === 'closed') {
    dalli_registration_rate_failure();
    dalli_fail('Account creation is currently closed.', 403);
} elseif (!$isInviteAttempt && !$isPublicAttempt) {
    dalli_registration_rate_failure();
    usleep(100000);
    dalli_fail('A valid invite link is required to create an account.', 403);
}

$email = null;
if ($isPublicAttempt) {
    if (!dalli_public_signup_ready()) {
        dalli_fail('Public account creation is temporarily unavailable.', 503);
    }

    $email = dalli_normalize_email($emailRaw);
    if ($email === null) {
        dalli_fail('Enter a valid email address.', 422);
    }

    dalli_public_registration_rate_check($email);
    dalli_public_registration_rate_hit($email);
    dalli_cleanup_auth_housekeeping($pdo);
}

try {
    $passwordHash = dalli_hash_password($password);
} catch (Throwable $e) {
    error_log('MoLife password hashing failed during registration: ' . $e->getMessage());
    dalli_fail('Could not create account.', 500);
}

if ($isPublicAttempt && is_string($email)) {
    $verificationToken = null;
    $verificationUrl = null;
    $mailUsername = $username;
    $existingActive = false;

    try {
        $pdo->beginTransaction();

        $usernameStmt = $pdo->prepare(
            'SELECT id, email, status FROM users WHERE username = ? LIMIT 1 FOR UPDATE'
        );
        $usernameStmt->execute([$username]);
        $usernameRow = $usernameStmt->fetch();

        $emailStmt = $pdo->prepare(
            'SELECT id, username, status FROM users WHERE email = ? LIMIT 1 FOR UPDATE'
        );
        $emailStmt->execute([$email]);
        $emailRow = $emailStmt->fetch();

        if (is_array($usernameRow)) {
            $samePendingEmail = (string) ($usernameRow['status'] ?? '') === 'pending'
                && is_string($usernameRow['email'] ?? null)
                && hash_equals((string) $usernameRow['email'], $email);

            if (!$samePendingEmail) {
                $pdo->rollBack();
                dalli_fail('That username is already taken.', 409);
            }
        }

        if (is_array($emailRow) && (string) ($emailRow['status'] ?? '') !== 'pending') {
            $existingActive = true;
            $mailUsername = (string) ($emailRow['username'] ?? $username);
            $pdo->commit();
        } else {
            if (is_array($emailRow)) {
                $userId = (int) $emailRow['id'];
                $update = $pdo->prepare(
                    "UPDATE users
                     SET username = ?, password_hash = ?, role = 'user', status = 'pending',
                         email_verified_at = NULL, password_changed_at = NOW(), created_at = NOW()
                     WHERE id = ?"
                );
                $update->execute([$username, $passwordHash, $userId]);
            } else {
                $insert = $pdo->prepare(
                    "INSERT INTO users
                        (username, email, password_hash, role, status, email_verified_at, password_changed_at)
                     VALUES (?, ?, ?, 'user', 'pending', NULL, NOW())"
                );
                $insert->execute([$username, $email, $passwordHash]);
                $userId = (int) $pdo->lastInsertId();
                dalli_store_envelope($pdo, $userId, dalli_empty_envelope(), 0);
            }

            $verificationToken = dalli_issue_auth_token(
                $pdo,
                $userId,
                'email_verify',
                DALLI_EMAIL_VERIFY_SECONDS,
                ['remember' => $remember]
            );
            $verificationUrl = dalli_verification_url($verificationToken['token']);
            $pdo->commit();
        }
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        $driverCode = (int) ($e->errorInfo[1] ?? 0);
        if ($driverCode === 1062) {
            dalli_fail('That username is already taken.', 409);
        }

        error_log('MoLife public registration failed: ' . $e->getMessage());
        dalli_fail('Could not create account.', 500);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('MoLife public registration failed: ' . $e->getMessage());
        dalli_fail('Could not create account.', 500);
    }

    try {
        if ($existingActive) {
            dalli_send_existing_account_email($email, $mailUsername);
        } elseif (is_string($verificationUrl)) {
            dalli_send_verification_email($email, $username, $verificationUrl);
        }
    } catch (Throwable $e) {
        error_log('MoLife registration email delivery failed: ' . $e->getMessage());

        if (!$existingActive) {
            dalli_json_response([
                'ok' => false,
                'error' => 'Your pending account was created, but the activation email could not be sent. Try Resend activation email.',
                'pending' => true,
                'emailDeliveryFailed' => true,
            ], 503);
        }
    }

    // Same outward response whether the address was new, already pending, or
    // already active. This keeps public registration from becoming an email
    // address enumeration endpoint.
    dalli_json_response([
        'ok' => true,
        'authenticated' => false,
        'pending' => true,
        'verificationSent' => true,
        'message' => 'If this email address can be registered, activation instructions have been sent.',
        'expiresIn' => DALLI_EMAIL_VERIFY_SECONDS,
    ], 202);
}

// Owner setup and trusted invite registration remain immediate and backwards-compatible.
try {
    $pdo->beginTransaction();

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
            "INSERT INTO users (username, password_hash, role, status, password_changed_at)
             VALUES (?, ?, ?, 'active', NOW())"
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
