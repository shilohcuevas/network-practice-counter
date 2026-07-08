const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const originalCreateServer = http.createServer;
let appServer;

http.createServer = (...args) => {
    appServer = originalCreateServer(...args);
    return appServer;
};

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "network-practice-counter-"));

process.env.PORT = "0";
process.env.SAVE_FILE = path.join(testDirectory, "players.json");
require("../server.js");

const paths = [
    "/api/health",
    "/login.html",
    "/index.html",
    "/training.html",
    "/work.html",
    "/combat.html",
    "/style.css",
    "/character-sheet.js",
    "/images/town-background.png",
    "/socket.io/socket.io.js"
];

async function run() {
    try {
        if (!appServer.listening) {
            await once(appServer, "listening");
        }

        const { port } = appServer.address();

        for (const path of paths) {
            const response = await fetch(`http://127.0.0.1:${port}${path}`);
            assert.equal(response.status, 200, `${path} should load successfully`);
            const body = await response.text();

            if (path === "/combat.html") {
                assert.equal(body.includes("Choose Another Enemy"), true);
                assert.match(body, /<section id="currentFightPanel" class="journal-card" hidden>/);
            }

            if (path === "/character-sheet.js") {
                assert.equal(body.includes("\"Damage\""), false);
                assert.equal(body.includes("\"Accuracy\""), false);
            }
        }

        console.log(`Smoke test passed for ${paths.length} public assets.`);
    } finally {
        http.createServer = originalCreateServer;

        if (appServer?.listening) {
            await new Promise((resolve, reject) => {
                appServer.close((error) => error ? reject(error) : resolve());
            });
        }

        fs.rmSync(testDirectory, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
