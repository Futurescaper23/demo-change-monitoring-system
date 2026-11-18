import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const tempDirectory = mkdtempSync(path.join(tmpdir(), "fsm-invitation-test-"));
const accessUsersPath = path.join(tempDirectory, "access-users.json");
const invitationsPath = path.join(tempDirectory, "invitations.json");
const port = 39000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd: fileURLToPath(root),
  env: {
    ...process.env,
    PORT: String(port),
    ADMIN_USERNAME: "local-admin",
    ADMIN_PASSWORD: "test-only-admin-password",
    ACCESS_USERS_PATH: accessUsersPath,
    INVITATIONS_PATH: invitationsPath
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

function cookieFrom(response) {
  return String(response.headers.get("set-cookie") || "").split(";")[0];
}

async function request(url, options = {}) {
  return fetch(`${baseUrl}${url}`, { redirect: "manual", ...options });
}

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await request("/login");
      if (response.status === 200) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Test server did not start: ${output}`);
}

try {
  await waitForServer();

  const invitationPage = await request("/invite");
  assert.equal(invitationPage.status, 200);
  assert.equal(invitationPage.headers.get("referrer-policy"), "no-referrer");
  assert.match(await invitationPage.text(), /api\/invitations\/redeem/);

  const login = await request("/api/site-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "local-admin", password: "test-only-admin-password" })
  });
  assert.equal(login.status, 200);
  const adminCookie = cookieFrom(login);
  assert.match(adminCookie, /^fsm_session=/);

  const create = await request("/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      recipientName: "Alex Morgan",
      organisation: "Example Coastal Partnership",
      email: "alex@example.test",
      durationDays: 7
    })
  });
  assert.equal(create.status, 201);
  const created = await create.json();
  assert.match(created.invitationUrl, new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/invite#[A-Za-z0-9_-]{40,}$`));
  assert.equal(created.invitation.tokenHash, undefined);
  const invitationUrl = new URL(created.invitationUrl);
  assert.equal(invitationUrl.pathname, "/invite");
  const rawToken = invitationUrl.hash.slice(1);

  const storedAfterCreate = JSON.parse(readFileSync(invitationsPath, "utf8"));
  assert.equal(storedAfterCreate.invitations.length, 1);
  assert.equal(storedAfterCreate.invitations[0].tokenHash, createHash("sha256").update(rawToken).digest("hex"));
  assert.equal(JSON.stringify(storedAfterCreate).includes(rawToken), false);

  const redeem = await request("/api/invitations/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken })
  });
  assert.equal(redeem.status, 200);
  assert.equal(redeem.headers.get("referrer-policy"), "no-referrer");
  const inviteCookie = cookieFrom(redeem);
  assert.match(inviteCookie, /^fsm_session=/);
  const firstSessionMaxAge = Number(/Max-Age=(\d+)/.exec(String(redeem.headers.get("set-cookie") || ""))?.[1]);
  assert.ok(firstSessionMaxAge > 0 && firstSessionMaxAge <= 12 * 60 * 60);

  const reusedInvitation = await request("/api/invitations/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken })
  });
  assert.equal(reusedInvitation.status, 200);
  assert.match(cookieFrom(reusedInvitation), /^fsm_session=/);

  const inviteSession = await request("/api/site-auth/session", { headers: { Cookie: inviteCookie } });
  const inviteSessionBody = await inviteSession.json();
  assert.equal(inviteSessionBody.authenticated, true);
  assert.equal(inviteSessionBody.user.isAdmin, false);

  const adminApiDenied = await request("/api/access-users", { headers: { Cookie: inviteCookie } });
  assert.equal(adminApiDenied.status, 403);
  const adminModeDenied = await request("/api/admin-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: inviteCookie },
    body: JSON.stringify({ password: "test-only-admin-password" })
  });
  assert.equal(adminModeDenied.status, 403);

  const list = await request("/api/invitations", { headers: { Cookie: adminCookie } });
  const listed = await list.json();
  assert.equal(listed.invitations[0].visitCount, 2);
  assert.ok(listed.invitations[0].firstVisitAt);
  assert.ok(listed.invitations[0].lastVisitAt);
  assert.equal(JSON.stringify(listed).includes(rawToken), false);

  const previousExpiry = Date.parse(listed.invitations[0].expiresAt);
  const extend = await request("/api/invitations/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: created.invitation.id, action: "extend", durationDays: 3 })
  });
  assert.equal(extend.status, 200);
  const extended = await extend.json();
  assert.ok(Date.parse(extended.invitations[0].expiresAt) > previousExpiry);

  const expiredRecord = JSON.parse(readFileSync(invitationsPath, "utf8"));
  expiredRecord.invitations.find((item) => item.id === created.invitation.id).expiresAt = new Date(Date.now() - 1000).toISOString();
  writeFileSync(invitationsPath, JSON.stringify(expiredRecord, null, 2));
  const expiredSession = await request("/api/site-auth/session", { headers: { Cookie: inviteCookie } });
  assert.deepEqual(await expiredSession.json(), { authenticated: false });
  const expiredRedeem = await request("/api/invitations/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken })
  });
  assert.equal(expiredRedeem.status, 410);

  const createForRevocation = await request("/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ recipientName: "Jamie Client", organisation: "Example Coastal Partnership", durationDays: 7 })
  });
  assert.equal(createForRevocation.status, 201);
  const revocationInvite = await createForRevocation.json();
  const revocationToken = new URL(revocationInvite.invitationUrl).hash.slice(1);
  const revocationRedeem = await request("/api/invitations/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: revocationToken })
  });
  assert.equal(revocationRedeem.status, 200);
  const revocationCookie = cookieFrom(revocationRedeem);

  const revoke = await request("/api/invitations/update", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ id: revocationInvite.invitation.id, action: "revoke" })
  });
  assert.equal(revoke.status, 200);
  const revokedSession = await request("/api/site-auth/session", { headers: { Cookie: revocationCookie } });
  assert.deepEqual(await revokedSession.json(), { authenticated: false });
  const revokedRedeem = await request("/api/invitations/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: revocationToken })
  });
  assert.equal(revokedRedeem.status, 410);

  const unknownToken = "B".repeat(43);
  for (let index = 0; index < 15; index += 1) {
    const unknownRedeem = await request("/api/invitations/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: unknownToken })
    });
    assert.equal(unknownRedeem.status, 410);
  }
  const rateLimitedRedeem = await request("/api/invitations/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: unknownToken })
  });
  assert.equal(rateLimitedRedeem.status, 429);

  console.log("invitation lifecycle checks passed");
} finally {
  server.kill();
  rmSync(tempDirectory, { recursive: true, force: true });
}
