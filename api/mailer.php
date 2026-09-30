<?php
declare(strict_types=1);

// Backwards-compatible include path. New endpoint code should require auth/mailer.php.
require_once __DIR__ . '/auth/mailer.php';

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
