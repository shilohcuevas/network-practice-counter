const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { PlayerStore } = require("./lib/player-store");
const { createSessionToken, hashPassword, verifyPassword } = require("./lib/security");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SAVE_FILE = process.env.SAVE_FILE || path.join(__dirname, "players.json");
const SESSION_COOKIE = "game_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_ATTEMPT_LIMIT = 10;
const WORK_REWARD = 5;
const HEAL_COST_PER_HP = 1;
const DEFEAT_RETURN_HP_PERCENT = 0.25;
const DAMAGE_TRAINING_MULTIPLIER = 10;
const HEALTH_TRAINING_OFFSET = 10;

const ACTION_COOLDOWNS = {
    trainDamage: 5000,
    trainHealth: 5000,
    workJob: 5000,
    attackEnemy: 500
};

const ENEMIES = {
    rat: {
        name: "Rat",
        hp: 5,
        maxHp: 5,
        damage: 1,
        rewardMoney: 8,
        unlockCost: 0,
        requires: null,
        recommendedDamage: 1,
        recommendedMaxHp: 20
    },
    slime: {
        name: "Slime",
        hp: 12,
        maxHp: 12,
        damage: 2,
        rewardMoney: 18,
        unlockCost: 25,
        requires: "rat",
        recommendedDamage: 2,
        recommendedMaxHp: 25
    },
    goblin: {
        name: "Goblin",
        hp: 25,
        maxHp: 25,
        damage: 3,
        rewardMoney: 35,
        unlockCost: 100,
        requires: "slime",
        recommendedDamage: 4,
        recommendedMaxHp: 30
    },
    orc: {
        name: "Orc",
        hp: 50,
        maxHp: 50,
        damage: 5,
        rewardMoney: 70,
        unlockCost: 350,
        requires: "goblin",
        recommendedDamage: 7,
        recommendedMaxHp: 40
    },
    troll: {
        name: "Troll",
        hp: 90,
        maxHp: 90,
        damage: 8,
        rewardMoney: 135,
        unlockCost: 900,
        requires: "orc",
        recommendedDamage: 10,
        recommendedMaxHp: 55
    }
};

if (IS_PRODUCTION && !process.env.SAVE_FILE) {
    throw new Error(
        "SAVE_FILE is required in production. Configure it beneath a persistent disk mount before starting the game."
    );
}

const playerStore = new PlayerStore(SAVE_FILE);
const players = playerStore.load();
const sessions = new Map();
const activeFights = new Map();
const actionCooldowns = new Map();
const authAttempts = new Map();

let upgradedOlderAccount = false;

for (const username in players) {
    if (players[username].money === undefined) {
        players[username].money = 0;
        upgradedOlderAccount = true;
    }

    if (players[username].damage === undefined) {
        players[username].damage = 1;
        upgradedOlderAccount = true;
    }

    if (players[username].maxHp === undefined) {
        players[username].maxHp = 20;
        upgradedOlderAccount = true;
    }

    if (players[username].hp === undefined) {
        players[username].hp = players[username].maxHp;
        upgradedOlderAccount = true;
    }

    if (!Array.isArray(players[username].unlockedEnemies)) {
        players[username].unlockedEnemies = Object.entries(ENEMIES)
            .filter(([, enemy]) => (
                players[username].damage >= enemy.recommendedDamage
                && players[username].maxHp >= enemy.recommendedMaxHp
            ))
            .map(([enemyType]) => enemyType);

        if (!players[username].unlockedEnemies.includes("rat")) {
            players[username].unlockedEnemies.unshift("rat");
        }

        upgradedOlderAccount = true;
    }

    const validUnlocks = players[username].unlockedEnemies.filter((enemyType) => ENEMIES[enemyType]);

    if (!validUnlocks.includes("rat")) validUnlocks.unshift("rat");

    if (validUnlocks.length !== players[username].unlockedEnemies.length
        || validUnlocks.some((enemyType, index) => enemyType !== players[username].unlockedEnemies[index])) {
        players[username].unlockedEnemies = validUnlocks;
        upgradedOlderAccount = true;
    }
}

if (upgradedOlderAccount) {
    savePlayers();
}

function savePlayers() {
    playerStore.save(players);
}

function getPublicPlayer(player) {
    return {
        username: player.username,
        damage: player.damage,
        money: player.money,
        hp: player.hp,
        maxHp: player.maxHp,
        unlockedEnemies: [...player.unlockedEnemies]
    };
}

function getPublicGameConfig() {
    const enemies = {};

    for (const [enemyType, enemy] of Object.entries(ENEMIES)) {
        enemies[enemyType] = {
            name: enemy.name,
            hp: enemy.maxHp,
            damage: enemy.damage,
            rewardMoney: enemy.rewardMoney,
            unlockCost: enemy.unlockCost,
            requires: enemy.requires,
            recommendedDamage: enemy.recommendedDamage,
            recommendedMaxHp: enemy.recommendedMaxHp
        };
    }

    return {
        enemies,
        workReward: WORK_REWARD,
        healCostPerHp: HEAL_COST_PER_HP,
        defeatReturnHpPercent: DEFEAT_RETURN_HP_PERCENT,
        damageTrainingMultiplier: DAMAGE_TRAINING_MULTIPLIER,
        healthTrainingOffset: HEALTH_TRAINING_OFFSET
    };
}

function getDamageTrainingCost(player) {
    return player.damage * DAMAGE_TRAINING_MULTIPLIER;
}

function getHealthTrainingCost(player) {
    return Math.max(1, player.maxHp - HEALTH_TRAINING_OFFSET);
}

function publicPlayers() {
    const safePlayers = {};

    for (const username in players) {
        safePlayers[username] = getPublicPlayer(players[username]);
    }

    return safePlayers;
}

function sendPlayerData(socket, player) {
    socket.emit("playerData", getPublicPlayer(player));
}

function broadcastPlayers() {
    io.emit("playersUpdate", publicPlayers());
}

function parseCookies(cookieHeader = "") {
    const cookies = {};

    for (const part of cookieHeader.split(";")) {
        const separator = part.indexOf("=");

        if (separator === -1) continue;

        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();

        if (name) {
            try {
                cookies[name] = decodeURIComponent(value);
            } catch {
                cookies[name] = value;
            }
        }
    }

    return cookies;
}

function getSession(cookieHeader) {
    const token = parseCookies(cookieHeader)[SESSION_COOKIE];
    if (!token) return null;

    const session = sessions.get(token);
    if (!session) return null;

    if (session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return null;
    }

    return { token, ...session };
}

function createSession(username) {
    const token = createSessionToken();

    sessions.set(token, {
        username,
        expiresAt: Date.now() + SESSION_DURATION_MS
    });

    return token;
}

function sessionCookie(token) {
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`
    ];

    if (IS_PRODUCTION) parts.push("Secure");

    return parts.join("; ");
}

function expiredSessionCookie() {
    const parts = [
        `${SESSION_COOKIE}=`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        "Max-Age=0"
    ];

    if (IS_PRODUCTION) parts.push("Secure");

    return parts.join("; ");
}

function consumeAuthAttempt(req) {
    const key = req.ip;
    const now = Date.now();
    let record = authAttempts.get(key);

    if (!record || record.resetAt <= now) {
        record = { count: 0, resetAt: now + AUTH_WINDOW_MS };
    }

    record.count++;
    authAttempts.set(key, record);

    return record.count <= AUTH_ATTEMPT_LIMIT;
}

function validateRegistration(username, password) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
        return "Username must be 3-20 characters using letters, numbers, or underscores.";
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
        return "Password must be 8-128 characters.";
    }

    return null;
}

function requireHttpSession(req, res, next) {
    const session = getSession(req.headers.cookie);

    if (!session || !players[session.username]) {
        res.status(401).json({ success: false, message: "Authentication required." });
        return;
    }

    req.gameSession = session;
    next();
}

function getCooldownKey(username, action) {
    return `${username}:${action}`;
}

function claimCooldown(username, action) {
    const duration = ACTION_COOLDOWNS[action] || 0;
    const key = getCooldownKey(username, action);
    const now = Date.now();
    const availableAt = actionCooldowns.get(key) || 0;

    if (availableAt > now) {
        return availableAt - now;
    }

    actionCooldowns.set(key, now + duration);
    return 0;
}

function clearPlayerRuntimeState(username) {
    activeFights.delete(username);

    for (const key of actionCooldowns.keys()) {
        if (key.startsWith(`${username}:`)) {
            actionCooldowns.delete(key);
        }
    }
}

function reply(callback, payload) {
    if (typeof callback === "function") {
        callback(payload);
    }
}

function requirePeacefulState(socket, username, callback) {
    if (!activeFights.has(username)) return true;

    reply(callback, {
        success: false,
        message: "Finish or flee from your current fight first."
    });

    return false;
}

app.set("trust proxy", IS_PRODUCTION ? 1 : false);
app.use(express.json({ limit: "10kb" }));
app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

app.post("/api/register", async (req, res) => {
    if (!consumeAuthAttempt(req)) {
        res.status(429).json({ success: false, message: "Too many attempts. Try again later." });
        return;
    }

    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = req.body?.password;
    const validationMessage = validateRegistration(username, password);

    if (validationMessage) {
        res.status(400).json({ success: false, message: validationMessage });
        return;
    }

    if (players[username]) {
        res.status(409).json({ success: false, message: "Username already exists." });
        return;
    }

    players[username] = {
        username,
        password: await hashPassword(password),
        damage: 1,
        money: 0,
        hp: 20,
        maxHp: 20,
        unlockedEnemies: ["rat"]
    };

    savePlayers();
    const token = createSession(username);

    res.setHeader("Set-Cookie", sessionCookie(token));
    res.status(201).json({
        success: true,
        username,
        message: "Account created."
    });

    broadcastPlayers();
});

app.post("/api/login", async (req, res) => {
    if (!consumeAuthAttempt(req)) {
        res.status(429).json({ success: false, message: "Too many attempts. Try again later." });
        return;
    }

    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const player = players[username];

    if (!player || !password || password.length > 128) {
        res.status(401).json({ success: false, message: "Invalid username or password." });
        return;
    }

    const passwordResult = await verifyPassword(password, player.password);

    if (!passwordResult.valid) {
        res.status(401).json({ success: false, message: "Invalid username or password." });
        return;
    }

    if (passwordResult.needsUpgrade) {
        player.password = await hashPassword(password);
        savePlayers();
        playerStore.refreshBackup();
    }

    const token = createSession(username);
    res.setHeader("Set-Cookie", sessionCookie(token));
    res.json({ success: true, username, message: "Logged in." });
});

app.get("/api/session", requireHttpSession, (req, res) => {
    res.json({
        success: true,
        player: getPublicPlayer(players[req.gameSession.username])
    });
});

app.post("/api/logout", (req, res) => {
    const session = getSession(req.headers.cookie);

    if (session) {
        sessions.delete(session.token);
        clearPlayerRuntimeState(session.username);

        for (const connectedSocket of io.sockets.sockets.values()) {
            if (connectedSocket.data.username === session.username) {
                connectedSocket.disconnect(true);
            }
        }
    }

    res.setHeader("Set-Cookie", expiredSessionCookie());
    res.json({ success: true, message: "Logged out." });
});

app.use(express.static("public"));

io.use((socket, next) => {
    const session = getSession(socket.request.headers.cookie);

    if (!session || !players[session.username]) {
        next(new Error("Authentication required."));
        return;
    }

    socket.data.username = session.username;
    socket.data.sessionToken = session.token;
    next();
});

io.on("connection", (socket) => {
    const username = socket.data.username;
    const player = players[username];

    console.log("Connected:", socket.id, username);
    sendPlayerData(socket, player);
    socket.emit("playersUpdate", publicPlayers());
    socket.emit("gameConfig", getPublicGameConfig());

    if (activeFights.has(username)) {
        socket.emit("fightUpdate", activeFights.get(username));
    }

    socket.on("trainDamage", (callback) => {
        if (!requirePeacefulState(socket, username, callback)) return;

        const cost = getDamageTrainingCost(player);

        if (player.money < cost) {
            reply(callback, {
                success: false,
                message: `Damage training costs $${cost}.`,
                cost
            });
            return;
        }

        const remainingMs = claimCooldown(username, "trainDamage");

        if (remainingMs > 0) {
            reply(callback, {
                success: false,
                message: "Damage training is still cooling down.",
                cooldownMs: remainingMs
            });
            return;
        }

        player.money -= cost;
        player.damage++;
        savePlayers();
        sendPlayerData(socket, player);
        broadcastPlayers();

        reply(callback, {
            success: true,
            message: `Damage increased by 1 for $${cost}.`,
            cost,
            cooldownMs: ACTION_COOLDOWNS.trainDamage
        });
    });

    socket.on("trainHealth", (callback) => {
        if (!requirePeacefulState(socket, username, callback)) return;

        const cost = getHealthTrainingCost(player);

        if (player.money < cost) {
            reply(callback, {
                success: false,
                message: `Health training costs $${cost}.`,
                cost
            });
            return;
        }

        const remainingMs = claimCooldown(username, "trainHealth");

        if (remainingMs > 0) {
            reply(callback, {
                success: false,
                message: "Health training is still cooling down.",
                cooldownMs: remainingMs
            });
            return;
        }

        player.money -= cost;
        player.maxHp += 5;
        player.hp += 5;
        savePlayers();
        sendPlayerData(socket, player);
        broadcastPlayers();

        reply(callback, {
            success: true,
            message: `Maximum health increased by 5 for $${cost}.`,
            cost,
            cooldownMs: ACTION_COOLDOWNS.trainHealth
        });
    });

    socket.on("workJob", (callback) => {
        if (!requirePeacefulState(socket, username, callback)) return;

        const remainingMs = claimCooldown(username, "workJob");

        if (remainingMs > 0) {
            reply(callback, {
                success: false,
                message: "You are still recovering from your last job.",
                cooldownMs: remainingMs
            });
            return;
        }

        player.money += WORK_REWARD;
        savePlayers();
        sendPlayerData(socket, player);
        broadcastPlayers();

        reply(callback, {
            success: true,
            message: `You earned $${WORK_REWARD}.`,
            reward: WORK_REWARD,
            cooldownMs: ACTION_COOLDOWNS.workJob
        });
    });

    socket.on("healPlayer", (callback) => {
        if (!requirePeacefulState(socket, username, callback)) return;

        const missingHp = player.maxHp - player.hp;
        const healCost = missingHp * HEAL_COST_PER_HP;

        if (missingHp <= 0) {
            const message = "You are already at full HP.";
            socket.emit("healMessage", message);
            reply(callback, { success: false, message });
            return;
        }

        if (player.money < healCost) {
            const message = `You need $${healCost} to fully heal.`;
            socket.emit("healMessage", message);
            reply(callback, { success: false, message });
            return;
        }

        player.money -= healCost;
        player.hp = player.maxHp;
        savePlayers();
        sendPlayerData(socket, player);
        broadcastPlayers();

        const message = `You healed ${missingHp} HP for $${healCost}.`;
        socket.emit("healMessage", message);
        reply(callback, { success: true, message });
    });

    socket.on("startFight", (enemyType, callback) => {
        if (activeFights.has(username)) {
            const message = "You are already in a fight.";
            socket.emit("combatMessage", message);
            reply(callback, { success: false, message });
            return;
        }

        const enemyTemplate = ENEMIES[enemyType];

        if (!enemyTemplate) {
            const message = "That enemy does not exist.";
            socket.emit("combatMessage", message);
            reply(callback, { success: false, message });
            return;
        }

        if (!player.unlockedEnemies.includes(enemyType)) {
            const message = `${enemyTemplate.name} is still locked.`;
            socket.emit("combatMessage", message);
            reply(callback, { success: false, message });
            return;
        }

        const fight = {
            enemy: { ...enemyTemplate },
            log: [`A ${enemyTemplate.name} stands before you.`]
        };

        activeFights.set(username, fight);
        socket.emit("fightUpdate", fight);
        reply(callback, { success: true, message: `Fight started against ${enemyTemplate.name}.` });
    });

    socket.on("unlockEnemy", (enemyType, callback) => {
        if (!requirePeacefulState(socket, username, callback)) return;

        const enemy = ENEMIES[enemyType];

        if (!enemy) {
            reply(callback, { success: false, message: "That enemy does not exist." });
            return;
        }

        if (player.unlockedEnemies.includes(enemyType)) {
            reply(callback, { success: false, message: `${enemy.name} is already unlocked.` });
            return;
        }

        if (enemy.requires && !player.unlockedEnemies.includes(enemy.requires)) {
            reply(callback, {
                success: false,
                message: `Unlock ${ENEMIES[enemy.requires].name} first.`
            });
            return;
        }

        if (player.money < enemy.unlockCost) {
            reply(callback, {
                success: false,
                message: `You need $${enemy.unlockCost} to unlock ${enemy.name}.`
            });
            return;
        }

        player.money -= enemy.unlockCost;
        player.unlockedEnemies.push(enemyType);
        savePlayers();
        sendPlayerData(socket, player);
        broadcastPlayers();

        reply(callback, {
            success: true,
            message: `${enemy.name} unlocked for $${enemy.unlockCost}.`
        });
    });

    socket.on("fleeFight", (callback) => {
        if (!activeFights.has(username)) {
            reply(callback, { success: false, message: "You are not in a fight." });
            return;
        }

        activeFights.delete(username);
        reply(callback, { success: true, message: "You fled from the fight." });
        socket.emit("fightEnded", "You fled from the fight.");
    });

    socket.on("attackEnemy", (callback) => {
        const fight = activeFights.get(username);

        if (!fight) {
            const message = "You are not in a fight.";
            socket.emit("combatMessage", message);
            reply(callback, { success: false, message });
            return;
        }

        const remainingMs = claimCooldown(username, "attackEnemy");

        if (remainingMs > 0) {
            reply(callback, {
                success: false,
                message: "You must wait before attacking again.",
                cooldownMs: remainingMs
            });
            return;
        }

        const enemy = fight.enemy;

        enemy.hp -= player.damage;
        fight.log.push(`You hit the ${enemy.name} for ${player.damage} damage.`);
        fight.log = fight.log.slice(-10);

        if (enemy.hp <= 0) {
            enemy.hp = 0;
            player.money += enemy.rewardMoney;
            fight.log.push(`You defeated the ${enemy.name}!`);
            fight.log.push(`You earned $${enemy.rewardMoney}.`);
            fight.log = fight.log.slice(-10);

            savePlayers();
            sendPlayerData(socket, player);
            broadcastPlayers();
            socket.emit("fightUpdate", fight);
            activeFights.delete(username);

            reply(callback, {
                success: true,
                message: `You defeated the ${enemy.name}.`,
                cooldownMs: ACTION_COOLDOWNS.attackEnemy,
                fightEnded: true
            });
            return;
        }

        player.hp -= enemy.damage;
        fight.log.push(`The ${enemy.name} hits you for ${enemy.damage} damage.`);

        if (player.hp <= 0) {
            player.hp = Math.max(1, Math.ceil(player.maxHp * DEFEAT_RETURN_HP_PERCENT));
            fight.log.push(`You were defeated and returned with ${player.hp} HP.`);
            fight.log = fight.log.slice(-10);

            savePlayers();
            sendPlayerData(socket, player);
            broadcastPlayers();
            socket.emit("fightUpdate", fight);
            activeFights.delete(username);

            reply(callback, {
                success: true,
                message: "You were defeated.",
                cooldownMs: ACTION_COOLDOWNS.attackEnemy,
                fightEnded: true
            });
            return;
        }

        savePlayers();
        sendPlayerData(socket, player);
        broadcastPlayers();
        socket.emit("fightUpdate", fight);

        reply(callback, {
            success: true,
            message: "Attack completed.",
            cooldownMs: ACTION_COOLDOWNS.attackEnemy
        });
    });

    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id, username);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
