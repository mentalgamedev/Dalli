<?php
declare(strict_types=1);

require __DIR__ . '/../api/auth/bootstrap.php';

function test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
}

$pdo = dalli_pdo();
test_assert(dalli_auth_schema_ready($pdo), 'modern auth schema should be detected');
test_assert(dalli_registration_mode() === 'invite', 'registration mode should default from test config');

$password = 'correct horse battery staple';
$hash = dalli_hash_password($password);
test_assert(password_verify($password, $hash), 'password hash should verify');

$ownerHash = dalli_hash_password('owner password phrase');
$pdo->prepare(
    "INSERT INTO users (username, password_hash, role, status, password_changed_at)
     VALUES ('owner', ?, 'owner', 'active', NOW())"
)->execute([$ownerHash]);
$ownerId = (int) $pdo->lastInsertId();
dalli_store_envelope($pdo, $ownerId, dalli_empty_envelope(), 0);

$userHash = dalli_hash_password('user password phrase');
$pdo->prepare(
    "INSERT INTO users (username, password_hash, role, status, password_changed_at)
     VALUES ('tester', ?, 'user', 'active', NOW())"
)->execute([$userHash]);
$userId = (int) $pdo->lastInsertId();
dalli_store_envelope($pdo, $userId, dalli_empty_envelope(), 0);

test_assert(dalli_owner_id($pdo) === $ownerId, 'explicit owner role should resolve owner');
test_assert(dalli_is_owner($pdo, $ownerId), 'owner should have owner role');
test_assert(!dalli_is_owner($pdo, $userId), 'ordinary user should not be owner');

$invite = dalli_create_invite($pdo, $ownerId);
$fragment = (string) parse_url($invite['url'], PHP_URL_FRAGMENT);
test_assert(str_starts_with($fragment, 'invite='), 'invite secret should live in URL fragment');
$token = dalli_parse_invite_token(rawurldecode(substr($fragment, 7)));
test_assert(is_array($token), 'generated invite should parse');
test_assert(count(dalli_list_invites($pdo, $ownerId)) === 1, 'modern invite should list');

$pdo->beginTransaction();
$consumed = dalli_consume_invite($pdo, $ownerId, $token);
$pdo->commit();
test_assert($consumed, 'modern invite should consume once');
test_assert(count(dalli_list_invites($pdo, $ownerId)) === 0, 'consumed modern invite should disappear');

$legacyId = bin2hex(random_bytes(8));
$legacySecret = bin2hex(random_bytes(32));
$legacyEnvelope = dalli_envelope_from_row(dalli_user_state_row($pdo, $ownerId, false));
$legacyEnvelope['auth']['invites'] = [[
    'id' => $legacyId,
    'hash' => hash('sha256', $legacySecret),
    'created' => time(),
    'expires' => time() + 600,
]];
dalli_update_envelope_only($pdo, $ownerId, $legacyEnvelope);

$legacyList = dalli_list_invites($pdo, $ownerId);
test_assert(count($legacyList) === 1 && $legacyList[0]['id'] === $legacyId, 'legacy invite should remain visible');
$legacyToken = dalli_parse_invite_token($legacyId . '.' . $legacySecret);
$pdo->beginTransaction();
$legacyConsumed = dalli_consume_invite($pdo, $ownerId, $legacyToken);
$pdo->commit();
test_assert($legacyConsumed, 'legacy invite should remain consumable after migration');
test_assert(count(dalli_list_invites($pdo, $ownerId)) === 0, 'consumed legacy invite should disappear');

dalli_issue_remember($pdo, $userId);
$cookie = dalli_parse_remember_cookie();
test_assert(is_array($cookie), 'remember cookie should be issued');
$count = (int) $pdo->query('SELECT COUNT(*) FROM auth_sessions')->fetchColumn();
test_assert($count === 1, 'remember credential should live in auth_sessions');

$rememberedUser = dalli_try_remember_login($pdo);
test_assert(is_array($rememberedUser) && (int) $rememberedUser['id'] === $userId, 'remember token should restore session');
$count = (int) $pdo->query('SELECT COUNT(*) FROM auth_sessions')->fetchColumn();
test_assert($count === 1, 'remember token rotation should not duplicate device session');

dalli_revoke_current_remember($pdo);
$count = (int) $pdo->query('SELECT COUNT(*) FROM auth_sessions')->fetchColumn();
test_assert($count === 0, 'logout/revoke should remove current remembered device');

$pdo->prepare("UPDATE users SET status = 'active' WHERE id = ?")->execute([$userId]);
dalli_issue_remember($pdo, $userId);
$pdo->prepare("UPDATE users SET status = 'disabled' WHERE id = ?")->execute([$userId]);
$blockedRemember = dalli_try_remember_login($pdo);
test_assert($blockedRemember === null, 'inactive account must not restore from remembered device');
$pdo->prepare("UPDATE users SET status = 'active' WHERE id = ?")->execute([$userId]);

for ($i = 0; $i < 5; $i++) {
    dalli_rate_failure('login_account', 'tester', 5, 600, 900);
}
$stmt = $pdo->prepare(
    "SELECT hit_count, blocked_until FROM auth_rate_limits
     WHERE action = 'login_account' AND bucket_hash = ?"
);
$stmt->execute([dalli_rate_bucket_hash('login_account', 'tester')]);
$rate = $stmt->fetch();
test_assert(is_array($rate) && (int) $rate['hit_count'] === 5, 'DB rate limiter should count failures');
test_assert($rate['blocked_until'] !== null, 'DB rate limiter should set block after threshold');

echo "Auth foundation integration smoke test passed.\n";
