# MoLife

MoLife is a small daily XP game from the deeply questionable civic ecosystem of **Crestfallen**, allegedly powered by **mo.les.tech**. It turns everyday tasks into a daily challenge without requiring every part of life to receive attention every single day.

## Core loop

1. Do actions to deal **Damage**.
2. Each action has a base Damage value.
3. A category's **Focus** determines how long it stays at full damage efficiency.
4. Repeating the same category gradually drops its damage through 100% → 80% → 60% → 40%.
5. Reduce today's **Dark Doppelgänger** to 0 HP.
6. A victory awards exactly **20 Victory XP** once for that calendar day.
7. Receive an official *Crestfallen Daily* battle report.

There are no mandatory categories. A work-only day is valid; Dark Doppelgänger simply becomes increasingly resistant to repeated attacks from the same category. Damage after defeat is retained as **overkill** but never awards extra Victory XP.

The interface treats this as a finite daily fight, not an endless self-improvement meter: Dark Doppelgänger gets one prominent fighting-game HP bar, HP never drops below 0, and anything after the victory is optional.

### Starter difficulty ramp

The configured enemy HP is the **full / mature** strength. New or reset games begin at roughly 60% of that target and move one step closer every two victories, reaching full strength after 16 victories. Missed days do not make the game harder. With the default full strength of 100 HP, the progression is:

`60 → 60 → 65 → 65 → 70 → 70 → 75 ... → 100`

Today's max HP is snapshotted when the fight begins. Changing difficulty in Settings only affects future fights.

## Progression

MoLife tracks three different kinds of progress:

- **Level / Victory XP** — permanent progress from successful daily fights. Each victory awards 20 XP, and action grinding cannot inflate Level directly.
- **Street Cred / Rank** — consistency over the rolling last 30 days. A victory counts; overkill does not.
- **Streak** — consecutive victorious calendar days, plus the best streak.

Current ranks:

- Nobody
- Low-Life
- Hustler
- Thug
- Gangsta
- Kingpin
- Head Honcho


## Arsenal & contraband

Victories can generate **contraband drops**. Each newly defeated day rolls once for a mystery crate; the current drop chance is 40%. The roll is persisted for that day, so undoing and re-defeating the same fight cannot be used to reroll the crate.

Weapons live in a persistent Arsenal and can be fired only while today's Dark Doppelgänger is still alive. Firing consumes the weapon immediately, ignores category resistance, and records a weapon damage transaction. This provides an intentionally limited way to cash in previous successful days when the player wants to preserve a streak without doing the usual actions.

Current weapon pool:

- **Snub Nosed** — 10 base DMG
- **Sawed Off** — 20 base DMG
- **Tommy Gun** — 25 base DMG
- **Grenade Launcher** — 30 base DMG
- **Bazooka** — 35 base DMG
- **Flamethrower** — 40 base DMG
- **Golden Gun** — 999 DMG, always special and always an instant kill at current HP limits

Normal weapons also roll a condition. Better conditions are progressively rarer:

- **Rusty** — ×0.5
- **Clean** — ×1.0
- **Pimped** — ×1.5
- **Over-engineered** — ×2.0

Golden Gun does not roll a condition. Weapon rarity and condition rarity are weighted separately, making Rusty Snub Nosed the most common combination while high-end hardware and high-end condition combinations are increasingly scarce. Unopened victory crates are automatically moved into the Arsenal when the day rolls over so a reward is not lost merely because the player forgot to tap it.

## Crestfallen Daily

Defeating Dark Doppelgänger creates a persistent newspaper-style battle report containing enemy HP, total damage, overkill, combos landed, Victory XP, Street Cred and Streak.

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

The header contains a reactive fake news feed that comments on the current fight: Dark Doppelgänger HP, damage, combos, overkill, yesterday's result, rank, streak, level and category resistance. Before victory it reports on the ongoing hostilities; after defeat it becomes reluctantly congratulatory. On wider layouts the Newswire spans the full app width instead of staying inside the brand column.


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
- action order is editable by dragging the reorder handle; this order is reflected inside each Track-o-Tron category
- the Actions section has one-shot sorting by **category**, **Damage (high to low)** or **name (A to Z)**
- action editor rows inherit the same derived category tint system as the front-page action area
- actions have editable base Damage values
- actions can be repeatable or once-per-day
- every action has a **Show in Track-o-Tron** toggle; hiding it keeps the action and its configuration without showing it on the main board
- combos are user-defined ordered sequences of 2–8 action IDs with configurable ×1.05–×3.00 multipliers; unrelated actions do not break progress and repeated action IDs are allowed
- combo bonuses use the matched actions' actual effective damage, are logged as separate damage events, and can repeat after a sequence resets
- default action wording is intentionally qualitative rather than timed: **Quick movement / stretch**, **Walk / fresh air**, **Proper workout**, **Proper healthy meal**, **Focus session**, **Deep focus session**, **Practice / skill**, **Annoying admin task**, **Tiny chore**, **Proper chore / cleaning**, **Laundry**, **Big chore / deep clean**
- deleting a category moves its actions to **Uncategorized**
- Uncategorized is a permanent fallback with fixed 50% damage and a fixed neutral slate color


## Settings templates

Settings can be exported as a small JSON **template** and imported later to swap between different challenge setups. A template contains the configured enemy HP plus categories, colors, Focus values, actions, ordering, visibility, damage values, category links, combos and combo action links.

Templates deliberately do **not** behave like save-game backups. Importing one leaves Level, Victory XP, Street Cred, streak/history, today's already-recorded damage and the Arsenal untouched. Current combo progress is reset because the imported combo definitions may differ.

## History and statistics foundation

Action transactions retain immutable action/category identity, base Damage, effective Damage, efficiency and timestamp. Combo bonus transactions retain the combo identity, multiplier, bonus Damage and the source transaction IDs that produced them. Weapon transactions retain the consumed inventory item and actual damage dealt. Undoing a source action therefore also removes dependent combo bonuses and can revoke today's victory, its 20 XP and any still-current victory loot.

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

MoLife v4.2 uses gameplay state **v4** while deliberately retaining the existing browser storage keys. v2 still migrates through the damage/victory model, and v3 migrates in place into v4 with an empty Arsenal and no retroactive weapon drops. Existing categories, Focus, colors, actions, ordering, visibility, combos, history and progression remain intact.

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
