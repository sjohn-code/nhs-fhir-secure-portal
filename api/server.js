import express from "express";
import { DatabaseSync } from "node:sqlite";

const app = express();
const FHIR = "http://localhost:8080/fhir";
const db = new DatabaseSync("directory.db");

// INTENTIONALLY VULNERABLE (v1): no authentication, no ownership check (IDOR).
app.get("/api/patients/:id", async (req, res) => {
  try {
    const response = await fetch(`${FHIR}/Patient/${req.params.id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "FHIR server unreachable" });
  }
});

// INTENTIONALLY VULNERABLE (v1): SQL injection.
// User input is concatenated straight into the query string,
// and the error response leaks the query and database error.
app.get("/api/search", (req, res) => {
  const name = req.query.name || "";
  const sql =
    "SELECT fhir_id, full_name, postcode FROM patient_directory " +
    "WHERE full_name LIKE '%" + name + "%'";
  try {
    const rows = db.prepare(sql).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message, query: sql });
  }
});

app.listen(3000, "127.0.0.1", () => {
  console.log("API v1 (vulnerable) listening on http://localhost:3000");
});