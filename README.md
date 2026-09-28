# MoLife

MoLife is a small daily XP game from the deeply questionable civic ecosystem of **Crestfallen**, allegedly powered by **mo.les.tech**. It turns everyday tasks into a daily challenge without requiring every part of life to receive attention every single day.

## Core loop

1. Do actions to earn XP.
2. Each action has a base XP value.
3. A category's **Focus** determines how long it stays at full XP efficiency.
4. Repeating the same category gradually drops its payout through 100% → 80% → 60% → 40%.
5. Reach the daily effective-XP goal to clear the day.
6. Receive an official *Crestfallen Daily* report about whatever you just did.

There are no mandatory categories. A work-only day is valid; it simply becomes less XP-efficient as that category gets saturated.

### Starter difficulty ramp

The configured XP goal is the **full / mature** daily target. New or reset games begin at roughly 60% of that target and move one step closer every two cleared days, reaching the full goal after 16 cleared days. Missed days do not make the game harder. With the default full goal of 100 XP, the progression is:

`60 → 60 → 65 → 65 → 70 → 70 → 75 ... → 100`

This makes the first week intentionally forgiving while allowing the same action economy to become steadily more demanding.

## Progression

MoLife tracks three different kinds of progress:

- **Level** — permanent lifetime progress from all effective XP, even on days that are not cleared. Every new level costs more XP than the last.
- **Street Cred / Rank** — consistency over the rolling last 30 days. A cleared day counts; grinding extra XP on one day does not.
- **Streak** — consecutive cleared calendar days, plus the best streak.

Current ranks:

- Nobody
- Low-Life
- Hustler
- Thug
- Gangsta
- Kingpin
- Head Honcho

## Crestfallen Daily

Clearing a day creates a persistent newspaper-style report based on how the day went.

MoLife can classify days as things such as:

- Corporate Drone
- Domestic Menace
- Wellness Criminal
- One-Track Mind
- Suspiciously Functional Adult
- Technically Victorious
- Needs Intervention

Reports are deterministic local content; they do not require an AI service.


## Crestfallen Newswire

The header contains a reactive fake news feed that comments on actual game state: current XP, remaining XP, yesterday's result, rank, streak, level and category saturation. Before the daily goal is reached it mostly mocks the lack or insufficiency of progress; after clearance it becomes reluctantly congratulatory. On wider layouts the Newswire spans the full app width instead of staying inside the brand column.


## Motion FX

MoLife has optional device-orientation effects on supported mobile browsers. Enabling Motion FX treats the device's starting pose as neutral, so it behaves consistently whether the phone is held normally or lying flat. The Newswire runs faster at rest than before, and tilting left or right acts as a symmetric fast-forward control. Small roll/pitch/yaw changes produce a deliberately stronger, more colorful background shimmer. MoLife verifies that real sensor samples are arriving instead of assuming the API works, and falls back to gravity data from `devicemotion` when orientation events are unavailable. If no samples arrive, Settings reports that explicitly. Orientation values are used live in the browser and are not stored in game state or sent to the server. Browsers that require sensor permission only request it from the explicit **Enable Motion FX** button. Desktop pointer movement provides a subtle shimmer equivalent, and reduced-motion preferences disable the effect.

Installed PWAs request **portrait-primary** orientation in the web app manifest; MoLife also opportunistically asks the Screen Orientation API for portrait when running standalone. Normal browser tabs remain under browser/OS control.

## Track-o-Tron

The main action area is branded **Track-o-Tron**. Category action decks keep a consistent height. They only become independent scroll surfaces when their actions actually overflow; otherwise swiping through the action area continues to scroll the page normally. Scrollable decks allow normal scroll chaining at their edges.

## Categories and actions

- Settings save automatically; there is no separate Save button
- valid edits take effect on the live Track-o-Tron shortly after editing, and closing Settings flushes any pending valid change
- categories are fully editable
- every regular category has a user-selectable **Color**
- MoLife derives a safe bright accent plus darker/desaturated panel, action, border and glow variants from that one color
- category **Focus** controls diminishing returns
- default Focus is **Wellbeing 1 / Work 1.5 / Chores 0.75** so focused work has a larger natural daily budget than chores
- actions have editable base XP values
- actions can be repeatable or once-per-day
- every action has a **Show in Track-o-Tron** toggle; hiding it keeps the action and its configuration without showing it on the main board
- default action wording is intentionally qualitative rather than timed: **Quick movement / stretch**, **Walk / fresh air**, **Proper workout**, **Proper healthy meal**, **Focus session**, **Deep focus session**, **Practice / skill**, **Annoying admin task**, **Tiny chore**, **Proper chore / cleaning**, **Laundry**, **Big chore / deep clean**
- deleting a category moves its actions to **Uncategorized**
- Uncategorized is a permanent fallback with a fixed 50% payout and fixed neutral slate color

## History and statistics foundation

Each XP transaction records enough immutable information for later statistics:

- timestamp and date
- action ID and action name at the time
- category ID and category name at the time
- base XP
- effective XP
- efficiency multiplier

Detailed events are retained for recent history while compact daily summaries can remain longer.

## Accounts and sync

MoLife has a deliberately small private account system:

- the **first account becomes the owner**
- the owner creates one-use invite links from the Account screen
- invited people choose their own username and password
- each user has separate game state
- users can stay signed in for 30 days on each device
- remembered devices have independent revocable tokens
- cloud state uses optimistic revisions so stale devices cannot silently overwrite newer data
- local browser data remains available when the backend is temporarily unreachable

Invite secrets live in the URL fragment (`#invite=...`), so the secret is not sent in the initial HTTP request or normal access logs. Invite links are single-use and expire after 7 days.

## Storage

Guest/local mode uses browser `localStorage`.

Signed-in users store their validated MoLife state in MySQL/MariaDB-compatible storage. Server-owned authentication metadata is kept in a protected envelope in `user_state.state_json` and is never accepted from, or returned to, the browser as app state.

The database schema remains intentionally small:

- `users`
- `user_state`

MoLife v3 intentionally starts a fresh gameplay state when it encounters an older incompatible game-state version. Accounts and authentication remain intact.

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

See [DEPLOY.md](DEPLOY.md) for the provider-neutral self-hosting guide.
