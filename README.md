# MoLife

MoLife is a small daily XP game from the deeply questionable civic ecosystem of **Crestfallen**, allegedly powered by **mo.les.tech**. It turns everyday tasks into a daily challenge without requiring every part of life to receive attention every single day.

## Core loop

1. Do reusable **Actions** or clear temporary **One-offs** to deal **Damage**.
2. Each attack has a base Damage value.
3. One category can be marked **FOCUSED** directly in Track-o-Tron. Its action damage is divided by the global Focus factor, so that area demands more real activity.
4. Repeating actions from the same category builds resistance along the familiar **100% → 65% → 40% → 25%** base curve, with a global Resistance buildup setting controlling how strongly that curve is applied.
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

Actions can be marked **Required for victory**. Repeatable actions can also define a **Required repetitions** count of 1–1000; **Daily** actions always require exactly one completion. At the start of each daily fight, MoLife snapshots each required action together with its required count. Changing those settings later affects the next daily fight rather than rewriting today's rules. Deleting an action removes it from today's snapshot so a fight can never become impossible.

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

## Track-o-Tron

The main action area is branded **Track-o-Tron**. Category action decks keep a consistent height. They only become independent scroll surfaces when their actions actually overflow; otherwise swiping through the action area continues to scroll the page normally. Scrollable decks allow normal scroll chaining at their edges.

## Categories and actions

- Settings save automatically; there is no separate Save button
- valid edits take effect on the live Track-o-Tron shortly after editing, and closing Settings flushes any pending valid change
- categories are fully editable
- every regular category has a user-selectable **Color**
- MoLife derives a safe bright accent plus darker/desaturated panel, action, border and glow variants from that one color
- exactly one normal category can be marked **FOCUSED** at a time from Track-o-Tron; clicking it again clears Focus
- the global **Focused category factor** is an inverse damage scaler applied only to that selected category before resistance; the default is **1.5×**
- the global **Resistance buildup** setting applies an exponent to the existing category resistance curve; **1.0** reproduces the original curve, **0** disables resistance, and the default **0.75** is gentler
- action order is editable by dragging the reorder handle; this order is reflected inside each Track-o-Tron category
- the Actions section has one-shot sorting by **category**, **Damage (high to low)** or **name (A to Z)**
- action editor rows inherit the same derived category tint system as the front-page action area
- actions have editable base Damage values
- reusable actions can be **Repeatable** or **Daily**; the internal legacy `once` identifier remains unchanged for compatibility
- every reusable action has a **Show in Track-o-Tron** toggle and a **Required for victory** toggle; required actions are forced visible and promoted to the top of their Track-o-Tron category
- repeatable Required actions have an editable integer **Required repetitions** value; Daily actions are fixed at 1
- each category has a quick **+ ONE-OFF** control for temporary unfinished business such as calls, forms or errands
- One-offs persist across days until completed, use the normal category Focus/resistance damage calculation, never participate in Combos or Required-for-victory rules, and disappear immediately after use
- undoing a One-off transaction restores the pending One-off so accidental taps are reversible
- combos are user-defined ordered sequences of 2–8 action IDs with configurable ×1.05–×3.00 multipliers; unrelated actions do not break progress and repeated action IDs are allowed
- combo bonuses use the matched actions' actual effective damage, are logged as separate damage events, and can repeat after a sequence resets
- default action wording is intentionally qualitative rather than timed: **Quick movement / stretch**, **Walk / fresh air**, **Proper workout**, **Proper healthy meal**, **Focus session**, **Deep focus session**, **Practice / skill**, **Annoying admin task**, **Tiny chore**, **Proper chore / cleaning**, **Laundry**, **Big chore / deep clean**
- deleting a category moves its actions to **Uncategorized**
- Uncategorized is a permanent fallback with fixed 50% damage and a fixed neutral slate color


## Settings templates

Settings can be exported as a small JSON **template** and imported later to swap between different challenge setups. A template contains the configured enemy HP plus focused-category selection/factor, Resistance buildup, categories, colors, reusable actions, ordering, visibility, Required-for-victory flags and repetition counts, damage values, category links, combos and combo action links.

Templates deliberately do **not** behave like save-game backups. Pending One-offs are intentionally excluded because they are unfinished tasks rather than challenge rules. Importing a template leaves One-offs, Level, Victory XP, Street Cred, streak/history, today's already-recorded damage and Phat Ed's Pawnshop inventory untouched. Current combo progress is reset because the imported combo definitions may differ; today's Required snapshot only loses requirements whose action IDs no longer exist.

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

MoLife provides owner-only mail diagnostics in the Account dialog. The signed-in owner can send a real test message through the configured transactional mail transport while registration remains in `invite` mode. The security status also checks the configured sender domain for SPF and DMARC records; if an optional `dkim_selector` is configured, it checks the corresponding DKIM TXT record too. These checks are diagnostics rather than a guarantee of inbox placement: provider reputation and recipient filtering remain external to MoLife.

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

## v4.9 — Department of Uninvited Citizens

Public registration is treated as expendable infrastructure: if signup traffic becomes abusive, MoLife closes new registration before it risks the rest of the application.

Default server-side safeguards include:

- global registration budgets of 40/hour and 200/24h, in addition to existing per-IP/per-email limits
- global account-email budgets of 60/hour and 300/24h
- a maximum of 200 pending unverified accounts
- fail-closed abuse controls for public registration and verification resend
- bounded housekeeping for expired sessions/tokens/pending accounts
- one duplicate-account notification per address per 24h
- fixed 30-day lifetime for remembered-device credentials (secret rotation no longer extends expiry)
- permanent owner-setup lockout once any account exists
- active-account validation before protected cloud-state access
- activation requires both the one-use email token and the password chosen during registration
- an owner-only **Public registration firewall** status panel
- conservative host-only HSTS (`max-age=604800`, no preload or subdomain inheritance)
- production deployment is gated on the full MySQL/auth integration suite and followed by a live auth health check

The limits can be overridden through the private `security` config section. Existing installations need no config or database migration for v4.9; the defaults apply automatically.

## v4.10 — Bureau of Selective Priorities

Focus is now a live Track-o-Tron choice instead of a permanent per-category property. One category can be marked **FOCUSED** at a time; its future action damage is divided by the global Focus factor. Existing v6 data migrates automatically by selecting the strongest old Focus value above 1× (the default setup therefore keeps Work focused at 1.5×). Old templates with per-category Focus values are also translated on import.

Resistance keeps the same underlying 100% → 65% → 40% → 25% curve, but the global **Resistance buildup** factor controls how aggressively it applies. The default is 0.75 for a gentler curve; 1.0 is the original behavior and 0 disables resistance.

## v4.11 — Bureau of Unnecessary Force

Track-o-Tron action clicks now open an **Internal Hostility Report** so every registered attack gets unmistakable feedback. The report shows direct damage, base damage, effective damage percentage, remaining enemy HP, combo bonus damage when applicable, and outstanding Required-action status.

Each report also generates deterministic Crestfallen incident copy tailored to the hit. If lethal normal damage is blocked by Tenacious, the report explicitly records the Dark Doppelgänger's administrative return to 1 HP and the number of Required moves still outstanding. A successful finishing attack hands off to the existing *Crestfallen Daily* victory report after the attack report is dismissed.

This pass is presentation-only: it does not change the state schema, damage calculation, Required-action rules, combo math, undo behavior or cloud validation.

## v4.11.1 — Department of Invisible Bureaucracy

Fix public-account activation on browsers that enforce native form constraint validation before dispatching the submit event. The verification screen now disables and un-requires every hidden registration/login control, so the password-only activation request cannot be silently blocked by the hidden required username field.

The auth dialog also explicitly enforces `display: none` for elements carrying `hidden`, preventing authored flex/grid rules from making the login/register tabs or remembered-device row reappear on the activation screen.

## v4.12 — Department of Unfinished Business

The action-feedback popup is now deliberately compact. It keeps only the action name, direct damage, target HP, short Crestfallen incident copy, and conditional Combo/Tenacious information. The dialog resets to the top whenever it opens and is sized to stay comfortably within a normal phone viewport; the full *Crestfallen Daily* remains the detailed victory report.

Track-o-Tron now supports persistent **One-offs** for procrastinated tasks that should disappear when completed rather than become permanent habit definitions. One-offs are created directly inside a category with a name and base Damage value, persist across daily rollover, use normal Focus/resistance damage, never join Combos or Required rules, and are removed after their hit. Undo restores them. Existing once-per-day reusable actions are presented as **Daily** actions to distinguish the two concepts.

Public activation email is intentionally more conventional: the subject is **Confirm your email for MoLife**, the primary copy clearly describes account confirmation, and generated Message-IDs use the configured sender domain rather than the web-server hostname. Owner security status now exposes SPF/DMARC presence and optional DKIM-selector diagnostics. This improves the signals under MoLife's control, while acknowledging that spam-folder placement still depends heavily on the SMTP provider, DNS authentication, reputation and the recipient's filters.

## v4.12.1 — Bureau of Adequate Elbow Room

A tiny Track-o-Tron polish pass: One-off helper copy is shortened to **“Disappears when done”**, and One-off damage values get a few extra pixels of right-side breathing room.

## v4.13 — Bureau of Consolidated Reputation

The three separate **Street Cred**, **Level** and **Win Streak** cards are consolidated into a single profile dossier and moved below Phat Ed's Pawnshop, reducing the amount of long-term progression UI competing with the daily fight near the top of the page. Desktop keeps the three records side by side inside one frame; narrower layouts collapse them within that same dossier.

The signed-in Profile button now has a stronger dossier-style treatment and shows the current Level in a small circular badge at its upper-right corner. The badge follows the live Level display as Victory XP changes.

Attack reports use the shorter topline label **ATTACK** instead of **ATTACK REGISTERED**.

## v4.13.1 — Department of False Alarms

The signed-in account button keeps its slightly more deliberate styling, but the **PROFILE** kicker and circular Level badge are removed. The button now shows only the username, avoiding the Level indicator reading like an unread-notification badge.

## v4.14 — Department of Positive Reinforcement

Attack feedback now frames a completed action as damage **dealt** rather than health lost: the impact block shows a positive value such as **+15 DMG** with the enemy's remaining HP kept separate underneath the action name. Non-Tenacious attack reports move away from danger-red toward teal/violet reward accents, use more successful-hit status wording, and draw from a slightly more triumphant Crestfallen incident-copy pool.

The attack report also becomes another deliberately light-touch **Cosmic Trouble** crossover point. The existing Steam CTA style from Settings is reused in a compact block. It is guaranteed on the first attack report seen by a browser/install, then appears only occasionally afterwards (deterministically about one in eleven attack reports). The promo does not affect gameplay state or cloud sync and remains separate from the normal report when not selected.

## Self-hosting

See [DEPLOY.md](DEPLOY.md) for the provider-neutral self-hosting guide.
