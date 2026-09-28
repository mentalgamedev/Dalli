# Dalli

Dalli is a tiny offline-first daily task game.

## What it does

- Three default categories: Health, Work, Chores
- Default daily goal: 100 XP
- Weighted category minimums so one category cannot carry the whole day
- Default balance rule: every category must reach 70% of its weighted share
- Editable daily goal and category weights
- Add/edit/remove actions with XP values
- Inline action editing for name, category, XP and repeatability
- Repeatable and once-per-day actions
- One-click XP collection
- Undo from today's log
- Automatic daily rollover and local history
- Victory state once both total XP and category minimums are satisfied
- Local-only storage: no account, server or tracking
- Installable/offline-capable when served over HTTP/HTTPS

## Running it

### Easiest local test

Open `index.html` in a browser. Core functionality works directly from the file.

### Recommended local server

For the install/offline service worker, serve the folder over HTTP. If Python is installed:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

### GitHub Pages

Upload these files to a GitHub repository and enable GitHub Pages for the repository. The app has no backend and is ready for static hosting.

## Scoring algorithm

For each category:

```
weightedShare = dailyGoal * categoryWeight / sumOfAllCategoryWeights
minimumXP    = round(weightedShare * 0.70)
```

A day is won only when:

1. Total XP is at least the daily goal, AND
2. Every category has reached its minimum XP.

With a 100 XP goal and weights of 1 / 1 / 1, each category requires about 23 XP and the remaining XP may come from anywhere.

With weights of 2 / 1 / 1, the minimums are about 35 / 18 / 18 XP.

## Adding another category later

The UI renders categories dynamically. Add another object to the `categories` array in `DEFAULT_STATE` inside `app.js`, for example:

```js
{ id: 'creative', name: 'Creative', icon: '✦', weight: 1 }
```

Then add actions whose `categoryId` is `creative`. Existing rendering and balance calculations automatically include the new category.

Note: existing browser saves keep their saved category list. For development, clear this app's Local Storage to reload new defaults, or add a migration later.


## Save-data compatibility

Dalli intentionally keeps the original `dailyXpGame.v1` local-storage key so existing Daily XP saves continue to work after the rename.
