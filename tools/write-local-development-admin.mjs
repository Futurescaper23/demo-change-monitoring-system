import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

const storePath = option("--store");
const username = option("--username");
const label = option("--label") || "Local development administrator";
const password = fs.readFileSync(0, "utf8").replace(/[\r\n]+$/, "");

if (!storePath || !username || !password) {
  throw new Error("A local store path, username, and password are required.");
}
if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) {
  throw new Error("Username must use 3–80 letters, numbers, dot, underscore, or hyphen characters.");
}
if (password.length < 12) {
  throw new Error("Choose a password of at least 12 characters.");
}

const resolvedStorePath = path.resolve(storePath);
fs.mkdirSync(path.dirname(resolvedStorePath), { recursive: true });

let users = [];
if (fs.existsSync(resolvedStorePath)) {
  const payload = JSON.parse(fs.readFileSync(resolvedStorePath, "utf8"));
  if (!Array.isArray(payload?.users)) {
    throw new Error("Local access-user store has an invalid shape.");
  }
  users = payload.users;
}

const now = new Date().toISOString();
const salt = crypto.randomBytes(16).toString("hex");
const passwordHash = crypto.scryptSync(password, salt, 64).toString("hex");
const existingIndex = users.findIndex((user) => String(user.username || "").toLowerCase() === username.toLowerCase());
const existing = existingIndex >= 0 ? users[existingIndex] : null;
const user = {
  id: existing?.id || `local-dev-admin-${crypto.randomUUID()}`,
  username,
  label,
  notes: "Local development-only account.",
  active: true,
  expiresAt: null,
  isAdmin: true,
  passwordSalt: salt,
  passwordHash,
  createdAt: existing?.createdAt || now,
  updatedAt: now,
  lastLoginAt: existing?.lastLoginAt || null,
  loginCount: Number(existing?.loginCount || 0)
};

if (existingIndex >= 0) {
  users[existingIndex] = user;
} else {
  users.push(user);
}

const temporaryPath = `${resolvedStorePath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, JSON.stringify({ users }, null, 2), { encoding: "utf8", mode: 0o600 });
fs.renameSync(temporaryPath, resolvedStorePath);
console.log(`Saved the local development administrator '${username}' in the local-only user store.`);
