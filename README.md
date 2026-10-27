# Prisma 0.1.7 — Online Alpha (Render)

## Render settings
- Branch: `main`
- Build: `npm install`
- Start: `node server.js`
- Existing disk mount: `/opt/render/project/src/data`
- Set environment variable **PRISMA_DATA_DIR** = `/opt/render/project/src/data/prisma` (recommended, explicit). The server defaults to `<project>/data/prisma` if unset.
- Optional health check path: `/healthz`

This namespaced `prisma` directory avoids overwriting the retired RPG's files on the same disk. **Do not delete or format the disk.** Back up the old RPG disk data separately before replacing the service.

## GitHub deployment
Upload these project files at the repository root (not inside a nested folder). Keep `server.js`, `package.json`, and `public/` together. Render deploys automatically from `main` if auto-deploy is enabled. Check logs for `Prisma 0.1.7 listening on port ...` and the intended save directory.

## Existing local progression
If you want to migrate your local character/world, stop the old local server and back up its `data` folder. Copy its `world.json` and `characters.json` into the new version's `data/prisma/` folder for **local** testing. To move saves onto Render, you'll need an explicit safe upload or transfer procedure; pushing files to GitHub will not copy them onto the mounted persistent disk. **Do not commit private save files or browser character IDs.**

## Browser identity limitation
This version uses a browser-local random character ID, not authentication. New domain = new browser storage identity, so the localhost character will not automatically appear at the Render URL. IDs can be impersonated if obtained. Limit the URL to trusted testers and do not use real money or valuable competitive assets. Proper accounts and abuse controls are needed before public launch.

## Multiplayer test
Use two different browsers or devices at the same Render HTTPS URL. Two tabs sharing one character ID are intentionally rejected. Verify both players appear, damage works, NPC gold persists, and saves survive a Render restart. Render service must be running; do not deploy multiple instances against these JSON save files.

## Controls
WASD movement; mouse aim; hold left click to fire; keys 1/2/3 to buy upgrades near town. Right click and Left Shift are reserved.
