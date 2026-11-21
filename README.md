# RAYFOLD

**RAYFOLD** (published on Reddit as **Rayfold Lights**) is a daily optical logic puzzle built for Reddit with Devvit. Each UTC day, players get one 6×6 optical bench: an amber emitter fires a beam, and the player folds that beam with mirrors to light three diamond targets. It is a short, spoiler-friendly daily ritual with a shared leaderboard, streaks, and a community heatmap.

The app is designed for Reddit communities that want a lightweight daily game. It is a **game**, not a moderation tool: there is no moderation surface, no external network access, and no user-generated free text.

---

## What players do

1. Open the daily RAYFOLD post in the community.
2. Tap **Play today's puzzle** to expand the game.
3. Place mirrors on the grid:
   - First tap on an empty cell places a `/` mirror.
   - Second tap rotates it to `\`.
   - Third tap removes it.
4. Light all three diamond targets with one continuous beam.
5. Stay within the mirror budget. **Par** is the fewest mirrors required.
6. Submit is automatic once the board is solved within budget.
7. After solving, players can compare against the par solution, view the community heatmap, inspect the top-five leaderboard, and optionally post a spoiler-free score comment.

Daily state:

- One board per UTC day, selected deterministically from a bank of 90 solver-verified puzzles.
- The sequence wraps after 90 days.
- Streaks advance on consecutive daily solves.
- The leaderboard prioritizes fewest mirrors, then fewest beam bounces.
- The board resets at 00:00 UTC.

### Pieces

| Piece | Appearance | Behavior |
| --- | --- | --- |
| Emitter | Amber aperture on the border | Fires the beam in a straight line |
| Mirror | `/` or `\` on a cell | Turns the beam 90°; player-placed |
| Prism | Small triangle | Splits the amber beam into cyan and magenta beams |
| Target | Hollow diamond | Must be lit; fills in when the beam reaches it |
| Blocker | Hatched chamfered cell | Stops the beam; cannot be built on |

A **Help** button in the game explains these pieces, the mirror cycle, par, hints, and the post-solve tools. First-time players see the manual once automatically; it can be reopened at any time.

---

## For community moderators

### Create the daily post

1. Install RAYFOLD in the community.
2. Open the subreddit's three-dot menu and choose **Create Daily RAYFOLD Post**.
3. Pin the post if you want the daily board at the top of the feed.

The app also registers a scheduler task (`daily-post`, cron `0 0 * * *`) that creates the day's post automatically once the app is installed. The menu action is useful for testing or for creating a post manually.

### Recommended setup for a game community

- Use a dedicated community for the game rather than a test subreddit.
- Keep one daily post pinned; players use the same post all day.
- The app account owns the post so the thread stays stable if a moderator leaves.
- Score comments are posted only after a player explicitly taps **Comment score**, and they are posted from that player's account. The app creates one pinned score thread per daily post so score replies stay together.

---

## Data and privacy

RAYFOLD stores only the data needed for the daily game:

- Reddit user ID and username (for streaks and leaderboard display)
- Daily solve state, mirror map, mirror count, and bounce count
- Streak, last-solved date, and total solve count
- Per-day community totals and per-cell placement counts
- A per-post flag recording whether a player has already shared a score comment

All of this is stored in Devvit's hosted Redis for the installation. The app does **not** call external services, does not use HTTP fetch, does not collect personal information beyond the Reddit account identifiers above, and does not sell or share data. Score comments are public Reddit comments and are subject to Reddit's normal comment controls and deletion behavior.

Players can remove their score comment using Reddit's standard comment controls. For data questions or deletion requests, contact the community moderators or open an issue in the project repository.

---

## How it is built

- **Client:** React 19, Tailwind CSS 4, Vite, and a Canvas renderer for the optical bench.
- **Server:** Hono on the Devvit serverless runtime, with server-authoritative solve validation.
- **Shared:** puzzle selection, beam tracing, solver, progress, and API contracts.
- **Storage:** Devvit Redis.
- **Puzzles:** 90 precomputed seeds in `src/shared/rayfold/seeds.json`, selected by UTC date from `2026-01-01`. `scripts/generate-seeds.ts` is the offline generator/validator used to produce that bank; puzzles are not generated per request.
- **Entry points:** `splash.html` (inline launch screen) and `game.html` (expanded game).

### Configuration (`devvit.json`)

- `permissions.redis`: daily state, leaderboard, heatmap, and share flags
- `permissions.journeys`: product analytics journeys
- `permissions.reddit.asUser: ["SUBMIT_COMMENT"]`: posts score comments as the player, only after the explicit **Comment score** action
- `post.entrypoints.default`: inline splash
- `post.entrypoints.game`: expanded game
- `menu`: moderator-only **Create Daily RAYFOLD Post** action
- `triggers.onAppInstall`: install handler
- `scheduler.tasks.daily-post`: creates the daily post at 00:00 UTC

No secrets, API keys, or external endpoints are required.

---

## Local development

Requirements: Node.js 24 (see `.nvmrc`; the Devvit toolchain warns on older Node versions).

```bash
npm install
npm run dev        # devvit playtest: live app on Reddit
npm run build      # build client and server
npm run type-check # TypeScript project check
npm run lint       # ESLint
npm run test:unit  # unit tests
```

### Regenerate the puzzle bank

```bash
node --experimental-strip-types scripts/generate-seeds.ts
```

The generator constructs candidate boards, verifies uniqueness and solver optimality, and writes `src/shared/rayfold/seeds.json`. It is intentionally offline: every player must receive the same board for a given UTC day.

### Deploy and publish

```bash
npx devvit upload              # private version + playtest subreddit
npx devvit upload --bump patch # explicit patch bump after changes
npx devvit publish --public    # submit the latest version for Reddit review
```

`devvit publish` requires the playtest to be complete and a descriptive README (this file). Reddit review evaluates the app description, the example post, and the documented feature set.

---

## Project layout

```text
src/
  client/        React splash, expanded game, canvas renderer, audio, analytics
  server/        Hono routes, daily post creation, Redis storage, scheduler
  shared/        API types, puzzle bank/selection, raycaster, solver, progress
scripts/         Offline puzzle-bank generator
```

---

## Support

- Open an issue in this repository for bugs or feature requests.
- Contact the moderators of the community where RAYFOLD is installed.
- Devvit platform documentation: <https://developers.reddit.com/docs>

## License

BSD-3-Clause. See `LICENSE`.
