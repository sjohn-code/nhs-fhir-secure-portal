import express from "express";
import { DatabaseSync } from "node:sqlite";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
app.disable("x-powered-by");
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

// AUTHENTICATION: verify the signature, issuer, audience and expiry of the JWT.
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

// AUTHORISATION (the IDOR fix): a patient may only access their own record.
function ownPatientOnly(req, res, next) {
  if (req.params.id !== req.user.patient_id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

app.use("/api", requireAuth);

// Returns only the caller's own record, taken from the token, not from the URL.
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

// Parameterised query, limited to the caller's own directory entry.
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

// The author comes from the verified token, so callers cannot impersonate anyone.
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
  console.log("API listening on http://localhost:3000 (JWT auth + per-patient authorisation)");
});