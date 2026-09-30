<?php
declare(strict_types=1);
require __DIR__ . '/auth/bootstrap.php';

dalli_require_method('POST');
dalli_require_same_origin();

$userId = dalli_require_auth();
dalli_require_csrf();

$pdo = dalli_pdo();
if (!dalli_is_owner($pdo, $userId)) {
    dalli_fail('Only the Dalli owner can manage invitations.', 403);
}

$body = dalli_read_json_body();
$operation = (string) ($body['operation'] ?? '');

try {
    if ($operation === 'create') {
        dalli_json_response([
            'ok' => true,
            'invite' => dalli_create_invite($pdo, $userId),
            'invites' => dalli_list_invites($pdo, $userId),
        ]);
    }

    if ($operation === 'list') {
        dalli_json_response([
            'ok' => true,
            'invites' => dalli_list_invites($pdo, $userId),
        ]);
    }

    if ($operation === 'revoke') {
        $inviteId = (string) ($body['inviteId'] ?? '');
        if (preg_match('/^[a-f0-9]{16}$/', $inviteId) !== 1) {
            dalli_fail('Invalid invite.', 422);
        }

        dalli_revoke_invite($pdo, $userId, $inviteId);
        dalli_json_response([
            'ok' => true,
            'invites' => dalli_list_invites($pdo, $userId),
        ]);
    }
} catch (Throwable $e) {
    error_log('Dalli invite operation failed: ' . $e->getMessage());
    dalli_fail('Could not manage invitations.', 500);
}

dalli_fail('Invalid invite operation.', 400);
