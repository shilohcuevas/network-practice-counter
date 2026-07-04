const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { io } = require("socket.io-client");

const originalCreateServer = http.createServer;
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "network-practice-integration-"));
const saveFile = path.join(testDirectory, "players.json");
let appServer;
let authenticatedSocket;

fs.writeFileSync(saveFile, JSON.stringify({
    LegacyPlayer: {
        username: "LegacyPlayer",
        password: "legacy-password",
        damage: 1,
        money: 0,
        hp: 20,
        maxHp: 20
    }
}, null, 2));

http.createServer = (...args) => {
    appServer = originalCreateServer(...args);
    return appServer;
};

process.env.PORT = "0";
process.env.SAVE_FILE = saveFile;
require("../server.js");

function emitWithReply(socket, event, ...args) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${event} did not reply`)), 2000);

        socket.emit(event, ...args, (result) => {
            clearTimeout(timeout);
            resolve(result);
        });
    });
}

async function request(baseUrl, endpoint, options = {}) {
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    let body = null;

    try {
        body = await response.json();
    } catch {
        // Some failure responses do not need a JSON body for these tests.
    }

    return { response, body };
}

async function run() {
    try {
        if (!appServer.listening) await once(appServer, "listening");

        const baseUrl = `http://127.0.0.1:${appServer.address().port}`;
        const registration = await request(baseUrl, "/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "TestHero", password: "strong-test-password" })
        });

        assert.equal(registration.response.status, 201);
        assert.equal(registration.body.success, true);

        const setCookie = registration.response.headers.get("set-cookie");
        const cookie = setCookie.split(";", 1)[0];
        assert.match(cookie, /^game_session=/);
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /SameSite=Lax/i);

        let savedPlayers = JSON.parse(fs.readFileSync(saveFile, "utf8"));
        assert.match(savedPlayers.TestHero.password, /^scrypt\$/);
        assert.notEqual(savedPlayers.TestHero.password, "strong-test-password");

        const legacyLogin = await request(baseUrl, "/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "LegacyPlayer", password: "legacy-password" })
        });

        assert.equal(legacyLogin.response.status, 200);
        savedPlayers = JSON.parse(fs.readFileSync(saveFile, "utf8"));
        assert.match(savedPlayers.LegacyPlayer.password, /^scrypt\$/);
        assert.notEqual(savedPlayers.LegacyPlayer.password, "legacy-password");
        assert.equal(fs.existsSync(`${saveFile}.backup`), true);
        const backupPlayers = JSON.parse(fs.readFileSync(`${saveFile}.backup`, "utf8"));
        assert.match(backupPlayers.LegacyPlayer.password, /^scrypt\$/);
        assert.notEqual(backupPlayers.LegacyPlayer.password, "legacy-password");

        const session = await request(baseUrl, "/api/session", {
            headers: { Cookie: cookie }
        });

        assert.equal(session.response.status, 200);
        assert.equal(session.body.player.username, "TestHero");

        const rejectedSocket = io(baseUrl, {
            autoConnect: false,
            forceNew: true,
            transports: ["websocket"]
        });
        const rejection = once(rejectedSocket, "connect_error");
        rejectedSocket.connect();
        const [rejectionError] = await rejection;
        assert.match(rejectionError.message, /Authentication required/);
        rejectedSocket.close();

        authenticatedSocket = io(baseUrl, {
            autoConnect: false,
            extraHeaders: { Cookie: cookie },
            forceNew: true,
            transports: ["websocket"]
        });

        const connected = once(authenticatedSocket, "connect");
        authenticatedSocket.connect();
        await connected;

        const firstWork = await emitWithReply(authenticatedSocket, "workJob");
        const immediateSecondWork = await emitWithReply(authenticatedSocket, "workJob");
        assert.equal(firstWork.success, true);
        assert.equal(immediateSecondWork.success, false);
        assert.ok(immediateSecondWork.cooldownMs > 0);

        const firstTraining = await emitWithReply(authenticatedSocket, "trainDamage");
        const immediateSecondTraining = await emitWithReply(authenticatedSocket, "trainDamage");
        assert.equal(firstTraining.success, true);
        assert.equal(immediateSecondTraining.success, false);

        const fight = await emitWithReply(authenticatedSocket, "startFight", "rat");
        const secondFight = await emitWithReply(authenticatedSocket, "startFight", "goblin");
        const workDuringFight = await emitWithReply(authenticatedSocket, "workJob");
        assert.equal(fight.success, true);
        assert.equal(secondFight.success, false);
        assert.equal(workDuringFight.success, false);

        const flee = await emitWithReply(authenticatedSocket, "fleeFight");
        assert.equal(flee.success, true);

        savedPlayers = JSON.parse(fs.readFileSync(saveFile, "utf8"));
        assert.equal(savedPlayers.TestHero.money, 10);
        assert.equal(savedPlayers.TestHero.damage, 2);

        const disconnected = once(authenticatedSocket, "disconnect");
        const logout = await request(baseUrl, "/api/logout", {
            method: "POST",
            headers: { Cookie: cookie }
        });
        assert.equal(logout.response.status, 200);
        await disconnected;

        const expiredSession = await request(baseUrl, "/api/session", {
            headers: { Cookie: cookie }
        });
        assert.equal(expiredSession.response.status, 401);

        console.log("Integration test passed for storage, authentication, sessions, cooldowns, and combat state.");
    } finally {
        authenticatedSocket?.close();
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
