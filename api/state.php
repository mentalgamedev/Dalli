<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$userId = dalli_require_auth();
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? '');
$pdo = dalli_pdo();

function dalli_state_snapshot(PDO $pdo, int $userId): array
{
    $stmt = $pdo->prepare('SELECT state_json, revision, updated_at FROM user_state WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    if (!is_array($row)) {
        return [
            'state' => null,
            'revision' => 0,
            'updatedAt' => null,
        ];
    }

    try {
        $state = json_decode((string) $row['state_json'], true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        error_log('Dalli stored state could not be decoded for user ' . $userId);
        dalli_fail('Stored state is invalid.', 500);
    }

    return [
        'state' => $state,
        'revision' => (int) $row['revision'],
        'updatedAt' => (string) $row['updated_at'],
    ];
}

if ($method === 'GET') {
    dalli_json_response([
        'ok' => true,
        ...dalli_state_snapshot($pdo, $userId),
    ]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    dalli_fail('Method not allowed.', 405);
}

dalli_require_same_origin();
dalli_require_csrf();

$body = dalli_read_json_body();
$expectedRevision = $body['expectedRevision'] ?? null;
if (!is_int($expectedRevision) || $expectedRevision < 0 || $expectedRevision > 2147483647) {
    dalli_fail('Invalid revision.', 422);
}

$state = dalli_validate_state($body['state'] ?? null);
$stateJson = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

try {
    if ($expectedRevision === 0) {
        $stmt = $pdo->prepare(
            'INSERT INTO user_state (user_id, state_json, revision) VALUES (?, ?, 1)'
        );
        try {
            $stmt->execute([$userId, $stateJson]);
            dalli_json_response([
                'ok' => true,
                'revision' => 1,
            ]);
        } catch (PDOException $e) {
            if ((string) $e->getCode() !== '23000') {
                throw $e;
            }
        }
    } else {
        $stmt = $pdo->prepare(
            'UPDATE user_state
             SET state_json = ?, revision = revision + 1
             WHERE user_id = ? AND revision = ?'
        );
        $stmt->execute([$stateJson, $userId, $expectedRevision]);
        if ($stmt->rowCount() === 1) {
            dalli_json_response([
                'ok' => true,
                'revision' => $expectedRevision + 1,
            ]);
        }
    }
} catch (Throwable $e) {
    error_log('Dalli state save failed: ' . $e->getMessage());
    dalli_fail('Could not save state.', 500);
}

dalli_json_response([
    'ok' => false,
    'error' => 'Cloud state changed on another device.',
    'conflict' => true,
    ...dalli_state_snapshot($pdo, $userId),
], 409);
