<?php
declare(strict_types=1);

// Backwards-compatible include path. New endpoint code should require auth/bootstrap.php.
require_once __DIR__ . '/auth/bootstrap.php';

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    dalli_fail('Not found.', 404);
}
