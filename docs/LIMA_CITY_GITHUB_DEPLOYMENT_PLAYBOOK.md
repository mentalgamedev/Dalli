# Reusable App Deployment Playbook: GitHub → lima-city

This is the deployment pattern proven while building and deploying Dalli. It is written to be reusable for future small web apps and repositories hosted under the same lima-city account.

## 1. Recommended architecture

Use a dedicated subdomain and a dedicated document root for each app.

Example:

```
apps/
├── myapp/                 ← public document root for myapp.example.com
└── myapp-config.php       ← private server config, outside the document root
```

The subdomain should point directly to the app folder, not to a parent containing secrets.

For Dalli this pattern is:

```
dalli.mentalgrounds.com → apps/dalli/
apps/dalli-config.php   → private config outside the public root
```

### Why this matters

If the app is compromised, keeping secrets outside its document root reduces accidental exposure. A PHP guard inside a config file is useful defense in depth, but it is not a substitute for keeping the file outside the public root.

A private config can also include a direct-execution guard:

```php
<?php
declare(strict_types=1);

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

return [
    // private configuration
];
```

## 2. Database setup

Prefer one dedicated database user per app.

Recommended permissions for a normal runtime app user:

- SELECT
- INSERT
- UPDATE
- DELETE

Avoid schema-changing or administrative permissions for the permanent application user unless the app truly needs them.

### Important lima-city lesson: do not guess the database host

The correct host depends on the type of database user.

For the Dalli webspace-only database user, lima-city explicitly showed:

```
MySQL-Server/Host (lokal): localhost
MySQL-Server/Host (extern): —
Port: 3306
```

So the correct app connection host was:

```php
'host' => 'localhost',
```

This is an important distinction:

```
database host   ≠ database username
database host   ≠ FTP host
database host   ≠ public domain
```

Always copy the exact value displayed in the lima-city database-user panel.

### Minimal PHP PDO connection pattern

```php
$pdo = new PDO(
    'mysql:host=' . $host . ';dbname=' . $database . ';charset=utf8mb4',
    $username,
    $password,
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
);
```

Use prepared statements for all values supplied by users.

## 3. Repository structure

A small app repository can stay simple:

```
.github/
  workflows/
    ci.yml
    deploy.yml

api/
  ...

index.html
app.js
styles.css
service-worker.js
manifest.webmanifest
.htaccess
.user.ini
.gitignore
README.md
DEPLOY.md
```

Files that contain real credentials should never be committed.

Example `.gitignore` entries:

```gitignore
dalli-config.php
.env
.env.*
*.local.php
```

A committed `config.example.php` is useful as long as it contains placeholders only.

## 4. GitHub repository secrets

For deployment, store FTP credentials in:

```
Repository
→ Settings
→ Secrets and variables
→ Actions
→ New repository secret
```

Recommended secret names:

```
LIMA_FTP_HOST
LIMA_FTP_USER
LIMA_FTP_PASSWORD
```

Do not put passwords directly into workflow YAML.

Do not confuse FTP credentials with MySQL credentials. Deployment needs only FTP/FTPS access.

## 5. Automatic GitHub → lima-city deployment

The working Dalli workflow uses:

- GitHub Actions
- `lftp`
- explicit TLS / FTPS
- a hard-coded remote target
- `mirror --reverse --delete`

The central deployment command is:

```bash
lftp -u "${LIMA_FTP_USER}","${LIMA_FTP_PASSWORD}" "ftp://${LIMA_FTP_HOST}" -e "
  set cmd:fail-exit yes;
  set ftp:ssl-force yes;
  set ftp:ssl-protect-data yes;
  set ssl:verify-certificate yes;
  set net:max-retries 2;
  set net:timeout 20;
  set net:reconnect-interval-base 5;
  mirror --reverse --delete --verbose --parallel=4 --no-perms _deploy/ ${REMOTE_DIR}/;
  bye;
"
```

### Hard-code or tightly control the remote directory

For a small app, explicitly limit the destination:

```bash
REMOTE_DIR="apps/myapp"

if [[ "${REMOTE_DIR}" != "apps/myapp" ]]; then
  echo "::error::Refusing to deploy to an unexpected remote directory."
  exit 1
fi
```

This reduces the chance of accidentally mirroring files into the main website or another subdomain.

## 6. Build a clean deployment directory first

Do not blindly upload the whole repository.

Create a staging directory and exclude development-only files:

```bash
mkdir -p _deploy

rsync -a ./ _deploy/ \
  --exclude '.git/' \
  --exclude '.github/' \
  --exclude '_deploy/' \
  --exclude 'README.md' \
  --exclude 'DEPLOY.md' \
  --exclude 'schema.sql' \
  --exclude 'config.example.php' \
  --exclude 'myapp-config.php' \
  --exclude '.env' \
  --exclude '.env.*'
```

Keep public runtime files such as:

- `.htaccess`
- `.user.ini`
- frontend files
- PHP API files

## 7. Important deployment failure we hit

This command caused a failed run:

```bash
mkdir -p apps/dalli
```

Inside `lftp`, lima-city returned FTP error 550 when the directory already existed. Because the workflow used fail-fast behavior, the harmless “already exists” response stopped deployment.

The fix was simple: do not create a known existing app directory before mirroring into it.

Lesson:

> With FTP clients, shell-style `mkdir -p` semantics are not guaranteed.

## 8. CI before deployment

Run syntax checks before files are uploaded.

For a vanilla JS + PHP app:

```bash
node --check app.js
node --check cloud.js
node --check service-worker.js

find . -name '*.php' -not -path './.git/*' -print0 | xargs -0 -n1 php -l
```

Also fail if a live config was accidentally committed:

```bash
test ! -e myapp-config.php
test ! -e .env
```

This catches many mistakes before production is touched.

## 9. Suggested GitHub Actions workflow

Reusable starting point:

```yaml
name: Deploy App

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: app-production
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Check deployment secrets
        id: preflight
        env:
          LIMA_FTP_HOST: ${{ secrets.LIMA_FTP_HOST }}
          LIMA_FTP_USER: ${{ secrets.LIMA_FTP_USER }}
          LIMA_FTP_PASSWORD: ${{ secrets.LIMA_FTP_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail

          if [[ -z "${LIMA_FTP_HOST}" || -z "${LIMA_FTP_USER}" || -z "${LIMA_FTP_PASSWORD}" ]]; then
            echo "configured=false" >> "${GITHUB_OUTPUT}"
            echo "::notice::Deployment secrets are not configured."
            exit 0
          fi

          echo "configured=true" >> "${GITHUB_OUTPUT}"

      - name: Run syntax checks
        if: steps.preflight.outputs.configured == 'true'
        shell: bash
        run: |
          set -euo pipefail
          node --check app.js
          find . -name '*.php' -not -path './.git/*' -print0 | xargs -0 -n1 php -l
          test ! -e myapp-config.php
          test ! -e .env

      - name: Build deployment directory
        if: steps.preflight.outputs.configured == 'true'
        shell: bash
        run: |
          set -euo pipefail

          mkdir -p _deploy

          rsync -a ./ _deploy/ \
            --exclude '.git/' \
            --exclude '.github/' \
            --exclude '_deploy/' \
            --exclude 'README.md' \
            --exclude 'DEPLOY.md' \
            --exclude 'schema.sql' \
            --exclude 'config.example.php' \
            --exclude 'myapp-config.php' \
            --exclude '.env' \
            --exclude '.env.*'

      - name: Install FTPS client
        if: steps.preflight.outputs.configured == 'true'
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y -qq lftp

      - name: Deploy
        if: steps.preflight.outputs.configured == 'true'
        env:
          LIMA_FTP_HOST: ${{ secrets.LIMA_FTP_HOST }}
          LIMA_FTP_USER: ${{ secrets.LIMA_FTP_USER }}
          LIMA_FTP_PASSWORD: ${{ secrets.LIMA_FTP_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail

          REMOTE_DIR="apps/myapp"

          if [[ "${REMOTE_DIR}" != "apps/myapp" ]]; then
            echo "::error::Unexpected remote directory."
            exit 1
          fi

          lftp -u "${LIMA_FTP_USER}","${LIMA_FTP_PASSWORD}" "ftp://${LIMA_FTP_HOST}" -e "
            set cmd:fail-exit yes;
            set ftp:ssl-force yes;
            set ftp:ssl-protect-data yes;
            set ssl:verify-certificate yes;
            set net:max-retries 2;
            set net:timeout 20;
            set net:reconnect-interval-base 5;
            mirror --reverse --delete --verbose --parallel=4 --no-perms _deploy/ ${REMOTE_DIR}/;
            bye;
          "
```

Change only the app-specific filenames and remote directory.

## 10. Service-worker and cache lesson

A PWA can make a successful deployment look broken because an old service worker may continue serving cached frontend assets.

Use both:

1. a new service-worker cache name when releasing frontend changes
2. versioned asset URLs in `index.html`

Example:

```html
<link rel="stylesheet" href="styles.css?v=2.3.0">
<script src="app.js?v=2.3.0" defer></script>
```

and:

```js
const CACHE = 'myapp-v2-3';
```

For authenticated apps, do not cache account or state APIs:

```js
if (url.pathname.includes('/api/')) {
  return;
}
```

API responses should also send:

```
Cache-Control: no-store
```

## 11. Version label lesson

A small visible version label is extremely useful during deployment debugging.

Example:

```
v2.3.0 · online
```

It immediately answers:

> Am I looking at the new deployed frontend or an old cached copy?

This is especially valuable for PWAs.

## 12. Testing a PHP/MySQL backend

A simple authenticated-session endpoint can double as a deployment health check.

Example browser-console request:

```js
fetch('/api/session.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: '{}'
})
.then(async response => ({
  status: response.status,
  body: await response.json()
}))
.then(console.log);
```

A successful response proves several layers at once:

```
web server
→ PHP
→ private config
→ database host
→ database credentials
→ database permissions
→ required tables
```

If it fails, return non-sensitive diagnostic messages and log the detailed error server-side.

## 13. Security pattern for small private apps

A good small-app baseline:

- separate document root
- secrets outside document root
- secrets excluded from Git
- dedicated restricted DB user
- PDO prepared statements
- server-side sessions
- Secure + HttpOnly + SameSite cookies
- session ID regeneration after login
- CSRF protection
- same-origin checks
- request/body size limits
- server-side input validation
- login throttling
- no error details exposed to users
- no wildcard CORS
- no unnecessary uploads
- no unnecessary admin UI
- no third-party backend dependencies unless they are justified
- restrictive browser security headers
- API responses never cached
- syntax checks before production deployment

## 14. Files worth keeping outside the public root

Typical:

```
apps/
├── myapp/
│   ├── index.html
│   ├── app.js
│   ├── api/
│   ├── .htaccess
│   └── .user.ini
│
└── myapp-config.php
```

The deployment workflow should touch only `apps/myapp/`.

## 15. Safe update workflow

For future projects:

```
feature work
→ branch
→ syntax/CI checks
→ pull request
→ merge to main
→ automatic FTPS deployment
→ visible version check
→ quick health check
```

For very small changes, direct pushes to `main` can work, but a feature branch + PR is safer for changes affecting authentication, storage or migrations.

## 16. Rollback

Because production mirrors GitHub `main`, rollback is straightforward:

1. identify the last known-good commit
2. revert the bad commit in GitHub
3. push/merge the revert to `main`
4. automatic deployment mirrors the known-good files back to production

Do not manually patch production unless there is an emergency, because that creates drift between GitHub and the live server.

## 17. New-app checklist

Before deploying a new app:

- [ ] create app folder under `apps/`
- [ ] create subdomain pointing directly to that folder
- [ ] create a dedicated database if needed
- [ ] create a restricted runtime DB user
- [ ] copy the exact lima-city DB host shown for that user
- [ ] place app secrets outside the public app folder
- [ ] create GitHub repository
- [ ] add `.gitignore` secret exclusions
- [ ] add CI syntax checks
- [ ] add deployment workflow
- [ ] add GitHub FTP secrets
- [ ] hard-code/check the intended remote directory
- [ ] run the workflow manually once
- [ ] verify the live version label
- [ ] test the backend health endpoint
- [ ] confirm secret/config files are not web-accessible
- [ ] confirm obsolete live files are removed by deployment

## 18. Dalli-specific proven result

Dalli established that this setup works end-to-end:

```
GitHub main
→ GitHub Actions
→ CI syntax checks
→ FTPS
→ lima-city apps/dalli/
→ dalli.mentalgrounds.com
```

The private config remains outside the deployment target, so normal code deployments do not overwrite database credentials or private app secrets.
