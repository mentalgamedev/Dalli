# Self-hosting MoLife

MoLife can be hosted on a conventional PHP + MySQL/MariaDB web host. The public repository intentionally does not contain any production-specific hostnames, account identifiers, credentials or infrastructure details.

## Requirements

- HTTPS
- PHP 8.0+
- PDO MySQL
- MySQL or MariaDB with JSON-column support
- ability to keep one PHP config file outside the public document root
- writable PHP session storage

## 1. Public app and private config

Serve the repository contents from a dedicated document root.

Keep the real configuration **outside** that public directory. The backend expects:

```
parent-of-public-root/
├── molife-config.php
└── public-root/
    ├── index.html
    ├── api/
    ├── app.js
    └── ...
```

Do not commit the real config file.

## 2. Database

For a fresh installation, create the schema in [schema.sql](schema.sql).

For an existing pre-public-auth installation, run the one-time migration:

    migrations/2026-09-30-public-auth-foundation.sql

The deployed PHP detects whether the modern auth schema exists and remains compatible with the legacy schema until the migration is applied. This means deploying the code first is safe; public signup still remains disabled.

Use a dedicated application database user with only the permissions MoLife needs at runtime:

- SELECT
- INSERT
- UPDATE
- DELETE

Use a separate administrative database account to run schema migrations. The normal application account does not need ALTER or CREATE privileges.

## 3. Private configuration

Use [config.example.php](config.example.php) as the template for the private `molife-config.php`.

Fill in:

- database host
- database name
- restricted database username
- database password
- the public HTTPS origin of your MoLife installation
- `registration_mode`: **invite**, **closed**, or **public**
- one long random auth HMAC key for pseudonymizing rate-limit buckets
- one long random owner setup token
- authenticated SMTP host, port, encryption mode, username/password and sender identity

Example:

```php
<?php
declare(strict_types=1);

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
        'registration_mode' => 'invite',
        'auth_hmac_key' => 'A_DIFFERENT_LONG_RANDOM_SECRET',
        'owner_setup_token' => 'A_LONG_RANDOM_SECRET',
    ],
    'mail' => [
        'host' => 'smtp.example.com',
        'port' => '587',
        'encryption' => 'tls',
        'username' => 'SMTP_USERNAME',
        'password' => 'SMTP_PASSWORD',
        'from_email' => 'molife@example.com',
        'from_name' => 'MoLife',
    ],
];
```

## 4. First account

Open MoLife normally.

If the database has no users yet, **Create account** becomes the owner-account flow. Enter:

- username
- password
- the private owner setup code

The first account automatically becomes the MoLife owner. In the modern schema this is an explicit owner role. Keep `registration_mode` on `invite` while configuring and testing SMTP. Setting it to `closed` disables all new-account creation immediately.

## 5. Invite another person

While signed in as the owner:

1. Open the Account screen.
2. Select **Create invite link**.
3. Send the generated link to the person.

Invite links:

- work once
- expire after 7 days
- keep their secret after `#invite=`, so it is not sent in the initial HTTP request

The invitee only chooses a username and password.

## 6. Enable verified-email public signup

Public signup remains disabled unless the auth migration is present and SMTP is configured.

1. Configure authenticated SMTP in the private `molife-config.php`.
2. Verify that the sender domain has the appropriate SPF/DKIM/DMARC setup for the mail service you use.
3. Test delivery to an address you control while registration is still `invite`.
4. Change `registration_mode` to `public`.

MoLife supports STARTTLS (`tls`, commonly port 587) and implicit TLS (`ssl`, commonly port 465). TLS certificates are verified. Public activation links expire after 60 minutes and work once.

If mail delivery or abuse becomes a problem, change the mode back to `invite` or `closed` without redeploying.

## 7. Staying signed in

**Stay signed in on this device** is enabled by default.

Persistent device tokens:

- use a Secure + HttpOnly cookie
- store only the validator hash server-side
- are independent per browser/device
- rotate when restoring a session
- are revoked for the current device on logout

Passwords are never stored in browser storage.

## 8. Existing local data

When an account has no cloud state yet, MoLife checks whether the current browser has meaningful local MoLife data.

- If it does, MoLife asks whether to import it.
- Otherwise the account starts with the default setup.

## 9. Security headers and PHP settings

The repository includes:

- `.htaccess` for browser/security headers where supported
- `.user.ini` for hardened PHP/session defaults where supported

Hosts that do not support these files should configure equivalent settings at the web-server/PHP level.

## 10. Optional GitHub Actions deployment

The repository includes a generic FTPS deployment workflow at:

```
.github/workflows/deploy.yml
```

It looks for exactly one repository-secret trio whose names end with:

```
_FTP_HOST
_FTP_USER
_FTP_PASSWORD
```

Recommended names for a fork are:

```
DEPLOY_FTP_HOST
DEPLOY_FTP_USER
DEPLOY_FTP_PASSWORD
```

An optional secret ending in `_FTP_PATH` can override the remote directory. Without one, the workflow uses a repository-name-based default.

Configure secrets under:

```
Repository → Settings → Secrets and variables → Actions
```

The workflow:

- runs JavaScript and PHP syntax checks
- prepares a clean public deployment directory
- excludes repository documentation, schema/config examples and secret-file patterns
- deploys with explicit TLS (FTPS)
- mirrors deletions as well as additions
- excludes database migrations from the public web deployment
- never commits or uploads the private `molife-config.php`

Adapt the workflow if your hosting provider uses SSH/SFTP, rsync, a platform CLI, containers or another deployment mechanism.

## 11. PWA cache/versioning

A successful deployment can still appear stale if an older service worker controls the page.

For frontend releases, update both:

- the visible app version / cache-busted asset URLs in `index.html`
- the cache name in `service-worker.js`

Authenticated `/api/` traffic must never enter the service-worker cache.

## 12. Production checks

After deployment:

1. confirm the expected visible MoLife version
2. load the app over HTTPS
3. verify `/api/session.php` returns JSON
4. after applying the auth migration, confirm login still works for an existing account
5. confirm owner invite creation/list/revoke still works
6. confirm the private config is not web-addressable
7. confirm no credential file or migration SQL exists inside the public document root
