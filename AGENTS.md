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
- Keep changes small and explain them in player-facing language.
- Work on `codex-migration`; treat `main` as the Render production branch.
- Do not merge into `main` until durable production player storage is confirmed.

## Verification

- Run `npm test` after changes; it covers public assets plus storage, authentication, sessions, cooldowns, and combat state.
- Start the server and smoke-test registration/login, town navigation, training, work, healing, and combat when those areas change.
- Check `git diff` before handing work back so generated dependencies and player data are not included accidentally.
