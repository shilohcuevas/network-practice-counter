const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { hashPassword } = require("../lib/security");

const ENEMY_RECOMMENDATIONS = {
    rat: { damage: 1, maxHp: 20 },
    slime: { damage: 2, maxHp: 25 },
    goblin: { damage: 4, maxHp: 30 },
    orc: { damage: 7, maxHp: 40 },
    troll: { damage: 10, maxHp: 55 }
};

function parseArguments(argv) {
    const options = { force: false };

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];

        if (argument === "--force") {
            options.force = true;
        } else if (argument === "--input" || argument === "--git-object" || argument === "--output") {
            options[argument.slice(2).replace("-", "_")] = argv[++index];
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    if ((!options.input && !options.git_object) || (options.input && options.git_object)) {
        throw new Error("Provide exactly one source: --input <file> or --git-object <revision:path>.");
    }

    if (!options.output) throw new Error("Provide --output <file>.");

    return options;
}

function readSource(options) {
    if (options.input) return fs.readFileSync(path.resolve(options.input), "utf8");

    return execFileSync("git", ["show", options.git_object], {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
    });
}

function positiveInteger(value, fallback) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonnegativeNumber(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getGrandfatheredEnemies(damage, maxHp) {
    return Object.entries(ENEMY_RECOMMENDATIONS)
        .filter(([, recommendation]) => damage >= recommendation.damage && maxHp >= recommendation.maxHp)
        .map(([enemyType]) => enemyType);
}

async function migratePlayers(source) {
    const parsed = JSON.parse(source);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Player save must be a JSON object.");
    }

    const migrated = {};
    let hashedPasswords = 0;

    for (const [accountName, player] of Object.entries(parsed)) {
        if (!player || Array.isArray(player) || typeof player !== "object") {
            throw new Error(`Account ${accountName} is not a valid player object.`);
        }

        if (typeof player.password !== "string" || !player.password) {
            throw new Error(`Account ${accountName} has no valid password.`);
        }

        const username = typeof player.username === "string" && player.username ? player.username : accountName;
        const damage = positiveInteger(player.damage, 1);
        const maxHp = positiveInteger(player.maxHp, 20);
        const hp = Math.min(maxHp, positiveInteger(player.hp, maxHp));
        const money = nonnegativeNumber(player.money, 0);
        let password = player.password;

        if (!password.startsWith("scrypt$")) {
            password = await hashPassword(password);
            hashedPasswords++;
        }

        const validExistingUnlocks = Array.isArray(player.unlockedEnemies)
            ? player.unlockedEnemies.filter((enemyType) => ENEMY_RECOMMENDATIONS[enemyType])
            : null;
        const unlockedEnemies = validExistingUnlocks || getGrandfatheredEnemies(damage, maxHp);

        if (!unlockedEnemies.includes("rat")) unlockedEnemies.unshift("rat");

        migrated[accountName] = {
            username,
            password,
            damage,
            money,
            hp,
            maxHp,
            unlockedEnemies: [...new Set(unlockedEnemies)]
        };
    }

    return { migrated, hashedPasswords };
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const outputPath = path.resolve(options.output);

    if (fs.existsSync(outputPath) && !options.force) {
        throw new Error(`Output already exists: ${outputPath}. Use --force to replace it.`);
    }

    const { migrated, hashedPasswords } = await migratePlayers(readSource(options));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(migrated, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600
    });

    console.log(`Migrated ${Object.keys(migrated).length} player account(s).`);
    console.log(`Hashed ${hashedPasswords} legacy password(s).`);
    console.log(`Wrote protected save file to ${outputPath}.`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Migration failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { migratePlayers, parseArguments };
