# Dalli

Dalli is a small daily XP game that turns everyday tasks into a balanced daily challenge.

## Core features

- configurable daily XP goal
- weighted category minimums
- editable categories and actions
- repeatable and once-per-day actions
- undo
- automatic daily rollover
- history
- PWA/offline support
- optional private accounts and cross-device sync

## Accounts and sync

Dalli has a deliberately small private account system:

- the **first account becomes the owner**
- the owner creates one-use invite links from the Account screen
- invited people choose their own username and password
- each user has separate categories, actions, settings, XP and history
- users can stay signed in for 30 days on each device
- remembered devices have independent revocable tokens
- cloud state uses optimistic revisions so stale devices cannot silently overwrite newer data
- local browser data remains available when the backend is temporarily unreachable

Invite secrets live in the URL fragment (`#invite=...`), so the secret is not sent in the initial HTTP request or normal access logs. Invite links are single-use and expire after 7 days.

## Scoring

For each weighted category:

```
weightedShare = dailyGoal * categoryWeight / sumOfAllWeightedCategoryWeights
minimumXP    = round(weightedShare * 0.70)
```

A day is won only when the overall XP goal is reached **and** every weighted category reaches its minimum.

`Uncategorized` is a fallback category. Its XP counts toward the daily total but it does not add a balance requirement.

## Storage

Guest/local mode uses browser `localStorage`.

Signed-in users store their validated Dalli state in MySQL/MariaDB-compatible storage. Server-owned authentication metadata is kept in a protected envelope in `user_state.state_json` and is never accepted from, or returned to, the browser as app state.

The database schema is intentionally small:

- `users`
- `user_state`

## Security

Highlights:

- database credentials kept outside the public document root and outside Git
- restricted application database user
- PHP `password_hash()` / `password_verify()`
- Secure + HttpOnly + SameSite=Strict cookies
- persistent-login cookies use random selectors/validators; only validator hashes are stored server-side
- remembered devices use separate tokens and logout revokes the current device token
- persistent tokens rotate when they restore a session
- one-use, expiring invite links; only invite hashes are stored
- first-owner creation protected by a private high-entropy setup code
- CSRF protection plus same-origin checks
- PDO prepared statements
- login and registration throttling
- strict server-side state validation and payload limits
- no uploads, email, password-reset service or third-party PHP dependencies
- API responses excluded from the service-worker cache
- restrictive browser security headers

## Self-hosting

See [DEPLOY.md](DEPLOY.md) for a provider-neutral self-hosting guide.
