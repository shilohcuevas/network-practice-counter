# Project guidance

## Project overview

This is a small browser RPG built with Node.js, Express, and Socket.IO.

- `server.js` contains the HTTP API, sessions, progression, healing, and combat rules.
- `lib/` contains atomic persistence and security helpers.
- `public/` contains the browser pages and shared styling.
- `players.json` is runtime player data, not source code.
- The production version is deployed through Render from the GitHub repository.

## Local development

From the repository root:

1. Install dependencies with `npm install`.
2. Start the game with `npm start`.
3. Open `http://localhost:3000`.

The server uses `PORT` when supplied by the host and otherwise uses port 3000.

## Change rules

- Preserve the Socket.IO event contract between `server.js` and the pages in `public/`.
- Keep game rules authoritative on the server. Browser-only cooldowns or validation are not security controls.
- Do not commit passwords, authentication tokens, or live player save data.
- Preserve automatic migration of legacy plaintext passwords unless a planned data migration replaces it.
- Preserve HttpOnly cookie authentication; never reintroduce username-based client trust or localStorage authentication.
- Treat the current storage and in-memory sessions as a single-instance architecture.
- Do not change gameplay balance, saved-player migrations, GitHub configuration, or Render deployment behavior unless the user requests it.
- Keep spreadsheet-derived economy constants together near the top of `server.js`, and update integration tests when adjusting them.
- Keep changes small and explain them in player-facing language.
- Work on `codex-migration`; treat `main` as the Render production branch.
- Do not merge into `main` until durable production player storage is confirmed.

## Adventurer's Journal UI pattern

- Treat the sidebar as the player's identity and the main content area as the world.
- Keep the sidebar intentionally static and compact so Travel and Notice Board stay in consistent positions across page navigation.
- Always limit the sidebar character panel to the permanent core summary: Level, HP, and Gold.
- Keep activity-specific information in the main content area for the current page.
- Do not add Damage, Accuracy, Evasion, equipment, professions, achievements, skills, or other expanded character details to the sidebar.
- Save complete character details for the future character sheet opened by See All.
- Use the Notice Board to answer "What is happening in the world?" and keep it suitable for future tutorial hints, world events, patch notes, location unlocks, seasonal notices, or server-wide announcements.
- In combat, present only actions relevant to the current state: choosing an enemy, fighting an enemy, or reviewing a resolved fight. Hide the Current Fight panel while choosing, keep Flee as the only way to leave an active fight, and show Choose Another Enemy only after victory or defeat so the combat log remains readable.
- Keep primary and caution button styling consistent throughout the game; differentiate dangerous or secondary actions primarily through color, not shape, size, spacing, or typography.

## Verification

- Run `npm test` after changes; it covers public assets plus storage, authentication, sessions, cooldowns, and combat state.
- Start the server and smoke-test registration/login, town navigation, training, work, healing, and combat when those areas change.
- Check `git diff` before handing work back so generated dependencies and player data are not included accidentally.
