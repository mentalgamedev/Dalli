# MoLife

MoLife is a small daily XP game from the deeply questionable civic ecosystem of **Crestfallen**, allegedly powered by **mo.les.tech**. It turns everyday tasks into a daily challenge without requiring every part of life to receive attention every single day.

## Core loop

1. Do actions to deal **Damage**.
2. Each action has a base Damage value.
3. A category's **Focus** directly scales its damage: higher Focus means less damage per action and therefore more real activity required from that category.
4. Each completed action in a category makes the next action from that category weaker through **100% → 65% → 40% → 25%** resistance tiers.
5. Reduce today's **Dark Doppelgänger** to 0 HP.
6. A victory awards exactly **20 Victory XP** once for that calendar day.
7. Receive an official *Crestfallen Daily* battle report.

There are no mandatory categories. A work-only day is valid; Dark Doppelgänger simply becomes increasingly resistant to repeated attacks from the same category. Damage after defeat is retained as **overkill** but never awards extra Victory XP.

The interface treats this as a finite daily fight, not an endless self-improvement meter: Dark Doppelgänger gets one prominent fighting-game HP bar, HP never drops below 0, and anything after the victory is optional.

### Fixed daily enemy strength

The configured enemy HP is the exact strength of every new Dark Doppelgänger. MoLife no longer ramps enemy HP upward with victories. Today's max HP is snapshotted when the fight begins, so changing difficulty in Settings affects the next daily fight and never rewrites the current one.

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


## Tenacious & Phat Ed's Pawnshop

Actions can be marked **Required for victory**. Repeatable actions can also define a **Required repetitions** count of 1–1000; once-per-day actions always require exactly one completion. At the start of each daily fight, MoLife snapshots each required action together with its required count. Changing those settings later affects the next daily fight rather than rewriting today's rules. Deleting an action removes it from today's snapshot so a fight can never become impossible.

While any required repetitions remain unfinished, Dark Doppelgänger is **TENACIOUS**. Normal action and combo damage can still accumulate, but it cannot finish the fight: once lethal damage has been reached, the displayed HP is held at 1 until all required repetitions have been completed. Track-o-Tron shows per-action progress such as **REQUIRED · 1 / 3**, keeps unfinished required actions at the top of their category, and visually marks them with a gold treatment. If the last outstanding requirement is completed after lethal damage is already banked, the enemy immediately goes down.

A lethal item from **Phat Ed's Pawnshop** can bypass Tenacious. Using an item does not switch Tenacious off globally; the item simply ignores the 1 HP survival rule for its own hit. Item use is explicit, consumes the item immediately, ignores category resistance, and records an immutable item transaction.

Victories can generate a mystery Pawnshop crate. Each newly defeated day rolls once at a 40% drop chance, but no new crate is issued while the player already carries 8 or more items. The roll is persisted for that day, so undoing and re-defeating cannot reroll it. Existing migrated inventories over the cap are never deleted; new drops resume after the inventory falls below 8.

Current item pool, preserving the same rarity/damage ladder as the old contraband system:

- **MoLight Pro** — 10 base DMG
- **Cosmic Laser Gun** — 20 base DMG
- **Flash Tube** — 25 base DMG
- **Light Rabbit Launcher** — 30 base DMG
- **Sunflower Beam** — 35 base DMG
- **Light Sword** — 40 base DMG
- **Rite Of Illumination** — 999 DMG, always special and always an instant kill at current HP limits

Normal items also roll a condition. Better conditions are progressively rarer:

- **Questionable** — ×0.5
- **Standard** — ×1.0
- **Pimped** — ×1.5
- **Over-engineered** — ×2.0

**Rite Of Illumination** does not roll a condition. Item rarity and condition rarity are weighted separately. Item cards reveal short Phat Ed descriptions on hover/focus or tap, while actual consumption requires a separate **USE ITEM** control. Unopened victory crates are automatically stashed at day rollover so a reward is not lost merely because the player forgot to tap it.


## Crestfallen connections

MoLife is designed as a small in-universe artifact from **Cosmic Trouble**, not as a conventional advertisement. The app links to the game unobtrusively in the footer and in Settings:

[Cosmic Trouble (Steam)](https://store.steampowered.com/app/3214490/Cosmic_Trouble/)

The Newswire has a dedicated contextual pool of spoiler-safe Crestfallen references. Public-facing material can mention characters and places such as **Lester Mogreen**, **Phat Ed’s Pawnshop**, **mo.les.tech**, the **Crestfallen Library**, and the **old municipal bathhouse**. A few deliberately cryptic reports about binary chanting or strange underground infrastructure are allowed because they do not reveal more than the game’s opening premise.

Content rule for future additions:

> MoLife may reveal the existence and public-facing identity of Cosmic Trouble characters, places, businesses, institutions and opening-premise rumors, but must not reveal later story events, hidden relationships, motives, cult plans, mysteries or supernatural explanations.

Private residents and protagonist-level characters are intentionally excluded from MoLife’s ambient public-news flavor; the crossover stays focused on people and places that plausibly belong in a citywide ticker.

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

The header contains a reactive fake news feed that comments on the current fight: Dark Doppelgänger HP, damage, combos, overkill, yesterday's result, rank, streak, level and category resistance. It also mixes in a small deterministic sample of tagged Crestfallen-world reports so references react to context such as Pawnshop items, loot, Tenacious status, work, combos, overkill and late-night activity without overwhelming the MoLife-specific feed. Before victory it reports on the ongoing hostilities; after defeat it becomes reluctantly congratulatory. On wider layouts the Newswire spans the full app width instead of staying inside the brand column.


## Static ambient background

MoLife deliberately uses a non-reactive dark ambient background with soft purple, light-blue and muted-orange radial glows. There is no device-tilt or pointer-reactive Motion FX system. Installed PWAs still request **portrait-primary** orientation in the web app manifest; MoLife also opportunistically asks the Screen Orientation API for portrait when running standalone.

## Track-o-Tron## Track-o-Tron

The main action area is branded **Track-o-Tron**. Category action decks keep a consistent height. They only become independent scroll surfaces when their actions actually overflow; otherwise swiping through the action area continues to scroll the page normally. Scrollable decks allow normal scroll chaining at their edges.

## Categories and actions

- Settings save automatically; there is no separate Save button
- valid edits take effect on the live Track-o-Tron shortly after editing, and closing Settings flushes any pending valid change
- categories are fully editable
- every regular category has a user-selectable **Color**
- MoLife derives a safe bright accent plus darker/desaturated panel, action, border and glow variants from that one color
- category **Focus** is an inverse damage scaler: action damage is divided by Focus before category resistance is applied
- default Focus is **Wellbeing 1 / Work 1.5 / Chores 0.75**, so Work requires more activity per point of configured base Damage while Chores requires less
- action order is editable by dragging the reorder handle; this order is reflected inside each Track-o-Tron category
- the Actions section has one-shot sorting by **category**, **Damage (high to low)** or **name (A to Z)**
- action editor rows inherit the same derived category tint system as the front-page action area
- actions have editable base Damage values
- actions can be repeatable or once-per-day
- every action has a **Show in Track-o-Tron** toggle and a **Required for victory** toggle; required actions are forced visible and promoted to the top of their Track-o-Tron category
- repeatable Required actions have an editable integer **Required repetitions** value; once-per-day actions are fixed at 1
- combos are user-defined ordered sequences of 2–8 action IDs with configurable ×1.05–×3.00 multipliers; unrelated actions do not break progress and repeated action IDs are allowed
- combo bonuses use the matched actions' actual effective damage, are logged as separate damage events, and can repeat after a sequence resets
- default action wording is intentionally qualitative rather than timed: **Quick movement / stretch**, **Walk / fresh air**, **Proper workout**, **Proper healthy meal**, **Focus session**, **Deep focus session**, **Practice / skill**, **Annoying admin task**, **Tiny chore**, **Proper chore / cleaning**, **Laundry**, **Big chore / deep clean**
- deleting a category moves its actions to **Uncategorized**
- Uncategorized is a permanent fallback with fixed 50% damage and a fixed neutral slate color


## Settings templates

Settings can be exported as a small JSON **template** and imported later to swap between different challenge setups. A template contains the configured enemy HP plus categories, colors, Focus values, actions, ordering, visibility, Required-for-victory flags and repetition counts, damage values, category links, combos and combo action links.

Templates deliberately do **not** behave like save-game backups. Importing one leaves Level, Victory XP, Street Cred, streak/history, today's already-recorded damage and Phat Ed's Pawnshop inventory untouched. Current combo progress is reset because the imported combo definitions may differ; today's Required snapshot only loses requirements whose action IDs no longer exist.

## History and statistics foundation

Action transactions retain immutable action/category identity, base Damage, effective Damage, efficiency and timestamp. Combo bonus transactions retain the combo identity, multiplier, bonus Damage and the source transaction IDs that produced them. Pawnshop item transactions retain the consumed item and actual damage dealt. Undoing a source action therefore also removes dependent combo bonuses and can revoke today's victory, its 20 XP and any still-current victory loot unless a remaining lethal item transaction independently bypasses Tenacious.

Detailed events are retained for recent history while compact daily summaries can remain longer.

## Accounts and sync

MoLife is local-first: the app works without an account, while signed-in users can sync their state across devices.

MoLife v4.7 adds an optional **verified-email public signup** flow on top of the v4.6 auth foundation:

- public signup collects username, email and password
- new public accounts remain `pending` until the email address is verified
- activation uses a cryptographically random, one-use token that expires after 60 minutes
- the usable activation secret lives in the URL fragment (`#verify=...`), so it is not sent in the initial HTTP request or normal access logs
- only a SHA-256 hash of the activation secret is stored server-side
- activation signs the user in and then uses the existing local-to-cloud import flow
- activation emails can be resent; issuing a replacement invalidates the previous token
- abandoned unverified accounts are eligible for automatic cleanup after 48 hours
- existing owner-created invite links still work and remain an immediate trusted registration path

Public signup is operationally fail-closed. It is exposed only when all three conditions are true: the modern auth schema is present, `registration_mode` is `public`, and authenticated SMTP is fully configured. Setting registration to `invite` or `closed` immediately removes public account creation without disabling existing accounts.

MoLife v4.7.1 adds an **owner-only SMTP diagnostic** in the Account dialog. The signed-in owner can send a real test message through the configured transactional mail transport while registration remains in `invite` mode. The endpoint requires the owner role, same-origin requests and a valid CSRF token; SMTP failures are written to the server error log while the browser receives only a generic failure message.

To avoid turning registration into an email-address lookup service, registration and resend use the same outward success response whether an address is new, pending, or already attached to an active account. An existing account receives a private informational email instead.

Cloud state still uses optimistic revisions so stale devices cannot silently overwrite newer data, and local browser data remains available when the backend is temporarily unreachable.

## Storage

Guest/local mode uses browser `localStorage`.

Signed-in users store validated MoLife game state in MySQL/MariaDB-compatible storage. Authentication data is server-owned and separated from gameplay state:

- `users` — identity, role, account status and verified email metadata
- `user_state` — validated MoLife game state
- `auth_sessions` — remembered-device credentials
- `auth_tokens` — invitations and temporary one-use account tokens
- `auth_rate_limits` — pseudonymized anti-abuse counters

Legacy remembered-device tokens and invitations remain readable only for migration compatibility.

MoLife gameplay state remains **v6** and deliberately retains the existing browser storage keys.

## Security

Highlights:

- database and SMTP credentials kept outside the public document root and outside Git
- restricted runtime database user
- Argon2id where available, otherwise PHP's adaptive default password hashing
- automatic password rehashing after successful login when parameters improve
- Secure + HttpOnly + SameSite=Strict cookies
- random selector/validator remembered-device credentials with only validator hashes stored server-side
- persistent tokens rotate when they restore a session
- one-use, expiring email-verification and invite tokens; only secret hashes are stored
- verification secrets use URL fragments to reduce accidental server/log exposure
- authenticated SMTP with certificate verification; no dependency on PHP `mail()`
- explicit owner role and active/pending account status
- registration kill switch (`public`, `invite`, `closed`)
- independent account/IP login throttling plus public-registration and verification-resend throttling
- HMAC-pseudonymized rate-limit bucket identifiers
- privacy-preserving public-registration responses for email addresses
- hidden bot-trap field as a low-friction supplemental anti-automation check
- first-owner creation protected by a private high-entropy setup code
- CSRF protection plus same-origin checks
- PDO prepared statements
- strict server-side state validation and payload limits
- API responses excluded from the service-worker cache
- restrictive browser security headers

## Auth architecture

MoLife v4.8 separates authentication from game-state validation. The reusable auth runtime now lives under `api/auth/`, while the MoLife-specific state schema validator lives in `api/molife-state.php`. The old `api/auth-store.php` and `api/mailer.php` paths remain as compatibility shims so the restructuring does not change production behavior.

The auth directory contains focused modules for identity/session handling, remembered-device credentials, invitations, one-use verification tokens, housekeeping and SMTP. The only MoLife-specific piece inside that directory is `state-bridge.php`, which exists solely to migrate legacy pre-auth-schema session/invite data. See `api/auth/README.md` for the portability boundary.

## Self-hosting

See [DEPLOY.md](DEPLOY.md) for the provider-neutral self-hosting guide.
