# Self-hosting Dalli

Dalli can be hosted on a conventional PHP + MySQL/MariaDB web host. The public repository intentionally does not contain any production-specific hostnames, account identifiers, credentials or infrastructure details.

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
├── dalli-config.php
└── public-root/
    ├── index.html
    ├── api/
    ├── app.js
    └── ...
```

Do not commit the real config file.

## 2. Database

Create the schema in [schema.sql](schema.sql).

Use a dedicated application database user with only the permissions Dalli needs at runtime:

- SELECT
- INSERT
- UPDATE
- DELETE

Schema-changing and administrative permissions are not required for normal operation.

## 3. Private configuration

Use [config.example.php](config.example.php) as the template for the private `dalli-config.php`.

Fill in:

- database host
- database name
- restricted database username
- database password
- the public HTTPS origin of your Dalli installation
- one long random owner setup token

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
        'origin' => 'https://dalli.example.com',
        'owner_setup_token' => 'A_LONG_RANDOM_SECRET',
    ],
];
```

## 4. First account

Open Dalli normally.

If the database has no users yet, **Create account** becomes the owner-account flow. Enter:

- username
- password
- the private owner setup code

The first account automatically becomes the Dalli owner. Once an owner exists, later registrations require owner-created invite links instead of the setup code.

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

## 6. Staying signed in

**Stay signed in on this device** is enabled by default.

Persistent device tokens:

- use a Secure + HttpOnly cookie
- store only the validator hash server-side
- are independent per browser/device
- rotate when restoring a session
- are revoked for the current device on logout

Passwords are never stored in browser storage.

## 7. Existing local data

When an account has no cloud state yet, Dalli checks whether the current browser has meaningful local Dalli data.

- If it does, Dalli asks whether to import it.
- Otherwise the account starts with the default setup.

## 8. Security headers and PHP settings

The repository includes:

- `.htaccess` for browser/security headers where supported
- `.user.ini` for hardened PHP/session defaults where supported

Hosts that do not support these files should configure equivalent settings at the web-server/PHP level.

## 9. Optional GitHub Actions deployment

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
- never commits or uploads the private `dalli-config.php`

Adapt the workflow if your hosting provider uses SSH/SFTP, rsync, a platform CLI, containers or another deployment mechanism.

## 10. PWA cache/versioning

A successful deployment can still appear stale if an older service worker controls the page.

For frontend releases, update both:

- the visible app version / cache-busted asset URLs in `index.html`
- the cache name in `service-worker.js`

Authenticated `/api/` traffic must never enter the service-worker cache.

## 11. Production checks

After deployment:

1. confirm the expected visible Dalli version
2. load the app over HTTPS
3. verify `/api/session.php` returns JSON
4. create/login to a test account if appropriate
5. confirm the private config is not web-addressable
6. confirm no credential file exists inside the public document root
