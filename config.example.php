<?php
declare(strict_types=1);

/*
 * EXAMPLE ONLY — DO NOT PUT REAL CREDENTIALS IN THIS REPOSITORY.
 *
 * For the lima-city layout used by Dalli, copy this file to:
 *   apps/dalli-config.php
 *
 * The public site lives in:
 *   apps/dalli/
 *
 * bootstrap.php deliberately looks one directory above the public Dalli root,
 * so the real database password is never web-addressable.
 */
return [
    'database' => [
        // Copy the database server/host exactly from lima-city's database settings.
        // It may look like USERNAME.lima-db.de; do not assume "localhost".
        'host' => 'YOUR_LIMA_DB_HOST',
        'name' => 'db_430902_10',
        'user' => 'YOUR_RESTRICTED_DALLI_DB_USER',
        'password' => 'REPLACE_WITH_DATABASE_PASSWORD',
    ],

    'app' => [
        'origin' => 'https://dalli.mentalgrounds.com',

        /*
         * Temporary account-creation secret.
         * Use a long random value while creating accounts at /setup.php.
         * Set this to an empty string immediately afterwards.
         */
        'setup_token' => '',
    ],
];
