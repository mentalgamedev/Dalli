# Dalli deployment on lima-city

The public Dalli site is expected to live at:

```
apps/dalli/
```

The real secret configuration lives outside that public directory:

```
apps/dalli-config.php
```

Do not put real database credentials in GitHub.

## 1. Upload the public app

Upload the repository contents into `apps/dalli/`.

Important files include:

- `api/`
- `cloud.js`
- `.htaccess`
- `.user.ini`

The old `setup.php` account-creation page is no longer used and should not exist on the server.

## 2. Private configuration

Copy the structure from `config.example.php` into:

```
apps/dalli-config.php
```

Fill in:

- the exact MySQL host shown by lima-city
- database name `db_430902_10`
- the dedicated restricted Dalli database username
- its password
- `https://dalli.mentalgrounds.com` as the app origin
- one long random owner setup token

Example shape:

```php
<?php
declare(strict_types=1);

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

return [
    'database' => [
        'host' => 'YOUR_LIMA_DB_HOST',
        'name' => 'db_430902_10',
        'user' => 'YOUR_RESTRICTED_DALLI_DB_USER',
        'password' => 'YOUR_DATABASE_PASSWORD',
    ],
    'app' => [
        'origin' => 'https://dalli.mentalgrounds.com',
        'owner_setup_token' => 'A_LONG_RANDOM_SECRET',
    ],
];
```

The code also accepts the older `setup_token` key for compatibility, so an existing private config does not have to be changed immediately.

## 3. Create the owner account

Open Dalli normally.

If the database has no users yet, **Create account** becomes the owner-account flow. Enter:

- username
- password
- the private owner setup code

That first account automatically becomes the Dalli owner.

No database row needs to be inserted manually.

After the owner exists, the owner setup token is ignored by registration. It can remain in the private config, though clearing it afterwards is harmless if preferred.

## 4. Invite another person

While signed in as the owner:

1. Open the Account screen.
2. Select **Create invite link**.
3. Copy the generated link and send it to the person.

The link:

- works once
- expires after 7 days
- contains its secret after `#invite=`, so the secret is not sent to the web server in the initial HTTP request

Opening the link takes the person directly to the Create account flow. They only choose a username and password.

No PHP editing, database editing or setup-token rotation is needed.

## 5. Staying signed in

**Stay signed in on this device** is enabled by default.

When enabled, Dalli creates a random 30-day persistent token:

- the raw validator stays only in the Secure + HttpOnly browser cookie
- MySQL stores only its SHA-256 hash
- each browser/device gets a separate token
- the token rotates when it restores a session
- signing out revokes the current device token

Passwords are never stored in browser storage.

## Existing local Dalli data

When an account has no cloud state yet, Dalli checks whether the current browser has meaningful local Dalli data.

- If it does, Dalli asks whether to import it.
- If it does not, the account simply starts with the default setup.

## Database schema

The existing two tables are sufficient:

- `users`
- `user_state`

The account/invite upgrade does **not** require an SQL migration. Authentication metadata is kept in a server-only envelope inside `user_state.state_json`, while the browser still sees only the normal Dalli app state.

The permanent Dalli DB user can therefore remain read/write only with no schema-changing permissions.

## Security model

- no unrestricted public registration
- owner-only invitation creation
- single-use expiring invites
- no uploads
- no email/password-reset attack surface
- no third-party PHP packages
- PDO prepared statements
- server-side PHP sessions
- Secure + HttpOnly + SameSite=Strict cookies
- session ID regeneration after login
- CSRF protection on authenticated writes
- same-origin validation
- per-IP/per-username login throttling
- per-IP registration throttling
- strict server-side state validation and payload limits
- optimistic revision checking for multi-device state
- API data never cached by the service worker
- private config outside the public document root
- restrictive browser security headers

## If the backend is unavailable

Dalli still keeps a local browser copy. Guest/local mode continues to work, and signed-in changes can remain local until the backend becomes reachable again.


## Automatic GitHub deployment

Dalli can deploy automatically to lima-city whenever `main` changes.

The workflow is stored in:

```
.github/workflows/deploy.yml
```

It deploys only the public application to:

```
apps/dalli/
```

The private configuration at `apps/dalli-config.php` sits outside that directory and is never touched.

### One-time GitHub secrets

In the GitHub repository, open:

```
Settings → Secrets and variables → Actions → New repository secret
```

Create these three secrets:

- `LIMA_FTP_HOST` — the FTP host from lima-city's FTP access page (normally `<ftp-user>.lima-ftp.de`)
- `LIMA_FTP_USER` — the lima-city FTP username
- `LIMA_FTP_PASSWORD` — the FTP password

Do not store the MySQL password here; deployment needs only the FTP credentials.

After the secrets exist, run:

```
Actions → Deploy Dalli → Run workflow
```

Once that first deployment succeeds, every future push to `main` deploys automatically.

The workflow:

- runs syntax checks before uploading
- uses explicit TLS (FTPS)
- mirrors GitHub's public app files into `apps/dalli/`
- removes live files that were deleted from GitHub
- includes hidden public files such as `.htaccess` and `.user.ini`
- excludes GitHub metadata, documentation, schema files, config examples and secrets
- refuses to deploy anywhere except the hard-coded `apps/dalli` target

If the three GitHub secrets are missing, the workflow exits successfully without deploying anything.
