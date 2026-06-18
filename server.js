const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const SAVE_FILE = "players.json";

let players = {};
let socketToUser = {};
let activeFights = {};

const ENEMIES = {
    rat: {
        name: "Rat",
        hp: 5,
        maxHp: 5,
        damage: 1,
        rewardMoney: 3
    },
    dummy: {
        name: "Training Dummy",
        hp: 10,
        maxHp: 10,
        damage: 1,
        rewardMoney: 5
    },
    goblin: {
        name: "Goblin",
        hp: 25,
        maxHp: 25,
        damage: 3,
        rewardMoney: 15
    }
};

// Load saved player data
if (fs.existsSync(SAVE_FILE)) {
    players = JSON.parse(fs.readFileSync(SAVE_FILE));
}

// Upgrade older accounts
for (const username in players) {
    if (players[username].money === undefined) players[username].money = 0;
    if (players[username].damage === undefined) players[username].damage = 1;
    if (players[username].maxHp === undefined) players[username].maxHp = 20;
    if (players[username].hp === undefined) players[username].hp = players[username].maxHp;
}

savePlayers();

function savePlayers() {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(players, null, 2));
}

function getPublicPlayer(player) {
    return {
        username: player.username,
        damage: player.damage,
        money: player.money,
        hp: player.hp,
        maxHp: player.maxHp
    };
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

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("register", ({ username, password }) => {
        if (!username || !password) {
            socket.emit("authResult", {
                success: false,
                message: "Username and password required."
            });
            return;
        }

        if (players[username]) {
            socket.emit("authResult", {
                success: false,
                message: "Username already exists."
            });
            return;
        }

        players[username] = {
            username,
            password,
            damage: 1,
            money: 0,
            hp: 20,
            maxHp: 20
        };

        savePlayers();

        socket.emit("authResult", {
            success: true,
            username,
            message: "Account created."
        });

        broadcastPlayers();
    });

    socket.on("login", ({ username, password }) => {
        const player = players[username];

        if (!player || player.password !== password) {
            socket.emit("authResult", {
                success: false,
                message: "Invalid username or password."
            });
            return;
        }

        socketToUser[socket.id] = username;

        socket.emit("authResult", {
            success: true,
            username,
            message: "Logged in."
        });

        sendPlayerData(socket, player);
        broadcastPlayers();
    });

    socket.on("loadPlayer", (username) => {
        const player = players[username];

        if (!player) {
            socket.emit("notLoggedIn");
            return;
        }

        socketToUser[socket.id] = username;

        sendPlayerData(socket, player);
        broadcastPlayers();
    });

    socket.on("trainDamage", () => {
        const username = socketToUser[socket.id];
        if (!username || !players[username]) return;

        players[username].damage++;

        savePlayers();
        sendPlayerData(socket, players[username]);
        broadcastPlayers();
    });

    socket.on("workJob", () => {
        const username = socketToUser[socket.id];
        if (!username || !players[username]) return;

        players[username].money += 10;

        savePlayers();
        sendPlayerData(socket, players[username]);
        broadcastPlayers();
    });

    // Start a simple PvE fight
    socket.on("startFight", (enemyType) => {
        const username = socketToUser[socket.id];
        if (!username || !players[username]) return;

        const enemyTemplate = ENEMIES[enemyType];

        if (!enemyTemplate) {
            socket.emit("combatMessage", "That enemy does not exist.");
         return;
        }

        activeFights[socket.id] = {
            enemy: { ...enemyTemplate },
            log: [`A ${enemyTemplate.name} stands before you.`]
        };

        socket.emit("fightUpdate", activeFights[socket.id]);
    });

    // Attack the enemy
    socket.on("attackEnemy", () => {
        const username = socketToUser[socket.id];
        if (!username || !players[username]) return;

        const player = players[username];
        const fight = activeFights[socket.id];

        if (!fight) {
            socket.emit("combatMessage", "You are not in a fight.");
            return;
        }

        const enemy = fight.enemy;

        enemy.hp -= player.damage;
        fight.log.push(`You hit the ${enemy.name} for ${player.damage} damage.`);

        if (enemy.hp <= 0) {
            enemy.hp = 0;
            player.money += enemy.rewardMoney;

            fight.log.push(`You defeated the ${enemy.name}!`);
            fight.log.push(`You earned $${enemy.rewardMoney}.`);

            savePlayers();
            sendPlayerData(socket, player);
            broadcastPlayers();

            socket.emit("fightUpdate", fight);
            delete activeFights[socket.id];
            return;
        }

        player.hp -= enemy.damage;
        fight.log.push(`The ${enemy.name} hits you for ${enemy.damage} damage.`);

        if (player.hp <= 0) {
            player.hp = player.maxHp;
            fight.log.push("You were defeated and returned to full HP.");

            savePlayers();
            sendPlayerData(socket, player);
            broadcastPlayers();

            socket.emit("fightUpdate", fight);
            delete activeFights[socket.id];
            return;
        }

        savePlayers();
        sendPlayerData(socket, player);
        broadcastPlayers();
        socket.emit("fightUpdate", fight);
    });

    socket.on("logout", () => {
        delete socketToUser[socket.id];
        delete activeFights[socket.id];
        socket.emit("loggedOut");
    });

    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
        delete socketToUser[socket.id];
        delete activeFights[socket.id];
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});