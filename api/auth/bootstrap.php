<?php
declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

if (!defined('MOLIFE_AUTH_INTERNAL')) {
    define('MOLIFE_AUTH_INTERNAL', true);
}

// Compatibility names are retained so this pass changes architecture, not behavior.
const DALLI_REMEMBER_COOKIE = 'DALLIREMEMBER';
const DALLI_REMEMBER_SECONDS = 2592000; // 30 days
const DALLI_INVITE_SECONDS = 604800; // 7 days
const DALLI_MAX_REMEMBER_TOKENS = 8;
const DALLI_MAX_INVITES = 20;
const DALLI_EMAIL_VERIFY_SECONDS = 3600; // 60 minutes
const DALLI_PENDING_ACCOUNT_SECONDS = 172800; // 48 hours

require_once __DIR__ . '/foundation.php';
require_once __DIR__ . '/rate-limit.php';
require_once __DIR__ . '/state-bridge.php';
require_once __DIR__ . '/identity.php';
require_once __DIR__ . '/sessions.php';
require_once __DIR__ . '/invites.php';
require_once __DIR__ . '/tokens.php';

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
