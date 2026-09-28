# Dalli V2 deployment on lima-city

The public Dalli site is expected to live at:

```
apps/dalli/
```

and the real secret configuration must live **outside** that public directory:

```
apps/dalli-config.php
```

Do not put real database credentials in this GitHub repository.

## 1. Upload the public files

Upload the repository contents into `apps/dalli/`.

The important new files are:

- `api/`
- `cloud.js`
- `setup.php`
- `.htaccess`
- `.user.ini`

Do **not** upload `config.example.php` as the live configuration.

## 2. Create the private configuration

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

Use a long random `setup_token` temporarily.

The repository's PHP code intentionally resolves the configuration with:

```
dirname(Dalli public root) / dalli-config.php
```

so the password is not web-addressable.

## 3. Create the first account

With a temporary `setup_token` configured, open:

```
https://dalli.mentalgrounds.com/setup.php
```

Enter:

- the setup token
- a username
- a password of at least 12 characters

The password is hashed server-side with PHP `password_hash(PASSWORD_DEFAULT)` before it is written to MySQL.

Immediately after account creation, edit `apps/dalli-config.php` and set:

```php
'setup_token' => '',
```

With an empty token, `setup.php` returns 404 and cannot create accounts.

To create another private account later, temporarily set a new random setup token, create the account, then clear the token again.

## 4. Sign in

Open Dalli normally and use the **Sign in** button.

On the first login to an empty account, Dalli asks whether to import the current local Dalli state or start fresh.

Each account has:

- its own actions
- its own categories and weights
- its own daily target
- its own XP log and history

## Security model

The V2 backend deliberately has a small attack surface:

- no public registration
- no password-reset system
- no email
- no uploads
- no third-party PHP packages
- PDO prepared statements only
- server-side PHP sessions
- Secure + HttpOnly + SameSite=Strict session cookies
- session ID regeneration after login
- CSRF tokens on authenticated writes
- same-origin validation on state-changing requests
- per-IP/per-username login throttling
- strict server-side validation and a 256 KiB state limit
- optimistic revision checks so stale devices cannot silently overwrite newer cloud data
- API responses are never cached by the service worker
- configuration is expected outside the public document root
- restrictive browser security headers in `.htaccess`

The Dalli database user should remain limited to the Dalli database and should not have schema-changing privileges.

## If the backend is unavailable

The browser copy still writes to local storage. When signed out, Dalli works as a local-only app. When signed in and the server becomes temporarily unreachable, changes remain local and Dalli retries cloud saving.
