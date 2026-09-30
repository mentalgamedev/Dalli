<?php
declare(strict_types=1);

/*
 * EXAMPLE ONLY — DO NOT PUT REAL CREDENTIALS IN THIS REPOSITORY.
 *
 * Place the real molife-config.php one directory above MoLife's public document
 * root. The backend deliberately resolves it from outside the web root.
 */
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

return [
    'database' => [
        'host' => 'YOUR_DATABASE_HOST',
        'name' => 'YOUR_DATABASE_NAME',
        'user' => 'YOUR_DATABASE_USER',
        'password' => 'YOUR_DATABASE_PASSWORD',
    ],

    'app' => [
        'origin' => 'https://molife.example.com',

        /*
         * Registration safety switch.
         * Pass 1 supports "invite" and "closed". "public" is reserved for the
         * verified-email signup flow introduced in the next pass and currently
         * remains fail-closed.
         */
        'registration_mode' => 'invite',

        /*
         * Private HMAC key used to pseudonymize rate-limit buckets such as IPs
         * and account identifiers. Generate at least 32 random bytes.
         */
        'auth_hmac_key' => 'REPLACE_WITH_LONG_RANDOM_AUTH_HMAC_KEY',

        /*
         * Used only to claim the first MoLife owner account.
         * Use at least 32 random bytes (64 hex characters).
         * Once an owner exists, later accounts require invite links.
         */
        'owner_setup_token' => 'REPLACE_WITH_LONG_RANDOM_OWNER_SETUP_TOKEN',
    ],
];
