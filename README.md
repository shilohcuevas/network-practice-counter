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

- `server.js` contains the server, Socket.IO events, authentication, player progression, persistence, healing, and combat.
- `public/` contains the browser pages and shared styling.
- `package.json` and `package-lock.json` define the runtime and reproducible dependencies.
- `players.example.json` documents the current save-file shape without containing real account data.
- `AGENTS.md` gives Codex durable project instructions.

## Player data

The game currently stores accounts and progress in a local `players.json` file. That file is ignored by Git and must never be committed because the current format contains passwords.

The example save file is for documentation only. The server creates `players.json` automatically when needed.

Before public testing expands, authentication should use password hashing and production player data should move to durable storage.

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

Render's default filesystem is ephemeral, so a plain `players.json` written by the running service can be lost when the service restarts or redeploys. Before deployment, choose and verify one durable option:

- a Render persistent disk with the application configured to write beneath its mount path; or
- a managed database, which is the preferred long-term direction for accounts and progression.

For the temporary persistent-disk option, mount the disk at `/opt/render/project/src/data` and set the Render environment variable `SAVE_FILE` to `/opt/render/project/src/data/players.json`. Local development continues using `players.json` when `SAVE_FILE` is not set.

See `docs/DEPLOYMENT.md` for the release checklist.
