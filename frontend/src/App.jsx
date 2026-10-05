import { useEffect, useState } from "react";

export default function App() {
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");

  useEffect(() => {
    fetch("/api/patients").then((r) => r.json()).then(setPatients);
  }, []);

  const open = async (p) => {
    setSelected(p);
    setNotes(await (await fetch(`/api/patients/${p.id}/notes`)).json());
  };

  const addNote = async () => {
    await fetch(`/api/patients/${selected.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author: "Dr Demo", body: text }),
    });
    setText("");
    open(selected);
  };

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 700, margin: "2rem auto", textAlign: "left" }}>
      <h1>Patient Portal (v1, intentionally vulnerable)</h1>
      <h2>Patients</h2>
      <ul>
        {patients.map((p) => (
          <li key={p.id}>
            <button onClick={() => open(p)}>{p.name}</button> ({p.id})
          </li>
        ))}
      </ul>

      {selected && (
        <>
          <h2>Notes for {selected.name}</h2>
          {notes.map((n) => (
            <div key={n.id} style={{ border: "1px solid #ccc", padding: 8, margin: 4 }}>
              <b>{n.author}:</b>{" "}
              {/* VULNERABLE: renders user-supplied text as raw HTML */}
              <span dangerouslySetInnerHTML={{ __html: n.body }} />
            </div>
          ))}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            style={{ width: "100%" }}
          />
          <button onClick={addNote}>Add note</button>
        </>
      )}
    </div>
  );
}