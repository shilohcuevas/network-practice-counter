# Project progress log

This log summarizes the current state of the browser RPG and the main decisions made during the migration, production-safety, balance, combat, and UI work. It intentionally excludes real player data, account credentials, secrets, and protected save-file contents.

Last updated: 2026-07-08

## Current branch and deployment model

- Development branch: `codex-migration`
- Production branch: `main`
- GitHub repository: `shilohcuevas/network-practice-counter`
- Render watches `main` and auto-deploys production from that branch.
- Current local development branch is intended to be reviewed and merged into `main` deliberately.
- Do not merge into `main` casually; production player persistence and deployment checks matter.

## Current production posture

- Render service is configured for one instance.
- Production uses a persistent disk mounted at `/opt/render/project/src/data`.
- Production save path is configured with `SAVE_FILE=/opt/render/project/src/data/players.json`.
- The file-backed storage and in-memory sessions remain a single-instance architecture.
- Sessions and active fights can reset on server restart, but saved character progress persists.
- Horizontal scaling, zero-downtime deploys, and multi-instance play should wait for a database-backed storage plan, likely PostgreSQL.

## Security and data-safety work completed

- Login/register flow uses server-side authentication.
- Sessions are stored in HttpOnly cookies.
- Passwords use scrypt hashing.
- Legacy plaintext passwords are automatically migrated to hashed passwords.
- Player saves are written through atomic JSON persistence.
- Production startup refuses unsafe production storage when `SAVE_FILE` is missing.
- Real player save files, migrated saves, backups, environment files, logs, and generated dependency folders are ignored by Git.
- Protected production player data was restored outside Git and must remain outside Git.

## Gameplay systems currently implemented

- Town hub
- Work
- Training
- Healing at the inn
- Combat
- Enemy selection
- Enemy unlock purchases
- Victory/defeat flow
- Server-authoritative cooldowns
- Server-authoritative combat state

Current enemy progression tiers:

- Rat
- Slime
- Goblin
- Orc
- Troll

Current balance shape:

- Work gives reliable money.
- Training spends money to improve damage or maximum HP.
- Healing costs money per missing HP.
- Defeat returns the player with partial HP.
- Higher enemies require unlocks and better stats.

## Combat and flow improvements completed

- Enemy cards hide during active combat.
- After victory or defeat, a `Choose Another Enemy` button returns the player to enemy selection.
- The combat page keeps fight state server-authoritative.
- Enemy cards show useful stats and suggested readiness.

## Adventurer's Journal UI work completed

The game has been restyled around a consistent `Adventurer's Journal` visual direction.

Implemented across:

- Login
- Town Square
- Work Board
- Training Grounds
- Combat Grounds

Player-facing intent:

- Make the game feel more like a cohesive old-school RPG menu.
- Reduce confusion about where to go next.
- Keep the current mechanics intact while improving first impressions.
- Use dark panels, gold headings, bordered menu cards, and consistent navigation.

UI details completed:

- Shared game shell across main pages.
- Persistent side panel on game pages.
- Character stat panel.
- Travel/navigation panel.
- Logout access from activity pages.
- Town menu action cards.
- Inn panel.
- Work, Training, and Combat pages adapted to the same style.
- Better empty/waiting state for the player list.
- Aligned action buttons within cards at common desktop resolutions.

## Xarkon visual experiment

A one-page Xarkon/xenobiology-inspired sample was briefly created for comparison, then removed.

Decision:

- The Xarkon atmosphere suggests a different kind of game loop than the current work/train/fight browser RPG.
- The current game is better served by the Adventurer's Journal style.
- Xarkon may deserve its own separate project identity later, with mechanics that support exploration, observation, adaptation, survival, or discovery.

## Verification habit

After meaningful changes, run:

```powershell
npm.cmd test
```

This covers:

- Static/public asset smoke checks
- Storage behavior
- Authentication
- Sessions
- Cooldowns
- Combat state
- Save migration

The most recent UI and migration work passed the automated test suite before being pushed to `origin/codex-migration`.

## Recent important commits on `codex-migration`

- `79a0d3f` - Apply adventurer journal UI style
- `557d152` - Prepare secure production player migration
- `fe10cc8` - Add post-combat enemy selection button
- `0258bf5` - Hide enemy choices during combat
- `b030d20` - Implement first progression balance pass
- `209f0de` - Secure early game foundations
- `968e195` - Establish safe project foundation

## Open next steps

Before production release from the current development branch:

1. Review the `codex-migration` branch on GitHub.
2. Confirm the branch diff contains no real player data, secrets, logs, or generated dependencies.
3. Confirm `npm.cmd test` passes.
4. Merge `codex-migration` into `main` only when ready to release.
5. Let Render deploy from `main`.
6. After `/api/health` reaches `main`, configure Render Health Check Path to `/api/health`.
7. Verify the deployed game:
   - login
   - town navigation
   - work
   - training
   - healing
   - combat
   - existing player progress

Longer-term possible improvements:

- PostgreSQL-backed players and sessions.
- More player-facing feedback after actions.
- More responsive/mobile polish.
- Inventory/shop systems.
- Additional progression content.
- A separate Xarkon-focused game prototype if that world needs its own mechanics.
