<?php
declare(strict_types=1);

/*
 * EXAMPLE ONLY — DO NOT PUT REAL CREDENTIALS IN THIS REPOSITORY.
 *
 * Copy this file to:
 *   apps/dalli-config.php
 *
 * while the public Dalli site remains in:
 *   apps/dalli/
 *
 * Keeping this file one directory above the public Dalli root prevents it
 * from being web-addressable.
 */
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

return [
    'database' => [
        // Copy the database server/host exactly from lima-city's database settings.
        'host' => 'YOUR_LIMA_DB_HOST',
        'name' => 'db_430902_10',
        'user' => 'YOUR_RESTRICTED_DALLI_DB_USER',
        'password' => 'REPLACE_WITH_DATABASE_PASSWORD',
    ],

    'app' => [
        'origin' => 'https://dalli.mentalgrounds.com',

        /*
         * Used only to claim the very first Dalli owner account.
         * After an owner exists, this value is ignored; all later accounts
         * require an invite link created by the owner.
         *
         * Use at least 32 random bytes (64 hex characters).
         *
         * For compatibility, register.php also accepts the older config key
         * "setup_token" if you already configured one.
         */
        'owner_setup_token' => 'REPLACE_WITH_LONG_RANDOM_OWNER_SETUP_TOKEN',
    ],
];
