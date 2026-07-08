const assert = require("node:assert/strict");
const { migratePlayers } = require("../scripts/migrate-player-save");
const { verifyPassword } = require("../lib/security");

async function run() {
    const source = JSON.stringify({
        LegacyHero: {
            username: "LegacyHero",
            password: "legacy-secret",
            damage: 7,
            money: 125,
            hp: 38,
            maxHp: 40
        }
    });
    const { migrated, hashedPasswords } = await migratePlayers(source);
    const hero = migrated.LegacyHero;

    assert.equal(hashedPasswords, 1);
    assert.match(hero.password, /^scrypt\$/);
    assert.equal((await verifyPassword("legacy-secret", hero.password)).valid, true);
    assert.deepEqual(hero.unlockedEnemies, ["rat", "slime", "goblin", "orc"]);
    assert.equal(hero.level, 1);
    assert.equal(hero.accuracy, 75);
    assert.equal(hero.money, 125);
    assert.equal(hero.hp, 38);

    console.log("Player-save migration test passed.");
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
