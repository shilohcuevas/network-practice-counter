# Deployment checklist

Render automatically deploys commits pushed or merged into `main`. Treat `main` as the production release branch.

## Before merging into main

- Confirm `npm test` passes.
- Start the server locally and smoke-test the affected game areas.
- Confirm `git status` contains no `players.json`, `.env`, logs, or `node_modules` files.
- Review the entire branch diff against `main`.
- Confirm no real passwords or tokens appear in the diff.
- Confirm production player storage is durable and backed up.

## Render settings to verify

- Repository: `shilohcuevas/network-practice-counter`
- Branch: `main`
- Auto-Deploy: `On Commit`
- Build command: `npm install` or `npm ci`
- Start command: `npm start`
- Node version: compatible with `.node-version`
- Persistent storage: explicitly configured before relying on filesystem saves

For file-based production storage, attach a disk at `/opt/render/project/src/data` and set `SAVE_FILE=/opt/render/project/src/data/players.json`. Do not deploy the removal of the repository's old save file until existing production data has been backed up and transferred.

The server refuses to start with `NODE_ENV=production` when `SAVE_FILE` is absent. This is intentional protection against accidentally running production on ephemeral storage.

## Existing player-data migration

Before the first deployment of this foundation:

1. Back up the existing production `players.json` and the trusted local copy.
2. Attach the Render disk at `/opt/render/project/src/data`.
3. Set `SAVE_FILE=/opt/render/project/src/data/players.json`.
4. Transfer the chosen current `players.json` onto that disk before opening the game to players.
5. Keep the service at one instance while using file-backed storage.
6. Log into each legacy test account once to confirm its plaintext password is replaced by a scrypt hash.

## After merging

- Open the Render Events page.
- Confirm Render deployed the intended commit.
- Confirm the service started successfully.
- Test login, town navigation, work, training, healing, and combat on the deployed game.
- Confirm existing player data remains available.

If any check fails, do not continue making production changes. Restore the last known-good deployment and diagnose from the development branch.
