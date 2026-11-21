# RAYFOLD — Handoff

_Last updated: 2026-11-20_

## Where things stand

- App slug: `rayfold-lights` (display name **Rayfold Lights**), owner `u/FoxSilent3186`.
- Version `0.0.1` was uploaded 20 Nov 2026 23:17. The latest help/share/EndCard edits are **not** in that build yet.
- Code work is complete: help sheet, goal strip, first-run manual, share disclosure, app-owned score thread, rewritten README, catalog art.
- Validation passes: 13/13 unit tests, `npm run type-check`, `npm run lint`, `npm run build`.

## Current blocker

Both `npx devvit upload --bump patch` and `npm run dev` fail with:

> Error: You must be logged in to upload a new app version.

`npx devvit whoami` and `npx devvit list apps` work, and the OAuth token is valid. This is a known open Devvit bug: <https://github.com/reddit/devvit/issues/302> — the first upload succeeds, later updates fail with the same login error.

Things to try, in order:

1. Full reset: `npx devvit logout`, delete `%USERPROFILE%\.devvit`, then `npx devvit login` and complete the browser authorize flow.
2. Switch to Node 24 (local is 22.14; `package.json` requires `>=24`).
3. Retry later, from another network, or from another machine.
4. If still blocked, post the exact output in r/Devvit or the Devvit Discord.

## Next steps

1. **Upload**: fix the auth blocker, then run `npx devvit upload --bump patch` and `npm run dev`.
2. **Real playtest** in `r/rayfold_lights_dev`:
   - Log into Reddit in the browser first (the automation browser is currently signed out).
   - Mod menu → **Create Daily RAYFOLD Post**.
   - Verify splash → How to play → solve → **Comment score** → solved card, on desktop and a phone.
   - Check the score comment posts as the player and lands in the app's score thread.
3. **Dedicated subreddit**: create/choose a non-test subreddit (e.g. `r/rayfoldlights`), install the app, create a daily post.
4. **Developer Portal** → `https://developers.reddit.com/apps/rayfold-lights/developer-settings`:
   - In-app catalog: app icon, tile image, featuring asset, featuring description, tile tagline, **Games** category, app subreddit.
   - Submit the catalog assets for review separately from the app publish.
5. **Publish**: `npx devvit publish --public`, then monitor app review.

## Catalog art (ready to upload)

| File | Size | Notes |
| --- | --- | --- |
| `assets/icon.png` | 1024×1024, 475 KB | Under the 500 KB limit; declared in `devvit.json` |
| `assets/tile.png` | 1024×1024 | Tile / compact placement |
| `assets/featured.png` | 1920×1080 | Featuring image |

Editable sources: `assets/src/icon.html`, `assets/src/tile.html`, `assets/src/featured.html`. Re-render with headless Chrome at the matching `--window-size`.

The portal may ask for specific dimensions; these are sized to the standard square icon plus 16:9 featuring layout.

## Listing copy draft

- **App name**: Rayfold Lights
- **Tile tagline**: Fold the light. A new optical puzzle every day.
- **Featuring description**: One beam. Three diamonds. Place mirrors to fold the beam and light every target in this daily logic puzzle. Compete on the leaderboard, keep your streak, and share a spoiler-free score.
- **Category**: Games → Puzzle

## Key files

- `src/client/components/HelpSheet.tsx` — manual overlay and piece legend
- `src/client/game.tsx` — help integration, goal strip, first-run, EndCard username
- `src/client/splash.tsx` — tagline and How to play entry
- `src/client/components/EndCard.tsx` — share disclosure and disabled-after-share state
- `src/server/core/storage.ts` — `ensureShareThread`, cached score-thread ID
- `src/server/core/post.ts` — creates the score thread per daily post
- `src/server/routes/api.ts` — replies to the score thread as the user
- `README.md` — submission-ready documentation
- `devvit.json` — app config, permissions, marketing icon
- `assets/` — catalog art and editable HTML sources

## Useful commands

```bash
npm run dev          # devvit playtest
npm run build        # client + server build
npm run type-check   # TypeScript
npm run lint         # ESLint
npm run test:unit    # 13 tests
npx devvit upload --bump patch
npx devvit publish --public
```
