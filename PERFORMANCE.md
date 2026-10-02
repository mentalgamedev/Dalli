# MoLife frontend performance audit

Audit date: 2026-10-02  
Baseline reviewed: v4.17 / `cc5604cd741db218947290b6b57f3014fabab514`  
Scope: static code audit of the current browser frontend. This is not a hardware benchmark, so the priorities below identify plausible main-thread and GPU bottlenecks that should be verified with DevTools on representative older Android/iOS hardware.

## Executive summary

The most convincing potential source of interaction jank is not the Pawnshop grid itself but the broad `render()` path. Common gameplay actions rebuild the Pawnshop, every category/action card, combos, the current log and recent history even when only a small part of the screen changed. Persistence then serializes the entire state synchronously, writes it to `localStorage`, and signed-in users also pay for a full deep clone before the cloud layer's debounced save.

The moving Newswire and several visual effects add continuous or GPU-side work. v4.18 reduces several of those costs without changing gameplay architecture. The larger renderer/persistence items deserve a dedicated pass because changing them casually would increase state-regression risk.

## Findings

### High priority — full application re-render after routine gameplay actions

`render()` calls `renderHero`, `renderProgression`, `renderPawnshop`, `renderCategories`, `renderCombos`, `renderLog` and `renderHistory`. Routine actions such as attacking, using a One-off, changing Focus, undoing, claiming loot and using a Pawnshop item call that full path.

`renderCategories()` is particularly expensive because it preserves scroll positions, removes the existing category tree, clones templates, creates action/One-off controls and registers fresh event listeners. `renderLog()` similarly rebuilds every current transaction row, and `renderHistory()` recreates up to 14 history rows.

Why this can hurt older devices: DOM allocation, style calculation, layout and garbage collection all happen immediately after a tap, at the same time attack-feedback or modal animation begins.

Recommended follow-up: split the renderer into targeted updates. An action should update the fight HUD, affected category, combo state and log incrementally; structural/category changes can retain the current full rebuild. This is the highest-value optimization but also the one requiring the most regression testing.

### High priority — synchronous save and clone work on the interaction path

`saveState()` performs `JSON.stringify(state)` and `localStorage.setItem(...)` synchronously. For signed-in users it then calls `deepClone(state)`, which currently performs another JSON stringify + parse before the cloud layer queues the snapshot. The network save itself is debounced, but the clone is not.

The state is bounded, which is good: history is capped at 365 days and detailed transaction history is retained for 90 days. Even so, serialization cost grows with history/current transactions and blocks the main thread.

Recommended follow-up: avoid cloning the complete state on every gameplay tap. Options include creating the immutable cloud snapshot only when the debounce actually flushes, passing a serialized snapshot to the cloud queue, or introducing a dirty/revision model. Keep immediate local-save reliability unless that requirement is deliberately changed.

### Medium priority — Newswire animation

Before v4.18 the Newswire scheduled a continuous `requestAnimationFrame` loop and read `scrollWidth` during every active animation frame. Repeated geometry reads mixed with style writes can force layout work, and 60 transform writes per second are unnecessary for a ticker moving only 36 px/s.

v4.18 mitigation:
- cache message width once when the message changes
- remove the per-frame `scrollWidth` read
- limit transform writes to roughly 30 fps
- stop the loop while the document is hidden
- stop the loop while `prefers-reduced-motion` is active

Further option: move the ticker to CSS/Web Animations with a duration calculated from message width.

### Medium priority — translucent/blurred dialog backdrops

Settings, day-card and attack-report overlays use `backdrop-filter: blur(...)`. Backdrop filters require the browser/GPU to sample and blur content behind the overlay and are a common weak point on older mobile GPUs. The app also uses many layered gradients and shadows; those are individually reasonable but cumulative.

v4.18 mitigation: at widths up to 620 px, dialog backdrops no longer request blur. The dark overlay remains, so readability and modal separation are preserved.

Recommended follow-up: if real-device profiling still shows compositor pressure, add a user-facing Reduced Effects mode or a mobile effects profile that simplifies the fixed background noise layer, large radial gradients and large soft shadows.

### Medium/low priority — action-deck scroll geometry reads

Each category action list watches `scroll` and checks `scrollHeight`, `clientHeight` and `scrollTop` to drive overflow affordances.

v4.18 mitigation: those measurements are coalesced to at most one `requestAnimationFrame` callback per action deck instead of running directly for every scroll event.

### Low priority — forced reflow when victory presentation starts

`queueVictoryDayCard()` removes a class, reads `document.body.offsetWidth`, then reapplies the class to restart an animation. That explicit layout flush is infrequent and only occurs on victory, so it is unlikely to explain general UI lag.

Recommended follow-up: only change this if profiling shows a noticeable long frame during victory. The animation can instead be restarted with a double-rAF strategy or the Web Animations API.

### Low priority — Settings drag-and-drop geometry

During action reordering, pointer movement queries sibling rows with `getBoundingClientRect()` and also measures the settings dialog. This can be costly with a very large action list, but it only runs while the user is actively dragging in Settings.

Recommended follow-up: cache row rectangles at drag start and refresh them only after reorder/autoscroll boundaries change.

## What is probably not the main problem

The current JavaScript and CSS are a few hundred kilobytes combined and static assets are service-worker cached. Parse/compile cost exists on older devices, but the more convincing causes of visible interaction lag are repeated DOM reconstruction, synchronous persistence work and GPU-heavy effects.

The eight-slot Pawnshop itself is small. The v4.17 inline inspection panel was primarily a mobile UX problem rather than a meaningful performance bottleneck.

## Suggested optimization order

1. Profile an action tap on an older Android device using Chrome Performance, from tap through attack-report opening.
2. Refactor common gameplay updates away from full `render()` rebuilds.
3. Move cloud snapshot creation off the immediate save path or avoid duplicate whole-state serialization.
4. Re-test with dialog blur already disabled on mobile and the v4.18 Newswire changes.
5. Only then consider a broader Reduced Effects mode or settings-editor drag optimizations.

## Regression requirements for a larger optimization pass

Any renderer/save optimization should explicitly verify Focus/resistance math, Required/Tenacious state, combos, One-offs, undo restoration, loot rolls/claims, item consumption, starter-item migration, victory XP/day cards, guest-to-account import behavior and cloud conflict/revision handling. Performance work here should not become a stealth gameplay-state rewrite.
