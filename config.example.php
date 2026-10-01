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
         * - "invite": only owner-created invite links can register
         * - "closed": no new accounts
         * - "public": verified-email public signup (requires SMTP below)
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

    /*
     * Optional abuse budgets. These conservative defaults are used when the
     * section is omitted, so existing private configs do not need changing.
     * Public signup fails safely when a global budget or pending-account cap
     * is reached; existing login and cloud sync remain available.
     */
    'security' => [
        'registrations_per_hour' => '40',
        'registrations_per_day' => '200',
        'mail_per_hour' => '60',
        'mail_per_day' => '300',
        'max_pending_accounts' => '200',
    ],

    'mail' => [
        /*
         * Transactional account email. Public signup remains fail-closed unless
         * every required SMTP field is configured.
         *
         * encryption: "tls" for STARTTLS (usually port 587), or "ssl"
         * for implicit TLS (usually port 465).
         */
        'host' => 'YOUR_SMTP_HOST',
        'port' => '587',
        'encryption' => 'tls',
        'username' => 'YOUR_SMTP_USERNAME',
        'password' => 'YOUR_SMTP_PASSWORD',
        'from_email' => 'molife@example.com',
        'from_name' => 'MoLife',

        /*
         * Optional diagnostics-only DKIM selector. Your SMTP provider performs
         * the actual DKIM signing; set this only if you know the selector so
         * MoLife can check the corresponding DNS record in owner diagnostics.
         */
        'dkim_selector' => '',
    ],
];
