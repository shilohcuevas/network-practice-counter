const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_PREFIX = "scrypt";

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH);

    return `${PASSWORD_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedPassword) {
    if (typeof storedPassword !== "string") {
        return { valid: false, needsUpgrade: false };
    }

    if (!storedPassword.startsWith(`${PASSWORD_PREFIX}$`)) {
        const supplied = Buffer.from(password);
        const stored = Buffer.from(storedPassword);
        const valid = supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);

        return { valid, needsUpgrade: valid };
    }

    const parts = storedPassword.split("$");

    if (parts.length !== 3 || !parts[1] || !parts[2]) {
        return { valid: false, needsUpgrade: false };
    }

    const [, salt, expectedHex] = parts;
    const expected = Buffer.from(expectedHex, "hex");
    const actual = await scrypt(password, salt, expected.length);
    const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

    return { valid, needsUpgrade: false };
}

function createSessionToken() {
    return crypto.randomBytes(32).toString("base64url");
}

module.exports = {
    createSessionToken,
    hashPassword,
    verifyPassword
};
