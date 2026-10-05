import express from "express";

const app = express();
const FHIR = "http://localhost:8080/fhir";

// INTENTIONALLY VULNERABLE (v1): no authentication, no ownership check.
// Any caller can read any patient just by changing the ID in the URL.
app.get("/api/patients/:id", async (req, res) => {
  try {
    const response = await fetch(`${FHIR}/Patient/${req.params.id}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "FHIR server unreachable" });
  }
});

app.listen(3000, "127.0.0.1", () => {
  console.log("API v1 (vulnerable) listening on http://localhost:3000");
});