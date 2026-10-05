import express from "express";
import { DatabaseSync } from "node:sqlite";

const app = express();
app.use(express.json({ limit: "10kb" }));
const FHIR = "http://localhost:8080/fhir";
const db = new DatabaseSync("directory.db");

db.exec(`CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT, author TEXT, body TEXT
)`);

// STILL OPEN: no authentication yet (fixed later with Keycloak + JWT).
app.get("/api/patients", async (req, res) => {
  try {
    const r = await fetch(`${FHIR}/Patient?_count=50`);
    const bundle = await r.json();
    const list = (bundle.entry || []).map((e) => ({
      id: e.resource.id,
      name: `${e.resource.name?.[0]?.given?.[0] ?? ""} ${e.resource.name?.[0]?.family ?? ""}`,
      birthDate: e.resource.birthDate,
      gender: e.resource.gender,
    }));
    res.json(list);
  } catch (err) {
    res.status(502).json({ error: "FHIR server unreachable" });
  }
});

// STILL OPEN: IDOR, no authentication or ownership check (fixed later).
app.get("/api/patients/:id", async (req, res) => {
  try {
    const response = await fetch(`${FHIR}/Patient/${req.params.id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "FHIR server unreachable" });
  }
});

// FIXED: parameterised query. The database treats input strictly as data,
// never as SQL. Errors are logged server-side, not leaked to the client.
app.get("/api/search", (req, res) => {
  const name = String(req.query.name || "").slice(0, 100);
  try {
    const rows = db
      .prepare(
        "SELECT fhir_id, full_name, postcode FROM patient_directory WHERE full_name LIKE ?"
      )
      .all(`%${name}%`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

app.get("/api/patients/:id/notes", (req, res) => {
  res.json(
    db.prepare("SELECT id, author, body FROM notes WHERE patient_id = ?").all(req.params.id)
  );
});

// FIXED: server-side input validation (type and length). The main XSS fix is
// in the frontend, which now renders notes as text instead of raw HTML.
app.post("/api/patients/:id/notes", (req, res) => {
  const { author = "anonymous", body = "" } = req.body;
  if (typeof body !== "string" || body.length === 0 || body.length > 2000) {
    return res.status(400).json({ error: "Invalid note" });
  }
  if (typeof author !== "string" || author.length > 100) {
    return res.status(400).json({ error: "Invalid author" });
  }
  db.prepare("INSERT INTO notes (patient_id, author, body) VALUES (?, ?, ?)").run(
    req.params.id, author, body
  );
  res.status(201).json({ saved: true });
});

app.listen(3000, "127.0.0.1", () => {
  console.log("API listening on http://localhost:3000 (SQLi and XSS fixed, IDOR still open)");
});