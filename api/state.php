<?php
declare(strict_types=1);
require __DIR__ . '/auth/bootstrap.php';
require __DIR__ . '/molife-state.php';

dalli_require_method('POST');
dalli_require_same_origin();

$pdo = dalli_pdo();
$userId = dalli_require_active_user($pdo);

function dalli_state_snapshot(PDO $pdo, int $userId): array
{
    $row = dalli_user_state_row($pdo, $userId, false);
    if ($row === null) {
        return [
            'state' => null,
            'revision' => 0,
            'updatedAt' => null,
        ];
    }

    try {
        $envelope = dalli_envelope_from_row($row);
    } catch (Throwable $e) {
        error_log('Dalli stored state could not be decoded for user ' . $userId . ': ' . $e->getMessage());
        dalli_fail('Stored state is invalid.', 500);
    }

    return [
        'state' => $envelope['state'],
        'revision' => (int) $row['revision'],
        'updatedAt' => (string) $row['updated_at'],
    ];
}

$body = dalli_read_json_body();
$operation = $body['operation'] ?? '';

if ($operation === 'read') {
    dalli_json_response(array_merge(
        ['ok' => true],
        dalli_state_snapshot($pdo, $userId)
    ));
}

if ($operation !== 'save') {
    dalli_fail('Invalid state operation.', 400);
}

dalli_require_csrf();

$expectedRevision = $body['expectedRevision'] ?? null;
if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > 2147483647) {
    dalli_fail('Invalid revision.', 422);
}

$state = dalli_validate_state($body['state'] ?? null);

try {
    $pdo->beginTransaction();

    $row = dalli_user_state_row($pdo, $userId, true);
    $currentRevision = $row === null ? 0 : (int) $row['revision'];
    $envelope = dalli_envelope_from_row($row);

    if ($currentRevision !== $expectedRevision) {
        $conflictState = $envelope['state'];
        $updatedAt = $row === null ? null : (string) $row['updated_at'];
        $pdo->rollBack();

        dalli_json_response([
            'ok' => false,
            'error' => 'Cloud state changed on another device.',
            'conflict' => true,
            'state' => $conflictState,
            'revision' => $currentRevision,
            'updatedAt' => $updatedAt,
        ], 409);
    }

    $currentState = $envelope['state'];
    $currentVersion = is_array($currentState) ? (int) ($currentState['version'] ?? 0) : 0;
    $incomingVersion = (int) ($state['version'] ?? 0);
    if ($currentVersion > $incomingVersion) {
        $updatedAt = $row === null ? null : (string) $row['updated_at'];
        $pdo->rollBack();

        dalli_json_response([
            'ok' => false,
            'error' => 'A newer MoLife state is already stored in the cloud.',
            'conflict' => true,
            'state' => $currentState,
            'revision' => $currentRevision,
            'updatedAt' => $updatedAt,
        ], 409);
    }

    $envelope['state'] = $state;
    $nextRevision = $currentRevision + 1;
    $json = dalli_encode_envelope($envelope);

    if ($row === null) {
        $stmt = $pdo->prepare(
            'INSERT INTO user_state (user_id, state_json, revision) VALUES (?, ?, ?)'
        );
        $stmt->execute([$userId, $json, $nextRevision]);
    } else {
        $stmt = $pdo->prepare(
            'UPDATE user_state SET state_json = ?, revision = ? WHERE user_id = ?'
        );
        $stmt->execute([$json, $nextRevision, $userId]);
    }

    $pdo->commit();

    dalli_json_response([
        'ok' => true,
        'revision' => $nextRevision,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Dalli state save failed: ' . $e->getMessage());
    dalli_fail('Could not save state.', 500);
}
