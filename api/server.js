import express from "express";
import { DatabaseSync } from "node:sqlite";

const app = express();
app.use(express.json());
const FHIR = "http://localhost:8080/fhir";
const db = new DatabaseSync("directory.db");

db.exec(`CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id TEXT, author TEXT, body TEXT
)`);

// List patients (no auth: intentionally vulnerable v1)
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

// INTENTIONALLY VULNERABLE (v1): IDOR, no authentication or ownership check.
app.get("/api/patients/:id", async (req, res) => {
  try {
    const response = await fetch(`${FHIR}/Patient/${req.params.id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "FHIR server unreachable" });
  }
});

// INTENTIONALLY VULNERABLE (v1): SQL injection via string concatenation.
app.get("/api/search", (req, res) => {
  const name = req.query.name || "";
  const sql =
    "SELECT fhir_id, full_name, postcode FROM patient_directory " +
    "WHERE full_name LIKE '%" + name + "%'";
  try {
    res.json(db.prepare(sql).all());
  } catch (err) {
    res.status(500).json({ error: err.message, query: sql });
  }
});

// Clinical notes. INTENTIONALLY VULNERABLE (v1): the body is stored as-is,
// with no validation or sanitisation (the frontend then renders it as HTML).
app.get("/api/patients/:id/notes", (req, res) => {
  res.json(
    db.prepare("SELECT id, author, body FROM notes WHERE patient_id = ?").all(req.params.id)
  );
});

app.post("/api/patients/:id/notes", (req, res) => {
  const { author = "anonymous", body = "" } = req.body;
  db.prepare("INSERT INTO notes (patient_id, author, body) VALUES (?, ?, ?)").run(
    req.params.id, author, body
  );
  res.status(201).json({ saved: true });
});

app.listen(3000, "127.0.0.1", () => {
  console.log("API v1 (vulnerable) listening on http://localhost:3000");
});