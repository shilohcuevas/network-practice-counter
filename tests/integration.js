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
        damage: 4,
        money: 500,
        hp: 30,
        maxHp: 30
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
        assert.equal(savedPlayers.TestHero.level, 1);
        assert.equal(savedPlayers.TestHero.accuracy, 75);
        assert.deepEqual(savedPlayers.TestHero.unlockedEnemies, ["rat"]);

        const legacyLogin = await request(baseUrl, "/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "LegacyPlayer", password: "legacy-password" })
        });

        assert.equal(legacyLogin.response.status, 200);
        const legacyCookie = legacyLogin.response.headers.get("set-cookie").split(";", 1)[0];
        savedPlayers = JSON.parse(fs.readFileSync(saveFile, "utf8"));
        assert.match(savedPlayers.LegacyPlayer.password, /^scrypt\$/);
        assert.notEqual(savedPlayers.LegacyPlayer.password, "legacy-password");
        assert.equal(savedPlayers.LegacyPlayer.level, 1);
        assert.equal(savedPlayers.LegacyPlayer.accuracy, 75);
        assert.equal(fs.existsSync(`${saveFile}.backup`), true);
        const backupPlayers = JSON.parse(fs.readFileSync(`${saveFile}.backup`, "utf8"));
        assert.match(backupPlayers.LegacyPlayer.password, /^scrypt\$/);
        assert.notEqual(backupPlayers.LegacyPlayer.password, "legacy-password");
        assert.deepEqual(savedPlayers.LegacyPlayer.unlockedEnemies, ["rat", "slime", "goblin"]);

        const session = await request(baseUrl, "/api/session", {
            headers: { Cookie: cookie }
        });

        assert.equal(session.response.status, 200);
        assert.equal(session.body.player.username, "TestHero");
        assert.equal(session.body.player.level, 1);
        assert.equal(session.body.player.accuracy, 75);
        assert.equal(session.body.player.password, undefined);

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
            extraHeaders: { Cookie: legacyCookie },
            forceNew: true,
            transports: ["websocket"]
        });

        const connected = once(authenticatedSocket, "connect");
        const gameConfigReceived = once(authenticatedSocket, "gameConfig");
        authenticatedSocket.connect();
        await connected;
        const [gameConfig] = await gameConfigReceived;
        assert.equal(gameConfig.workReward, 5);
        assert.equal(gameConfig.enemies.rat.rewardMoney, 8);
        assert.equal(gameConfig.enemies.troll.recommendedMaxHp, 55);

        const firstWork = await emitWithReply(authenticatedSocket, "workJob");
        const immediateSecondWork = await emitWithReply(authenticatedSocket, "workJob");
        assert.equal(firstWork.success, true);
        assert.equal(immediateSecondWork.success, false);
        assert.ok(immediateSecondWork.cooldownMs > 0);

        const firstTraining = await emitWithReply(authenticatedSocket, "trainDamage");
        const immediateSecondTraining = await emitWithReply(authenticatedSocket, "trainDamage");
        assert.equal(firstTraining.success, true);
        assert.equal(immediateSecondTraining.success, false);
        assert.equal(firstTraining.cost, 40);

        const unlockOrc = await emitWithReply(authenticatedSocket, "unlockEnemy", "orc");
        const unlockOrcAgain = await emitWithReply(authenticatedSocket, "unlockEnemy", "orc");
        assert.equal(unlockOrc.success, true);
        assert.equal(unlockOrcAgain.success, false);

        const fight = await emitWithReply(authenticatedSocket, "startFight", "orc");
        const secondFight = await emitWithReply(authenticatedSocket, "startFight", "goblin");
        const workDuringFight = await emitWithReply(authenticatedSocket, "workJob");
        assert.equal(fight.success, true);
        assert.equal(secondFight.success, false);
        assert.equal(workDuringFight.success, false);

        const flee = await emitWithReply(authenticatedSocket, "fleeFight");
        assert.equal(flee.success, true);

        savedPlayers = JSON.parse(fs.readFileSync(saveFile, "utf8"));
        assert.equal(savedPlayers.LegacyPlayer.money, 115);
        assert.equal(savedPlayers.LegacyPlayer.damage, 5);
        assert.equal(savedPlayers.LegacyPlayer.unlockedEnemies.includes("orc"), true);

        const disconnected = once(authenticatedSocket, "disconnect");
        const logout = await request(baseUrl, "/api/logout", {
            method: "POST",
            headers: { Cookie: legacyCookie }
        });
        assert.equal(logout.response.status, 200);
        await disconnected;

        const expiredSession = await request(baseUrl, "/api/session", {
            headers: { Cookie: legacyCookie }
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
