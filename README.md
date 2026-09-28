# Dalli

Dalli is a small daily XP game that turns health, work and chores into a balanced daily challenge.

## Core game

- configurable daily XP goal
- weighted category minimums
- editable actions and XP values
- repeatable and once-per-day actions
- undo
- automatic daily rollover
- history
- PWA/offline support

## Accounts and sync

Dalli has a deliberately small private account system:

- the **first account becomes the owner**
- the owner creates one-use invite links from the Account screen
- invited people choose their own username and password
- each user has completely separate actions, settings, XP and history
- users can stay signed in for 30 days on each device
- remembered devices have independent revocable tokens
- cloud state uses optimistic revisions so stale devices cannot silently overwrite newer data
- local browser data remains available when the backend is temporarily unreachable

There is no manual database work when another person joins Dalli. The owner simply creates an invite link and sends it to them.

Invite secrets are placed in the URL fragment (`#invite=...`), so the secret is not sent in the HTTP request or normal server access logs. Invite links are single-use and expire after 7 days.

## First account

Only the first owner account needs a one-time owner setup code from the private server configuration. Once an owner exists, that code is ignored and all further registrations require owner-created invite links.

The earlier public `setup.php` flow has been removed.

## Scoring

For each category:

```
weightedShare = dailyGoal * categoryWeight / sumOfAllCategoryWeights
minimumXP    = round(weightedShare * 0.70)
```

A day is won only when the overall XP goal is reached **and** every category reaches its minimum.

## Storage

Guest/local mode uses browser `localStorage`.

Signed-in users also store their validated Dalli state in MySQL. Server-owned authentication metadata is kept inside a protected envelope in the existing `user_state.state_json` column and is never accepted from, or returned to, the browser as app state.

The database schema remains intentionally tiny:

- `users`
- `user_state`

No schema migration is required for the friendly account/invite system.

## Security

Highlights:

- dedicated Dalli database/user with no schema-changing privileges required
- real DB credentials outside the public document root and outside Git
- PHP `password_hash()` / `password_verify()`
- Secure + HttpOnly + SameSite=Strict cookies
- persistent-login cookies contain random selectors/validators; only validator hashes are stored server-side
- remembered devices use separate tokens and logout revokes the current device token
- persistent tokens rotate when they restore a session
- one-use, expiring invite links; only invite hashes are stored
- first-owner creation protected by a private high-entropy setup code
- CSRF tokens plus same-origin checks
- prepared SQL statements
- login and registration throttling
- strict server-side state validation and payload limits
- no uploads, email, password-reset service or third-party PHP dependencies
- API responses excluded from the service-worker cache
- restrictive browser security headers

See [DEPLOY.md](DEPLOY.md) for deployment and first-account setup.


## Reusable deployment playbook

The lessons from deploying Dalli to lima-city are documented for reuse in future apps:

- [GitHub → lima-city deployment playbook](docs/LIMA_CITY_GITHUB_DEPLOYMENT_PLAYBOOK.md)
