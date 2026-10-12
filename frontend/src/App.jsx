import { useEffect, useRef, useState } from "react";
import keycloak from "./keycloak";

// Every API call carries the access token. updateToken refreshes it if it is
// within 30 seconds of expiring.
async function api(path, options = {}) {
  await keycloak.updateToken(30);
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${keycloak.token}`,
    },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export default function App() {
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return; // React dev mode runs effects twice
    started.current = true;
    keycloak
      .init({ onLoad: "login-required", pkceMethod: "S256", checkLoginIframe: false })
      .then((authenticated) => {
        if (!authenticated) return;
        setReady(true);
        return api("/api/patients").then(setPatients);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const open = async (p) => {
    setSelected(p);
    setError("");
    try {
      setNotes(await api(`/api/patients/${p.id}/notes`));
    } catch (e) {
      setError(String(e));
    }
  };

  const addNote = async () => {
    try {
      await api(`/api/patients/${selected.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      setText("");
      open(selected);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!ready) return <p style={{ fontFamily: "sans-serif" }}>Redirecting to login...</p>;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 700, margin: "2rem auto", textAlign: "left" }}>
      <p>
        Signed in as <b>{keycloak.tokenParsed?.name}</b>{" "}
        <button onClick={() => keycloak.logout({ redirectUri: window.location.origin + "/" })}>
          Log out
        </button>
      </p>
      <h1>Patient Portal</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <h2>Your record</h2>
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
              <b>{n.author}:</b> {n.body}
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