# Dalli

Dalli is a small daily XP game that turns health, work and chores into a balanced daily challenge.

## Current version

The `main` branch contains the original local/offline Dalli V1.2.

The `online-v2` branch adds an intentionally small PHP/MySQL online layer for private accounts and cross-device synchronization.

### Core game

- configurable daily XP goal
- weighted category minimums
- editable actions and XP values
- repeatable and once-per-day actions
- undo
- automatic daily rollover
- history
- PWA/offline support

### Online V2

- private username/password accounts
- separate state per user
- cloud synchronization between devices
- local browser copy retained
- revision checks to prevent stale-device overwrites
- no public signup, uploads, email or third-party PHP dependencies

## Scoring

For each category:

```
weightedShare = dailyGoal * categoryWeight / sumOfAllCategoryWeights
minimumXP    = round(weightedShare * 0.70)
```

A day is won only when the overall XP goal is reached **and** every category reaches its minimum.

## Storage

Guest/local mode uses browser `localStorage`.

Signed-in users also store their own validated Dalli state in MySQL. Each user can have completely different categories, actions, weights, XP values and history.

## Security

Dalli V2 is deliberately designed as a tiny private application rather than a general-purpose user platform.

Highlights:

- dedicated Dalli database/user
- real database credentials kept outside the public document root and outside Git
- PHP `password_hash()` / `password_verify()`
- server-side sessions with Secure, HttpOnly and SameSite=Strict cookies
- CSRF tokens plus same-origin checks
- prepared SQL statements
- login throttling
- strict server-side state validation and payload limits
- no public registration
- no uploads
- no third-party PHP dependencies
- API/state responses excluded from service-worker caching
- optimistic revisions for safe multi-device sync
- restrictive security headers

See [DEPLOY.md](DEPLOY.md) for the lima-city deployment procedure.

## Database schema

The schema is recorded in [schema.sql](schema.sql). The current database consists of only:

- `users`
- `user_state`

The application user should have read/write access only to the Dalli database and no schema-changing privileges.
