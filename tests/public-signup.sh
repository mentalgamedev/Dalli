#!/usr/bin/env bash
set -euo pipefail

ORIGIN="http://127.0.0.1:8080"
MAIL_SINK="/tmp/molife-mail-sink.jsonl"
SERVER_LOG="/tmp/molife-php-server.log"

rm -f "$MAIL_SINK" "$SERVER_LOG"

php -S 127.0.0.1:8080 -t . >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" >/dev/null 2>&1 || true' EXIT

for _ in {1..30}; do
  if curl -fsS "$ORIGIN/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

post_json() {
  local endpoint="$1"
  local payload="$2"
  curl -sS \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -X POST \
    --data "$payload" \
    -w $'\n%{http_code}' \
    "$ORIGIN/api/$endpoint"
}

assert_json_true() {
  local body="$1"
  local key="$2"
  printf '%s' "$body" | php -r '
    $data = json_decode(stream_get_contents(STDIN), true);
    $key = $argv[1];
    exit(is_array($data) && (($data[$key] ?? false) === true) ? 0 : 1);
  ' "$key"
}

last_verification_token() {
  php -r '
    $path = $argv[1];
    $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) exit(1);
    $mail = json_decode($lines[count($lines)-1], true);
    $html = is_array($mail) ? (string)($mail["html"] ?? "") : "";
    if (!preg_match("/#verify=([a-f0-9.]+)/", $html, $m)) exit(1);
    echo $m[1];
  ' "$MAIL_SINK"
}

REGISTER_RESULT="$(post_json register.php '{"username":"publictest","email":"PublicTest@example.com","password":"correct horse battery staple","confirmPassword":"correct horse battery staple","remember":true,"website":""}')"
REGISTER_BODY="\${REGISTER_RESULT%$'\n'*}"
REGISTER_CODE="\${REGISTER_RESULT##*$'\n'}"
test "$REGISTER_CODE" = "202"
assert_json_true "$REGISTER_BODY" "pending"
TOKEN_ONE="$(last_verification_token)"
test -n "$TOKEN_ONE"

VERIFY_RESULT="$(post_json verify-email.php "{\"token\":\"$TOKEN_ONE\"}")"
VERIFY_BODY="\${VERIFY_RESULT%$'\n'*}"
VERIFY_CODE="\${VERIFY_RESULT##*$'\n'}"
test "$VERIFY_CODE" = "200"
assert_json_true "$VERIFY_BODY" "authenticated"
assert_json_true "$VERIFY_BODY" "activated"

STATUS_ROW="$(mysql -N -h 127.0.0.1 -uroot -proot molife_test -e "SELECT CONCAT(status, '|', IF(email_verified_at IS NULL, '0', '1'), '|', email) FROM users WHERE username='publictest' LIMIT 1;")"
test "$STATUS_ROW" = "active|1|publictest@example.com"

REUSE_RESULT="$(post_json verify-email.php "{\"token\":\"$TOKEN_ONE\"}")"
REUSE_CODE="\${REUSE_RESULT##*$'\n'}"
test "$REUSE_CODE" = "400"

BEFORE_COUNT="$(mysql -N -h 127.0.0.1 -uroot -proot molife_test -e "SELECT COUNT(*) FROM users;")"
DUP_RESULT="$(post_json register.php '{"username":"differentname","email":"publictest@example.com","password":"another correct horse battery staple","confirmPassword":"another correct horse battery staple","remember":true,"website":""}')"
DUP_BODY="\${DUP_RESULT%$'\n'*}"
DUP_CODE="\${DUP_RESULT##*$'\n'}"
test "$DUP_CODE" = "202"
assert_json_true "$DUP_BODY" "pending"
AFTER_COUNT="$(mysql -N -h 127.0.0.1 -uroot -proot molife_test -e "SELECT COUNT(*) FROM users;")"
test "$BEFORE_COUNT" = "$AFTER_COUNT"

PENDING_RESULT="$(post_json register.php '{"username":"pendingtest","email":"pending@example.com","password":"pending correct horse battery staple","confirmPassword":"pending correct horse battery staple","remember":false,"website":""}')"
PENDING_CODE="\${PENDING_RESULT##*$'\n'}"
test "$PENDING_CODE" = "202"
OLD_PENDING_TOKEN="$(last_verification_token)"

RESEND_RESULT="$(post_json resend-verification.php '{"email":"pending@example.com"}')"
RESEND_CODE="\${RESEND_RESULT##*$'\n'}"
test "$RESEND_CODE" = "200"
NEW_PENDING_TOKEN="$(last_verification_token)"
test "$NEW_PENDING_TOKEN" != "$OLD_PENDING_TOKEN"

OLD_RESULT="$(post_json verify-email.php "{\"token\":\"$OLD_PENDING_TOKEN\"}")"
OLD_CODE="\${OLD_RESULT##*$'\n'}"
test "$OLD_CODE" = "400"

NEW_RESULT="$(post_json verify-email.php "{\"token\":\"$NEW_PENDING_TOKEN\"}")"
NEW_BODY="\${NEW_RESULT%$'\n'*}"
NEW_CODE="\${NEW_RESULT##*$'\n'}"
test "$NEW_CODE" = "200"
assert_json_true "$NEW_BODY" "activated"

echo "Public signup HTTP integration test passed."
