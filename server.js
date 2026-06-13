const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let count = 0;
let players = {};

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    players[socket.id] = "Anonymous";

    io.emit("counterUpdate", count);
    io.emit("playersUpdate", players);

    socket.on("setName", (name) => {
        players[socket.id] = name;

        console.log("Player name set:", name);

        io.emit("playersUpdate", players);
    });

    socket.on("incrementCounter", () => {
        count++;

        console.log("Counter:", count);

        io.emit("counterUpdate", count);
    });

    socket.on("disconnect", () => {
        console.log("A user disconnected:", socket.id);

        delete players[socket.id];

        io.emit("playersUpdate", players);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});