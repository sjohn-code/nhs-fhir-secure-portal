import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
app.disable("x-powered-by");
app.use(helmet()); // security headers: CSP, nosniff, frame protection, etc.
app.use(express.json({ limit: "10kb" }));

const FHIR = "http://localhost:8080/fhir";
const ISSUER = "http://localhost:8081/realms/nhs-portal";
const AUDIENCE = "portal-api";
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`));

const db = new DatabaseSync("directory.db");
db.exec(`CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT, author TEXT, body TEXT
)`);

// AUDIT LOG: one JSON line per API request. It records who, what, when and the
// outcome. It never records tokens, query strings or note text, because those
// can contain sensitive data.
const AUDIT_FILE = "audit.log";
function audit(entry) {
  fs.appendFileSync(
    AUDIT_FILE,
    JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n"
  );
}

app.use("/api", (req, res, next) => {
  res.on("finish", () => {
    const s = res.statusCode;
    audit({
      event:
        s === 401 || s === 403 ? "access_denied" : s === 429 ? "rate_limited" : "api_request",
      user: req.user?.preferred_username ?? null,
      sub: req.user?.sub ?? null,
      patient_context: req.user?.patient_id ?? null,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl.split("?")[0].slice(0, 200),
      status: s,
    });
  });
  next();
});

// RATE LIMITING: applied before authentication so unauthenticated floods are
// throttled too. State is in memory and resets on restart.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests" },
  })
);

// AUTHENTICATION: verify signature, issuer, audience and expiry of the JWT.
async function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    });
    if (typeof payload.patient_id !== "string") {
      return res.status(403).json({ error: "No patient context in token" });
    }
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

// AUTHORISATION: a patient may only access their own record.
function ownPatientOnly(req, res, next) {
  if (req.params.id !== req.user.patient_id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

app.use("/api", requireAuth);

app.get("/api/patients", async (req, res) => {
  try {
    const r = await fetch(`${FHIR}/Patient/${encodeURIComponent(req.user.patient_id)}`);
    if (!r.ok) return res.json([]);
    const p = await r.json();
    res.json([
      {
        id: p.id,
        name: `${p.name?.[0]?.given?.[0] ?? ""} ${p.name?.[0]?.family ?? ""}`,
        birthDate: p.birthDate,
        gender: p.gender,
      },
    ]);
  } catch (err) {
    res.status(502).json({ error: "FHIR server unreachable" });
  }
});

app.get("/api/patients/:id", ownPatientOnly, async (req, res) => {
  try {
    const response = await fetch(`${FHIR}/Patient/${encodeURIComponent(req.params.id)}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "FHIR server unreachable" });
  }
});

app.get("/api/search", (req, res) => {
  const name = String(req.query.name || "").slice(0, 100);
  try {
    const rows = db
      .prepare(
        "SELECT fhir_id, full_name, postcode FROM patient_directory " +
          "WHERE full_name LIKE ? AND fhir_id = ?"
      )
      .all(`%${name}%`, req.user.patient_id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/api/patients/:id/notes", ownPatientOnly, (req, res) => {
  res.json(
    db.prepare("SELECT id, author, body FROM notes WHERE patient_id = ?").all(req.params.id)
  );
});

app.post("/api/patients/:id/notes", ownPatientOnly, (req, res) => {
  const body = req.body?.body;
  if (typeof body !== "string" || body.length === 0 || body.length > 2000) {
    return res.status(400).json({ error: "Invalid note" });
  }
  db.prepare("INSERT INTO notes (patient_id, author, body) VALUES (?, ?, ?)").run(
    req.params.id, req.user.name || req.user.preferred_username, body
  );
  res.status(201).json({ saved: true });
});

app.listen(3000, "127.0.0.1", () => {
  console.log("API listening on http://localhost:3000 (JWT auth, authorisation, helmet, rate limit, audit log)");
});