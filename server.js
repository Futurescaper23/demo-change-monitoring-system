import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { areaSettings, assetSettings } from "./src/data/areas.js";
import { environmentalContext } from "./src/data/environmentalContext.js";
import { surveySettings } from "./src/data/surveys.js";
import { volumeChangeSettings } from "./src/data/volumeChange.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3080);
const WORLDTIDES_API_KEY = process.env.WORLDTIDES_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
// Deliberately opt-in and used only by the local launcher. Production ignores
// persistent-user admin flags and continues to use its existing master secret.
const LOCAL_DEVELOPMENT_AUTH = process.env.LOCAL_DEVELOPMENT_AUTH === "1";
const TIDE_LATITUDE = environmentalContext.tide.latitude;
const TIDE_LONGITUDE = environmentalContext.tide.longitude;
const REPO_ACCESS_USERS_PATH = path.resolve(__dirname, "./data/access-users.json");
const ACCESS_USERS_PATH = resolveAccessUsersPath(
  process.env.ACCESS_USERS_PATH
  || (fs.existsSync("/var/data") ? "/var/data/access-users.json" : "./data/access-users.json")
);
const INVITATIONS_PATH = resolveAccessUsersPath(
  process.env.INVITATIONS_PATH
  || (fs.existsSync("/var/data") ? "/var/data/demo-invitations.json" : "./data/demo-invitations.json")
);
const LOGIN_PAGE_PATH = path.join(__dirname, "login.html");
const SESSION_COOKIE_NAME = "fsm_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
const INVITATION_DURATION_DAYS = new Set([3, 7, 14, 30]);
const INVITATION_TOKEN_BYTES = 32;
const INVITATION_REDEMPTION_LIMIT = 20;
const INVITATION_REDEMPTION_WINDOW_MS = 15 * 60 * 1000;
const INVITATION_CREATION_LIMIT = 20;
const INVITATION_CREATION_WINDOW_MS = 60 * 60 * 1000;
const DEMO_OPEN_ACCESS = false;
const sessions = new Map();
const rateLimitBuckets = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".csv": "text/csv; charset=utf-8"
};

ensureAccessUsersStore();
ensureInvitationsStore();

http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const session = getSessionFromRequest(request);

  if (request.method === "GET" && url.pathname === "/login") {
    if (session) {
      response.writeHead(302, { Location: "/" });
      response.end();
      return;
    }
    serveLoginPage(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/site-auth/login") {
    await handleSiteAuthLoginRequest(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/invite") {
    serveInvitationRedeemPage(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/invitations/redeem") {
    await handleInvitationRedemptionRequest(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/site-auth/logout") {
    await handleSiteAuthLogoutRequest(request, response, session);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/site-auth/session") {
    handleSiteAuthSessionRequest(response, session);
    return;
  }

  if (!session && !DEMO_OPEN_ACCESS) {
    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 401, { error: "Sign-in required." });
      return;
    }
    response.writeHead(302, { Location: "/login" });
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/upload") {
    await handleUploadRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/surveys/create") {
    await handleSurveyCreateRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin-auth") {
    await handleAdminAuthRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/survey-area-metadata") {
    await handleSurveyAreaMetadataRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/survey-area-metadata/reset") {
    await handleSurveyAreaMetadataResetRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/volume-change") {
    await handleVolumeChangeRequest(request, response, session);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/access-users") {
    await handleAccessUsersListRequest(response, session);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/invitations") {
    await handleInvitationsListRequest(response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/invitations") {
    await handleInvitationCreateRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/invitations/update") {
    await handleInvitationUpdateRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/access-users") {
    await handleAccessUsersCreateRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/access-users/update") {
    await handleAccessUsersUpdateRequest(request, response, session);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/access-users/delete") {
    await handleAccessUsersDeleteRequest(request, response, session);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/weather") {
    await handleWeatherRequest(url, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/tides") {
    await handleTideRequest(url, response);
    return;
  }

  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  if (requestPath === "/data/area8-trend-stats.json") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const filePath = path.normalize(path.join(__dirname, requestPath));

  if (!filePath.startsWith(__dirname) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const stat = fs.statSync(filePath);
  const etag = `W/\"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}\"`;
  const headers = {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "ETag": etag,
    // Survey imagery remains authenticated and is never eligible for a shared
    // cache. Conditional private caching avoids re-downloading unchanged maps.
    "Cache-Control": "private, max-age=0, must-revalidate"
  };
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`FutureScaping monitoring system running at http://localhost:${port}`);
});

async function handleUploadRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const { projectId, surveyId, areaId, fileName, contentBase64 } = body;

    if (!projectId || !surveyId || !areaId || !fileName || !contentBase64) {
      sendJson(response, 400, { error: "projectId, surveyId, areaId, fileName, and contentBase64 are required." });
      return;
    }

    const allowedFiles = new Set(expectedSurveyFileNames());
    if (!allowedFiles.has(fileName)) {
      sendJson(response, 400, { error: `Unsupported file name: ${fileName}` });
      return;
    }

    const areaDir = path.join(__dirname, "survey-data", projectId, surveyId, areaId);
    const safeAreaDir = path.normalize(areaDir);
    if (!safeAreaDir.startsWith(path.join(__dirname, "survey-data"))) {
      sendJson(response, 400, { error: "Invalid target path." });
      return;
    }

    fs.mkdirSync(safeAreaDir, { recursive: true });
    const filePath = path.join(safeAreaDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(contentBase64, "base64"));

    const manifestPath = path.join(safeAreaDir, "manifest.json");
    writeManifest(manifestPath, projectId, surveyId, areaId, safeAreaDir);

    sendJson(response, 200, {
      message: `Uploaded ${fileName} to ${projectId}/${surveyId}/${areaId}.`
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleSurveyCreateRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const { projectId, name, dateFrom, dateTo, comparisonBaseline } = body;

    if (!projectId || !name || !dateFrom || !dateTo) {
      sendJson(response, 400, { error: "projectId, name, dateFrom, and dateTo are required." });
      return;
    }

    if (dateTo < dateFrom) {
      sendJson(response, 400, { error: "dateTo must be the same as or later than dateFrom." });
      return;
    }

    const projectsPath = path.join(__dirname, "data", "projects.json");
    const dataset = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const project = dataset.projects.find((item) => item.id === projectId);
    if (!project) {
      sendJson(response, 404, { error: `Project not found: ${projectId}` });
      return;
    }

    const id = dateFrom;
    if (project.surveys.some((survey) => survey.id === id)) {
      sendJson(response, 409, { error: `A survey round already exists for ${dateFrom}.` });
      return;
    }

    const surveyNumber = project.surveys.length + 1;
    const survey = {
      id,
      label: `${name} - ${formatDateRangeLabel(dateFrom, dateTo)}`,
      shortDate: formatShortDateRange(dateFrom, dateTo),
      dateFrom,
      dateTo,
      status: surveySettings.initialStatus,
      readiness: surveySettings.initialReadiness,
      assetFolder: formatAssetFolder(projectId, id),
      dataFolder: surveySettings.dataFolderFromSurveyId ? id : dateFrom,
      comparisonBaseline: comparisonBaseline || project.surveys[project.surveys.length - 1]?.id || null,
      notes: `${name} created from the admin console as survey round ${surveyNumber}.`
    };

    project.surveys.push(survey);
    project.surveys.sort((a, b) => String(a.dateFrom).localeCompare(String(b.dateFrom)));
    fs.writeFileSync(projectsPath, JSON.stringify(dataset, null, 2));

    const surveyBase = path.join(__dirname, "survey-data", projectId, id);
    for (let n = 1; n <= areaSettings.count; n += 1) {
      const areaId = `${areaSettings.idPrefix}${n}`;
      const areaDir = path.join(surveyBase, areaId);
      fs.mkdirSync(areaDir, { recursive: true });
      writeManifest(path.join(areaDir, "manifest.json"), projectId, id, areaId, areaDir);
    }

    sendJson(response, 200, { survey });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleSurveyAreaMetadataRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const { projectId, surveyId, areaId, fields } = body;

    if (!projectId || !surveyId || !areaId || !fields || typeof fields !== "object") {
      sendJson(response, 400, { error: "projectId, surveyId, areaId, and fields are required." });
      return;
    }

    const projectsPath = path.join(__dirname, "data", "projects.json");
    const dataset = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const project = dataset.projects.find((item) => item.id === projectId);
    if (!project) {
      sendJson(response, 404, { error: `Project not found: ${projectId}` });
      return;
    }

    const survey = project.surveys.find((item) => item.id === surveyId);
    if (!survey) {
      sendJson(response, 404, { error: `Survey not found: ${surveyId}` });
      return;
    }

    const allowed = new Set([
      "statusLabel",
      "statusTone",
      "purpose",
      "start",
      "finish",
      "size",
      "lowTide",
      "lowTideHeight",
      "launchOffset",
      "estimatedDuration",
      "actualDuration",
      "tideWindow",
      "tideScore",
      "tags",
      "missionRole",
      "operationalNote",
      "weatherNotes",
      "surveyNotes"
    ]);

    const override = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!allowed.has(key)) {
        continue;
      }
      if (key === "tags") {
        override.tags = Array.isArray(value)
          ? value.map((item) => String(item).trim()).filter(Boolean)
          : [];
        continue;
      }
      if (key === "tideScore") {
        const number = Number.parseInt(String(value), 10);
        override.tideScore = Number.isFinite(number) ? number : 0;
        continue;
      }
      override[key] = String(value ?? "").trim();
    }

    project.surveyAreaOverrides = project.surveyAreaOverrides || {};
    project.surveyAreaOverrides[surveyId] = project.surveyAreaOverrides[surveyId] || {};
    project.surveyAreaOverrides[surveyId][areaId] = override;
    fs.writeFileSync(projectsPath, JSON.stringify(dataset, null, 2));

    sendJson(response, 200, { override });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleSurveyAreaMetadataResetRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const { projectId, surveyId, areaId } = body;

    if (!projectId || !surveyId || !areaId) {
      sendJson(response, 400, { error: "projectId, surveyId, and areaId are required." });
      return;
    }

    const projectsPath = path.join(__dirname, "data", "projects.json");
    const dataset = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const project = dataset.projects.find((item) => item.id === projectId);
    if (!project) {
      sendJson(response, 404, { error: `Project not found: ${projectId}` });
      return;
    }

    if (project.surveyAreaOverrides?.[surveyId]) {
      delete project.surveyAreaOverrides[surveyId][areaId];
      if (!Object.keys(project.surveyAreaOverrides[surveyId]).length) {
        delete project.surveyAreaOverrides[surveyId];
      }
    }

    fs.writeFileSync(projectsPath, JSON.stringify(dataset, null, 2));
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleVolumeChangeRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const { projectId, surveyId, areaId, method, cellSize, notes, polygons } = body;

    if (!projectId || !surveyId || !areaId || !Array.isArray(polygons)) {
      sendJson(response, 400, { error: "projectId, surveyId, areaId, and polygons are required." });
      return;
    }

    const projectsPath = path.join(__dirname, "data", "projects.json");
    const dataset = JSON.parse(fs.readFileSync(projectsPath, "utf8"));
    const project = dataset.projects.find((item) => item.id === projectId);
    if (!project) {
      sendJson(response, 404, { error: `Project not found: ${projectId}` });
      return;
    }

    const survey = project.surveys.find((item) => item.id === surveyId);
    if (!survey) {
      sendJson(response, 404, { error: `Survey not found: ${surveyId}` });
      return;
    }

    const cleanedPolygons = polygons.map((item, index) => ({
      id: item.id || `bar_${String(index + 1).padStart(2, "0")}`,
      label: String(item.label || `${volumeChangeSettings.rowLabelFallback} ${index + 1}`).trim(),
      gainM3: Number(item.gainM3 || 0),
      lossM3: Number(item.lossM3 || 0),
      netM3: Number(item.netM3 || 0),
      confidence: String(item.confidence || volumeChangeSettings.defaultConfidence).trim(),
      summary: String(item.summary || volumeChangeSettings.defaultSummary).trim()
    }));

    project.volumeChangeComparisons = project.volumeChangeComparisons || {};
    project.volumeChangeComparisons[surveyId] = project.volumeChangeComparisons[surveyId] || {
      baselineSurveyId: survey.comparisonBaseline || null,
      areas: {}
    };
    project.volumeChangeComparisons[surveyId].baselineSurveyId = survey.comparisonBaseline || project.volumeChangeComparisons[surveyId].baselineSurveyId || null;
    project.volumeChangeComparisons[surveyId].method = String(method || "").trim();
    project.volumeChangeComparisons[surveyId].cellSize = String(cellSize || "").trim();
    project.volumeChangeComparisons[surveyId].areas = project.volumeChangeComparisons[surveyId].areas || {};
    project.volumeChangeComparisons[surveyId].areas[areaId] = {
      method: String(method || "").trim(),
      cellSize: String(cellSize || "").trim(),
      notes: String(notes || "").trim(),
      polygons: cleanedPolygons,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(projectsPath, JSON.stringify(dataset, null, 2));

    sendJson(response, 200, {
      record: {
        baselineSurveyId: project.volumeChangeComparisons[surveyId].baselineSurveyId,
        method: project.volumeChangeComparisons[surveyId].method,
        cellSize: project.volumeChangeComparisons[surveyId].cellSize,
        area: project.volumeChangeComparisons[surveyId].areas[areaId]
      }
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleAdminAuthRequest(request, response, session) {
  try {
    if (!session) {
      sendJson(response, 401, { error: "Sign-in required." });
      return;
    }
    if (session.authType === "invitation") {
      sendJson(response, 403, { error: "Invitation access cannot open the admin console." });
      return;
    }
    if (!ADMIN_PASSWORD) {
      sendJson(response, 500, { error: "Server configuration error: ADMIN_PASSWORD is not set." });
      return;
    }

    const body = await readJsonBody(request);
    const { password } = body;
    if (!password) {
      sendJson(response, 400, { error: "Password is required." });
      return;
    }

    if (password !== ADMIN_PASSWORD) {
      sendJson(response, 401, { error: "Incorrect password." });
      return;
    }

    session.isAdmin = true;
    sendJson(response, 200, {
      ok: true,
      users: sanitiseAccessUsers(loadAccessUsers())
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleSiteAuthLoginRequest(request, response) {
  try {
    const body = await readJsonBody(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      sendJson(response, 400, { error: "Username and password are required." });
      return;
    }

    const adminLoginMatch = ADMIN_PASSWORD && username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && password === ADMIN_PASSWORD;
    let authUser = null;

    if (adminLoginMatch) {
      authUser = {
        id: "admin-master",
        username: ADMIN_USERNAME,
        label: "Admin master access",
        expiresAt: null,
        isMaster: true
      };
    } else {
      const users = loadAccessUsers();
      const matched = users.find((item) => item.username.toLowerCase() === username.toLowerCase());
      if (!matched || !matched.active) {
        sendJson(response, 401, { error: "Incorrect username or password." });
        return;
      }
      if (matched.expiresAt && Date.parse(matched.expiresAt) <= Date.now()) {
        sendJson(response, 401, { error: "This login has expired." });
        return;
      }
      if (!verifyPassword(password, matched)) {
        sendJson(response, 401, { error: "Incorrect username or password." });
        return;
      }
      recordAccessUserLogin(users, matched);
      const isLocalDevelopmentAdmin = LOCAL_DEVELOPMENT_AUTH && matched.isAdmin === true;
      authUser = {
        id: matched.id,
        username: matched.username,
        label: matched.label || matched.username,
        expiresAt: matched.expiresAt || null,
        isMaster: false,
        isAdmin: isLocalDevelopmentAdmin
      };
    }

    const sessionId = crypto.randomUUID();
    const sessionExpiresAt = authUser.expiresAt
      ? Math.min(Date.parse(authUser.expiresAt), Date.now() + SESSION_DURATION_MS)
      : Date.now() + SESSION_DURATION_MS;
    sessions.set(sessionId, {
      id: sessionId,
      userId: authUser.id,
      username: authUser.username,
      label: authUser.label,
      expiresAt: sessionExpiresAt,
      accessExpiresAt: authUser.expiresAt,
      authType: "password",
      isMaster: authUser.isMaster,
      isAdmin: authUser.isAdmin ?? authUser.isMaster
    });

    sendJson(
      response,
      200,
      {
        ok: true,
        user: {
          username: authUser.username,
          label: authUser.label,
          expiresAt: authUser.expiresAt
        }
      },
      {
        "Set-Cookie": buildSessionCookie(sessionId, sessionExpiresAt, request)
      }
    );
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleSiteAuthLogoutRequest(request, response, session) {
  if (session) {
    sessions.delete(session.id);
  }
  sendJson(
    response,
    200,
    { ok: true },
    {
      "Set-Cookie": clearSessionCookie(request)
    }
  );
}

function handleSiteAuthSessionRequest(response, session) {
  if (!session) {
    sendJson(response, 200, { authenticated: false });
    return;
  }
  sendJson(response, 200, {
    authenticated: true,
    user: {
      username: session.username,
      label: session.label,
      expiresAt: session.accessExpiresAt || null,
      isAdmin: Boolean(session.isAdmin)
    }
  });
}

async function handleAccessUsersListRequest(response, session) {
  if (!requireAdminSession(response, session)) {
    return;
  }
  sendJson(response, 200, {
    users: sanitiseAccessUsers(loadAccessUsers())
  });
}

async function handleAccessUsersCreateRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const label = String(body.label || "").trim() || username;
    const notes = String(body.notes || "").trim();
    const expiresAt = normaliseExpiry(body.expiresAt);
    const active = body.active !== false;

    if (!username || !password) {
      sendJson(response, 400, { error: "Username and password are required." });
      return;
    }

    const users = loadAccessUsers();
    if (users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      sendJson(response, 409, { error: "That username already exists." });
      return;
    }

    users.push({
      id: crypto.randomUUID(),
      username,
      label,
      notes,
      expiresAt,
      active,
      ...hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    saveAccessUsers(users);
    sendJson(response, 200, { users: sanitiseAccessUsers(users) });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleAccessUsersUpdateRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const id = String(body.id || "").trim();
    if (!id) {
      sendJson(response, 400, { error: "User id is required." });
      return;
    }

    const users = loadAccessUsers();
    const user = users.find((item) => item.id === id);
    if (!user) {
      sendJson(response, 404, { error: "User not found." });
      return;
    }

    if (typeof body.label !== "undefined") {
      user.label = String(body.label || "").trim() || user.username;
    }
    if (typeof body.notes !== "undefined") {
      user.notes = String(body.notes || "").trim();
    }
    if (typeof body.active !== "undefined") {
      user.active = body.active !== false;
    }
    if (typeof body.expiresAt !== "undefined") {
      user.expiresAt = normaliseExpiry(body.expiresAt);
    }
    if (body.password) {
      Object.assign(user, hashPassword(String(body.password)));
    }
    user.updatedAt = new Date().toISOString();

    saveAccessUsers(users);
    sendJson(response, 200, { users: sanitiseAccessUsers(users) });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleAccessUsersDeleteRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const id = String(body.id || "").trim();
    if (!id) {
      sendJson(response, 400, { error: "User id is required." });
      return;
    }
    const users = loadAccessUsers().filter((item) => item.id !== id);
    saveAccessUsers(users);
    sendJson(response, 200, { users: sanitiseAccessUsers(users) });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleInvitationRedemptionRequest(request, response) {
  try {
    const body = await readJsonBody(request);
    const token = normaliseInvitationToken(body.token);
    if (!takeRateLimit(`invite-redemption:${request.socket.remoteAddress || "unknown"}`, INVITATION_REDEMPTION_LIMIT, INVITATION_REDEMPTION_WINDOW_MS)) {
      sendJson(response, 429, { error: "Too many invitation attempts. Please wait and try again." }, invitationResponseHeaders());
      return;
    }

    const invitations = loadInvitations();
    const invitation = invitations.find((item) => tokenHashMatches(item.tokenHash, hashInvitationToken(token)));
    if (!isInvitationUsable(invitation)) {
      sendJson(response, 410, { error: "This invitation is no longer available." }, invitationResponseHeaders());
      return;
    }

    recordInvitationVisit(invitations, invitation);
    const expiresAt = Math.min(Date.parse(invitation.expiresAt), Date.now() + SESSION_DURATION_MS);
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      id: sessionId,
      userId: `invite:${invitation.id}`,
      username: "invited-client",
      label: invitation.recipientName,
      expiresAt,
      accessExpiresAt: Date.parse(invitation.expiresAt),
      invitationId: invitation.id,
      authType: "invitation",
      isMaster: false,
      isAdmin: false
    });
    sendJson(response, 200, { ok: true }, {
      ...invitationResponseHeaders(),
      "Set-Cookie": buildSessionCookie(sessionId, expiresAt, request)
    });
  } catch {
    sendJson(response, 400, { error: "This invitation is invalid." }, invitationResponseHeaders());
  }
}

async function handleInvitationsListRequest(response, session) {
  if (!requireAdminSession(response, session)) {
    return;
  }
  sendJson(response, 200, { invitations: sanitiseInvitations(loadInvitations()) });
}

async function handleInvitationCreateRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    if (!takeRateLimit(`invite-create:${session.id}`, INVITATION_CREATION_LIMIT, INVITATION_CREATION_WINDOW_MS)) {
      sendJson(response, 429, { error: "Invitation creation limit reached. Please wait before creating more links." });
      return;
    }
    const body = await readJsonBody(request);
    const recipientName = normaliseInvitationText(body.recipientName, "Recipient name", 120);
    const organisation = normaliseInvitationText(body.organisation, "Organisation", 160);
    const email = normaliseInvitationEmail(body.email);
    const durationDays = Number(body.durationDays || 7);
    if (!INVITATION_DURATION_DAYS.has(durationDays)) {
      sendJson(response, 400, { error: "Expiry must be 3, 7, 14, or 30 days." });
      return;
    }

    const token = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
    const createdAt = new Date().toISOString();
    const invitation = {
      id: crypto.randomUUID(),
      recipientName,
      organisation,
      email,
      tokenHash: hashInvitationToken(token),
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      firstVisitAt: null,
      lastVisitAt: null,
      visitCount: 0
    };
    const invitations = loadInvitations();
    invitations.push(invitation);
    saveInvitations(invitations);

    sendJson(response, 201, {
      invitation: sanitiseInvitation(invitation),
      invitationUrl: buildInvitationUrl(request, token)
    }, { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function handleInvitationUpdateRequest(request, response, session) {
  try {
    if (!requireAdminSession(response, session)) {
      return;
    }
    const body = await readJsonBody(request);
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();
    if (!id || !["revoke", "extend"].includes(action)) {
      sendJson(response, 400, { error: "Invitation id and a valid action are required." });
      return;
    }
    const invitations = loadInvitations();
    const invitation = invitations.find((item) => item.id === id);
    if (!invitation) {
      sendJson(response, 404, { error: "Invitation not found." });
      return;
    }
    if (action === "revoke") {
      if (!invitation.revokedAt) {
        invitation.revokedAt = new Date().toISOString();
        invitation.updatedAt = invitation.revokedAt;
        saveInvitations(invitations);
      }
    } else {
      const durationDays = Number(body.durationDays || 7);
      if (!INVITATION_DURATION_DAYS.has(durationDays)) {
        sendJson(response, 400, { error: "Extension must be 3, 7, 14, or 30 days." });
        return;
      }
      if (invitation.revokedAt) {
        sendJson(response, 409, { error: "A revoked invitation cannot be extended. Create a new invitation instead." });
        return;
      }
      const baseTime = Math.max(Date.now(), Date.parse(invitation.expiresAt) || 0);
      invitation.expiresAt = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000).toISOString();
      invitation.updatedAt = new Date().toISOString();
      saveInvitations(invitations);
    }
    sendJson(response, 200, { invitations: sanitiseInvitations(invitations) });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

function serveLoginPage(response) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer"
  });
  fs.createReadStream(LOGIN_PAGE_PATH).pipe(response);
}

function resolveAccessUsersPath(rawPath) {
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(__dirname, rawPath);
}

function ensureAccessUsersStore() {
  fs.mkdirSync(path.dirname(ACCESS_USERS_PATH), { recursive: true });
  if (!fs.existsSync(ACCESS_USERS_PATH)) {
    const seedUsers = loadSeedAccessUsers();
    fs.writeFileSync(ACCESS_USERS_PATH, JSON.stringify({ users: seedUsers }, null, 2));
  }
}

function ensureInvitationsStore() {
  fs.mkdirSync(path.dirname(INVITATIONS_PATH), { recursive: true });
  if (!fs.existsSync(INVITATIONS_PATH)) {
    fs.writeFileSync(INVITATIONS_PATH, JSON.stringify({ invitations: [] }, null, 2));
  }
}

function loadInvitations() {
  ensureInvitationsStore();
  const payload = JSON.parse(fs.readFileSync(INVITATIONS_PATH, "utf8"));
  return Array.isArray(payload?.invitations) ? payload.invitations : [];
}

function saveInvitations(invitations) {
  fs.writeFileSync(INVITATIONS_PATH, JSON.stringify({ invitations }, null, 2));
}

function sanitiseInvitations(invitations) {
  return invitations
    .slice()
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))
    .map(sanitiseInvitation);
}

function sanitiseInvitation(invitation) {
  const now = Date.now();
  const expiresAt = invitation.expiresAt || null;
  const expired = Boolean(expiresAt && Date.parse(expiresAt) <= now);
  return {
    id: invitation.id,
    recipientName: invitation.recipientName,
    organisation: invitation.organisation,
    email: invitation.email || "",
    createdAt: invitation.createdAt || null,
    updatedAt: invitation.updatedAt || null,
    expiresAt,
    revokedAt: invitation.revokedAt || null,
    firstVisitAt: invitation.firstVisitAt || null,
    lastVisitAt: invitation.lastVisitAt || null,
    visitCount: Number(invitation.visitCount || 0),
    status: invitation.revokedAt ? "revoked" : expired ? "expired" : "active"
  };
}

function normaliseInvitationText(value, fieldName, maxLength) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required.`);
  }
  if (text.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function normaliseInvitationEmail(value) {
  const email = String(value || "").trim();
  if (!email) {
    return "";
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email must be a valid email address.");
  }
  return email;
}

function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function tokenHashMatches(expectedHash, actualHash) {
  if (!/^[a-f0-9]{64}$/i.test(String(expectedHash || "")) || !/^[a-f0-9]{64}$/i.test(actualHash)) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));
}

function normaliseInvitationToken(value) {
  const token = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
    throw new Error("Invalid invitation token.");
  }
  return token;
}

function isInvitationUsable(invitation) {
  return Boolean(
    invitation
    && !invitation.revokedAt
    && invitation.expiresAt
    && Number.isFinite(Date.parse(invitation.expiresAt))
    && Date.parse(invitation.expiresAt) > Date.now()
  );
}

function recordInvitationVisit(invitations, invitation) {
  const now = new Date().toISOString();
  invitation.firstVisitAt = invitation.firstVisitAt || now;
  invitation.lastVisitAt = now;
  invitation.visitCount = Number(invitation.visitCount || 0) + 1;
  invitation.updatedAt = now;
  saveInvitations(invitations);
}

function buildInvitationUrl(request, token) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  const protocol = forwardedProto === "https" || request.socket.encrypted ? "https" : "http";
  const host = String(request.headers.host || "").trim();
  if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    throw new Error("Could not determine a safe invitation URL for this server.");
  }
  return `${protocol}://${host}/invite#${token}`;
}

function takeRateLimit(key, limit, windowMs) {
  const now = Date.now();
  for (const [bucketKey, timestamps] of rateLimitBuckets.entries()) {
    const current = timestamps.filter((timestamp) => timestamp > now - windowMs);
    if (current.length) {
      rateLimitBuckets.set(bucketKey, current);
    } else {
      rateLimitBuckets.delete(bucketKey);
    }
  }
  const timestamps = rateLimitBuckets.get(key) || [];
  if (timestamps.length >= limit) {
    return false;
  }
  timestamps.push(now);
  rateLimitBuckets.set(key, timestamps);
  return true;
}

function invitationResponseHeaders() {
  return {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer"
  };
}

function serveInvitationRedeemPage(response) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    ...invitationResponseHeaders()
  });
  response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Opening your demo</title><body><main><h1>Opening your FutureScaping demo</h1><p id="message">Checking your invitation…</p></main><script>const token=window.location.hash.slice(1);history.replaceState(null,"",window.location.pathname);const message=document.getElementById("message");if(!/^[A-Za-z0-9_-]{40,128}$/.test(token)){message.textContent="This invitation is invalid. Please contact FutureScaping if you need a new link."}else{fetch("/api/invitations/redeem",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})}).then(async response=>{if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||"This invitation is no longer available.")}window.location.replace("/")}).catch(error=>{message.textContent=error.message})}</script></body></html>`);
}

function loadSeedAccessUsers() {
  if (ACCESS_USERS_PATH === REPO_ACCESS_USERS_PATH) {
    return [];
  }
  if (!fs.existsSync(REPO_ACCESS_USERS_PATH)) {
    return [];
  }
  try {
    const payload = JSON.parse(fs.readFileSync(REPO_ACCESS_USERS_PATH, "utf8"));
    return Array.isArray(payload?.users) ? payload.users : [];
  } catch {
    return [];
  }
}

function loadAccessUsers() {
  ensureAccessUsersStore();
  const payload = JSON.parse(fs.readFileSync(ACCESS_USERS_PATH, "utf8"));
  return Array.isArray(payload?.users) ? payload.users : [];
}

function saveAccessUsers(users) {
  fs.writeFileSync(ACCESS_USERS_PATH, JSON.stringify({ users }, null, 2));
}

function sanitiseAccessUsers(users) {
  return users
    .slice()
    .sort((a, b) => String(a.username).localeCompare(String(b.username)))
    .map((user) => ({
      id: user.id,
      username: user.username,
      label: user.label || user.username,
      notes: user.notes || "",
      active: user.active !== false,
      expiresAt: user.expiresAt || null,
      createdAt: user.createdAt || null,
      updatedAt: user.updatedAt || null,
      lastLoginAt: user.lastLoginAt || null,
      loginCount: Number(user.loginCount || 0),
      isAdmin: LOCAL_DEVELOPMENT_AUTH && user.isAdmin === true,
      expired: Boolean(user.expiresAt && Date.parse(user.expiresAt) <= Date.now())
    }));
}

function recordAccessUserLogin(users, user) {
  user.lastLoginAt = new Date().toISOString();
  user.loginCount = Number(user.loginCount || 0) + 1;
  user.updatedAt = new Date().toISOString();
  saveAccessUsers(users);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { passwordSalt: salt, passwordHash: hash };
}

function verifyPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) {
    return false;
  }
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = crypto.scryptSync(password, user.passwordSalt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function normaliseExpiry(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    throw new Error("Expiry must be a valid date and time.");
  }
  return new Date(parsed).toISOString();
}

function getSessionFromRequest(request) {
  cleanupExpiredSessions();
  const cookies = parseCookies(request.headers.cookie || "");
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return null;
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  if (session.authType === "invitation") {
    const invitation = loadInvitations().find((item) => item.id === session.invitationId);
    if (!isInvitationUsable(invitation)) {
      sessions.delete(sessionId);
      return null;
    }
    session.accessExpiresAt = Date.parse(invitation.expiresAt);
  }
  return session;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}

function parseCookies(rawCookie) {
  return rawCookie.split(";").reduce((acc, part) => {
    const [name, ...rest] = part.trim().split("=");
    if (!name) {
      return acc;
    }
    acc[name] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function buildSessionCookie(sessionId, expiresAt, request) {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearSessionCookie(request) {
  const secure = isSecureRequest(request) ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

function isSecureRequest(request) {
  return request.socket.encrypted || String(request.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
}

function requireAdminSession(response, session) {
  if (!session) {
    sendJson(response, 401, { error: "Sign-in required." });
    return false;
  }
  if (!session.isAdmin) {
    sendJson(response, 403, { error: "Admin access required." });
    return false;
  }
  return true;
}

function writeManifest(manifestPath, projectId, surveyId, areaId, areaDir) {
  const expectedFiles = expectedSurveyFileNames();
  const presentFiles = expectedFiles.filter((fileName) => {
    const candidates = assetCandidatesForManifest(areaId, fileName);
    return candidates.some((candidate) => assetExistsForManifest(projectId, areaDir, areaId, fileName, candidate));
  });
  const status = presentFiles.length === 0
    ? "pending-upload"
    : presentFiles.length === expectedFiles.length
      ? "complete"
      : "partial";

  const payload = {
    projectId,
    surveyId,
    areaId,
    expectedFiles,
    presentFiles,
    missingFiles: expectedFiles.filter((fileName) => !presentFiles.includes(fileName)),
    status,
    lastUpdated: new Date().toISOString()
  };

  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
}

function expectedSurveyFileNames() {
  return assetSettings.expectedSurveyAssets.map((item) => item.fileName);
}

function assetCandidatesForManifest(areaId, fileName) {
  const configuredVariants = assetSettings.variants?.[fileName] || [];
  const areaSpecificVariants = assetSettings.areaSpecificVariants?.[areaId]?.[fileName] || [];
  return Array.from(new Set([
    fileName,
    ...configuredVariants.map((variant) => variant.replace("{areaId}", areaId)),
    ...areaSpecificVariants
  ]));
}

function assetExistsForManifest(projectId, areaDir, areaId, fileName, candidate) {
  const surveyAssetPath = path.join(areaDir, candidate);
  if (fs.existsSync(surveyAssetPath)) {
    return true;
  }
  if (fileName === "section_lines.png") {
    const sharedAssetPath = path.join(__dirname, assetSettings.sharedRoot, projectId, areaId, candidate);
    if (fs.existsSync(sharedAssetPath)) {
      return true;
    }
  }
  return false;
}

function formatAssetFolder(projectId, surveyId) {
  return surveySettings.assetFolderPattern
    .replace("{projectId}", projectId)
    .replace("{surveyId}", surveyId);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function formatDateRangeLabel(dateFrom, dateTo) {
  const start = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);
  const startDay = String(start.getDate());
  const endDay = String(end.getDate());
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const month = start.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (sameMonth) {
    return `${startDay} and ${endDay} ${month}`;
  }
  const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `${startLabel} to ${endLabel}`;
}

function formatShortDateRange(dateFrom, dateTo) {
  const start = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);
  const startDay = String(start.getDate());
  const endDay = String(end.getDate());
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const month = start.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  if (sameMonth) {
    return `${startDay}-${endDay} ${month}`;
  }
  const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} to ${endLabel}`;
}

async function handleWeatherRequest(url, response) {
  try {
    const source = url.searchParams.get("source");
    const latitude = url.searchParams.get("latitude");
    const longitude = url.searchParams.get("longitude");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    if (!source || !latitude || !longitude || !startDate || !endDate) {
      sendJson(response, 400, { error: "source, latitude, longitude, start_date, and end_date are required." });
      return;
    }

    const baseUrl = source === "forecast"
      ? "https://api.open-meteo.com/v1/forecast"
      : "https://archive-api.open-meteo.com/v1/archive";

    const upstream = new URL(baseUrl);
    upstream.searchParams.set("latitude", latitude);
    upstream.searchParams.set("longitude", longitude);
    upstream.searchParams.set("start_date", startDate);
    upstream.searchParams.set("end_date", endDate);
    upstream.searchParams.set("hourly", "temperature_2m,precipitation,windspeed_10m,windgusts_10m,pressure_msl");
    upstream.searchParams.set("timezone", "Europe/London");

    const upstreamResponse = await fetch(upstream);
    const text = await upstreamResponse.text();
    response.writeHead(upstreamResponse.status, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(text);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

async function handleTideRequest(url, response) {
  try {
    if (!WORLDTIDES_API_KEY) {
      sendJson(response, 500, { error: "Server configuration error: WORLDTIDES_API_KEY is not set." });
      return;
    }

    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    if (!startDate || !endDate) {
      sendJson(response, 400, { error: "start_date and end_date are required." });
      return;
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const days = Math.max(1, Math.ceil((end - start) / 86400000) + 1);

    const upstream = new URL("https://www.worldtides.info/api/v3");
    upstream.searchParams.set("key", WORLDTIDES_API_KEY);
    upstream.searchParams.set("lat", TIDE_LATITUDE);
    upstream.searchParams.set("lon", TIDE_LONGITUDE);
    upstream.searchParams.set("date", startDate);
    upstream.searchParams.set("days", String(days));
    upstream.searchParams.set("datum", environmentalContext.tide.datum);
    upstream.searchParams.set("localtime", "");
    upstream.searchParams.set("heights", "");
    upstream.searchParams.set("extremes", "");

    const upstreamResponse = await fetch(upstream);
    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      sendJson(response, upstreamResponse.status, { error: `WorldTides API error ${upstreamResponse.status}: ${errorText}` });
      return;
    }

    const data = await upstreamResponse.json();
    const items = (data.heights || []).map((item) => ({
      time: item.date || new Date(item.dt * 1000).toISOString(),
      value: item.height
    }));
    const extremes = (data.extremes || []).map((item) => ({
      time: item.date || new Date(item.dt * 1000).toISOString(),
      value: item.height,
      type: item.type
    }));
    sendJson(response, 200, {
      items,
      extremes,
      datum: data.datum || data.responseDatum || environmentalContext.tide.datum,
      timezone: data.timezone || null
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
}

