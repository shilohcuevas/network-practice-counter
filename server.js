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

// Load saved player data when the server starts
if (fs.existsSync(SAVE_FILE)) {
    players = JSON.parse(fs.readFileSync(SAVE_FILE));
}

// Upgrade older accounts with newer fields
for (const username in players) {
    if (players[username].money === undefined) {
        players[username].money = 0;
    }
}

// Save upgraded data back into players.json
savePlayers();

// Save all player data to players.json
function savePlayers() {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(players, null, 2));
}

// Return player data without exposing passwords
function publicPlayers() {
    const safePlayers = {};

    for (const username in players) {
        safePlayers[username] = {
            username: players[username].username,
            damage: players[username].damage,
            money: players[username].money
        };
    }

    return safePlayers;
}

// Send updated player list to everyone
function broadcastPlayers() {
    io.emit("playersUpdate", publicPlayers());
}

// Serve files from the public folder
app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    // Register a new account
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
            username: username,
            password: password,
            damage: 1,
            money: 0
        };

        savePlayers();

        socket.emit("authResult", {
            success: true,
            username: username,
            message: "Account created."
        });

        broadcastPlayers();
    });

    // Log into an existing account
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
            username: username,
            message: "Logged in."
        });

        socket.emit("playerData", {
            username: player.username,
            damage: player.damage,
            money: player.money
        });

        broadcastPlayers();
    });

    // Reload player data when changing pages
    socket.on("loadPlayer", (username) => {
        const player = players[username];

        if (!player) {
            socket.emit("notLoggedIn");
            return;
        }

        socketToUser[socket.id] = username;

        socket.emit("playerData", {
            username: player.username,
            damage: player.damage,
            money: player.money
        });

        broadcastPlayers();
    });

    // Train damage stat
    socket.on("trainDamage", () => {
        const username = socketToUser[socket.id];

        if (!username || !players[username]) return;

        players[username].damage++;

        savePlayers();

        socket.emit("playerData", {
            username: players[username].username,
            damage: players[username].damage,
            money: players[username].money
        });

        broadcastPlayers();
    });

    // Work job to earn money
    socket.on("workJob", () => {
        const username = socketToUser[socket.id];

        if (!username || !players[username]) return;

        players[username].money += 10;

        savePlayers();

        socket.emit("playerData", {
            username: players[username].username,
            damage: players[username].damage,
            money: players[username].money
        });

        broadcastPlayers();
    });

    // Log out of current socket
    socket.on("logout", () => {
        delete socketToUser[socket.id];
        socket.emit("loggedOut");
    });

    // Clean up socket when user disconnects
    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
        delete socketToUser[socket.id];
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});