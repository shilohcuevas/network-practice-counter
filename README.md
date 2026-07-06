# Network Practice Counter

A small persistent browser RPG built with Node.js, Express, and Socket.IO. Players create a character, train damage and health, work for money, recover at the inn, and fight enemies from a shared town interface.

## Run locally

Requirements:

- Node.js 24
- npm 11 or newer

From the repository root:

```powershell
npm install
npm start
```

Then open <http://localhost:3000>.

Useful commands:

```powershell
npm run check
npm test
```

## Project structure

- `server.js` contains the HTTP API, authenticated Socket.IO events, progression, healing, and combat.
- `lib/player-store.js` performs atomic player saves and maintains a local backup.
- `lib/security.js` provides password hashing and cryptographically random session tokens.
- `public/` contains the browser pages and shared styling.
- `package.json` and `package-lock.json` define the runtime and reproducible dependencies.
- `players.example.json` documents the current save-file shape without containing real account data.
- `AGENTS.md` gives Codex durable project instructions.

## Player data

The game currently stores accounts and progress in a local `players.json` file. That file and its backups are ignored by Git and must never be committed.

The example save file is for documentation only. The server creates `players.json` automatically when needed.

New passwords are stored as scrypt hashes. When an older plaintext account logs in successfully, its password is automatically replaced with a hash. Authentication uses a random, HttpOnly, SameSite session cookie instead of trusting a username stored in the browser.

Sessions are intentionally held in server memory for this single-instance early-game architecture. A server restart requires players to log in again, but does not affect character progress.

Player saves use a temporary file and atomic replacement, with the previous save retained beside it as a backup. This protects against partially written JSON if saving is interrupted.

## GitHub and deployment workflow

Development happens on `codex-migration`. Render watches `main`.

1. Make and test changes on `codex-migration`.
2. Review the complete Git diff.
3. Push `codex-migration` to GitHub.
4. Merge into `main` only when the version is approved for deployment.
5. Confirm the matching commit succeeds in Render's Events page.

Pushing `codex-migration` does not deploy the live game. Updating `main` does.

## Production deployment gate

Do not merge the current foundation work into `main` until production player storage is confirmed.

Render's default filesystem is ephemeral, so a plain `players.json` written outside persistent storage can be lost when the service restarts or redeploys. In production, the server now refuses to start unless `SAVE_FILE` is explicitly configured.

- a Render persistent disk with the application configured to write beneath its mount path; or
- a managed database, which is the preferred long-term direction for accounts and progression.

For the temporary persistent-disk option, mount the disk at `/opt/render/project/src/data` and set the Render environment variable `SAVE_FILE` to `/opt/render/project/src/data/players.json`. Local development continues using `players.json` when `SAVE_FILE` is not set.

This file-backed setup supports one running game instance. Moving to multiple instances will require a shared database and shared session storage.

## Server-authoritative rules

Work, training, and attacks now enforce their cooldowns on the server. Opening another tab or manually sending an event cannot bypass them. A player can have only one active fight, cannot work, train, or heal during that fight, and can use the Flee action to end it.

## Current balance-test rules

The first spreadsheet-derived progression draft is active on `codex-migration`:

- Work earns $5.
- Damage training costs current damage × $10.
- Health training adds 5 maximum/current HP and costs current max HP − $10.
- Healing costs $1 per missing HP.
- Defeat returns the player with 25% HP.
- Enemy tiers are Rat, Slime, Goblin, Orc, and Troll.
- New tiers are purchased sequentially, but suggested damage and HP values are guidance rather than combat requirements.

Existing characters are automatically grandfathered into tiers supported by their current damage and maximum HP. These values are intentionally provisional and should change in response to friend testing and the balance workbook.

See `docs/DEPLOYMENT.md` for the release checklist.
