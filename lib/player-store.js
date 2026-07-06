const fs = require("node:fs");
const path = require("node:path");

class PlayerStore {
    constructor(filePath) {
        this.filePath = path.resolve(filePath);
        this.backupPath = `${this.filePath}.backup`;
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    }

    load() {
        if (!fs.existsSync(this.filePath)) {
            return {};
        }

        try {
            const players = JSON.parse(fs.readFileSync(this.filePath, "utf8"));

            if (!players || Array.isArray(players) || typeof players !== "object") {
                throw new Error("Player data must be a JSON object.");
            }

            return players;
        } catch (error) {
            throw new Error(`Unable to load player data from ${this.filePath}: ${error.message}`);
        }
    }

    save(players) {
        const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
        const contents = JSON.stringify(players, null, 2);

        try {
            fs.writeFileSync(temporaryPath, contents, {
                encoding: "utf8",
                mode: 0o600
            });

            if (fs.existsSync(this.filePath)) {
                fs.copyFileSync(this.filePath, this.backupPath);
            }

            fs.renameSync(temporaryPath, this.filePath);
        } catch (error) {
            if (fs.existsSync(temporaryPath)) {
                fs.rmSync(temporaryPath, { force: true });
            }

            throw new Error(`Unable to save player data to ${this.filePath}: ${error.message}`);
        }
    }

    refreshBackup() {
        if (fs.existsSync(this.filePath)) {
            fs.copyFileSync(this.filePath, this.backupPath);
        }
    }
}

module.exports = { PlayerStore };
