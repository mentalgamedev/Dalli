# Authentication module

This directory is the reusable authentication boundary for MoLife.

## Structure

- `bootstrap.php` — auth loader and lifecycle constants
- `identity.php` — user/owner lookup and authenticated PHP-session activation
- `sessions.php` — remembered-device credentials and cookie rotation
- `tokens.php` — email normalization, one-use auth tokens, verification URLs, housekeeping and auth throttling helpers
- `invites.php` — owner invitation lifecycle
- `mailer.php` — authenticated SMTP transport and transactional account emails
- `state-bridge.php` — **MoLife compatibility adapter only** for remembered sessions/invites created before the dedicated auth tables existed

The public files one directory up (`login.php`, `register.php`, `verify-email.php`, and so on) remain HTTP adapters. They preserve the existing API contract and are intentionally separate from the auth primitives.

## Reusing this in another project

The modern auth tables and the modules above are designed to be portable together. A new application should provide:

1. database/config helpers equivalent to the small runtime surface in `../bootstrap.php`
2. its own user-state/profile initialization after account creation
3. its own account UI and transactional-email branding
4. the same HTTPS, secure-cookie, CSRF, same-origin and SMTP requirements

`state-bridge.php` is not part of the reusable design. It exists only so old MoLife sessions and invitations continue to migrate safely.

The historical `dalli_*` function and cookie names are retained in v4.8 deliberately. Renaming security-sensitive primitives while restructuring them would add migration risk without improving runtime behavior. New architecture should depend on this directory boundary rather than on the old `auth-store.php` file.

## Compatibility

`../auth-store.php` and `../mailer.php` are compatibility shims. New MoLife endpoint code should include `auth/bootstrap.php` and, when mail is required, `auth/mailer.php`.

This refactor does not change the database schema, cookies, API payloads, token formats, account lifecycle, or registration modes.
