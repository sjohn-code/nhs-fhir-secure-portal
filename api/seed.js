// Loads a small, fixed set of SYNTHETIC patients into the FHIR server.
// All data is fictional. Fixed IDs make access-control tests repeatable.
const FHIR = "http://localhost:8080/fhir";

const patients = [
  { id: "pat-001", given: "Alice", family: "Test", gender: "female", dob: "1990-01-01", hr: 72 },
  { id: "pat-002", given: "Bob", family: "Sample", gender: "male", dob: "1985-06-15", hr: 80 },
  { id: "pat-003", given: "Chitra", family: "Demo", gender: "female", dob: "1978-11-30", hr: 68 },
];

const entries = [];
for (const p of patients) {
  entries.push({
    resource: {
      resourceType: "Patient",
      id: p.id,
      name: [{ family: p.family, given: [p.given] }],
      gender: p.gender,
      birthDate: p.dob,
    },
    request: { method: "PUT", url: `Patient/${p.id}` },
  });
  entries.push({
    resource: {
      resourceType: "Observation",
      id: `obs-${p.id}`,
      status: "final",
      code: {
        coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }],
      },
      subject: { reference: `Patient/${p.id}` },
      effectiveDateTime: "2026-09-01T09:00:00Z",
      valueQuantity: { value: p.hr, unit: "beats/minute", system: "http://unitsofmeasure.org", code: "/min" },
    },
    request: { method: "PUT", url: `Observation/obs-${p.id}` },
  });
}

const bundle = { resourceType: "Bundle", type: "transaction", entry: entries };

const res = await fetch(FHIR, {
  method: "POST",
  headers: { "Content-Type": "application/fhir+json" },
  body: JSON.stringify(bundle),
});

console.log("Status:", res.status);
if (!res.ok) console.log(await res.text());