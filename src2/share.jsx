// Share modal — uploads the current model snapshot to a backend so it can be
// viewed at a password-protected URL.
//
// The backend endpoint is read from window.RESCHEMATIC_SHARE_ENDPOINT, falling
// back to a relative `/api/share` (works when the page is served from the
// same origin as the backend in `server/`).

const SHARE_ENDPOINT = (typeof window !== "undefined" && window.RESCHEMATIC_SHARE_ENDPOINT)
  || "/api/share";

const ShareModal = ({ snapshot, onClose }) => {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm]   = React.useState("");
  const [status, setStatus]     = React.useState("idle"); // idle | uploading | done | error
  const [shareUrl, setShareUrl] = React.useState(null);
  const [error, setError]       = React.useState(null);
  const [copied, setCopied]     = React.useState(false);

  const canSubmit = password.length >= 4 && password === confirm && status !== "uploading";

  const upload = async () => {
    setStatus("uploading");
    setError(null);
    try {
      const res = await fetch(SHARE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, snapshot }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
      }
      const data = await res.json();
      const url = data.url || `${window.location.origin}/view/${data.id}`;
      setShareUrl(url);
      setStatus("done");
    } catch (e) {
      setError(e.message || "Upload failed");
      setStatus("error");
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch {}
  };

  return (
    <Modal title="Share business case" onClose={onClose} width={520}>
      {status === "done" && shareUrl ? (
        <div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
            Your business case is uploaded. Anyone with the link and password can view it.
          </div>
          <div style={{
            border: "1px solid var(--line-strong)", borderRadius: 10,
            padding: "10px 12px", background: "var(--surface-2)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              flex: 1, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{shareUrl}</span>
            <button onClick={copy} style={{
              border: "1px solid var(--line-strong)", borderRadius: 8,
              background: "var(--surface)", padding: "6px 10px",
              fontSize: 12, fontWeight: 500,
            }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <div style={{ color: "var(--muted-2)", fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
            Password: viewers will be prompted on first load. The password is stored hashed on the backend.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}>
            Upload a snapshot of this business case to a hosted viewer. Choose a
            password — viewers will need it to open the link.
          </div>

          <Field label="Password">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="At least 4 characters" autoFocus
              style={inputStyle} />
          </Field>
          <Field label="Confirm password">
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              style={inputStyle} />
          </Field>

          {error && (
            <div style={{
              marginTop: 12, padding: "10px 12px", borderRadius: 8,
              background: "color-mix(in srgb, var(--red-deep) 12%, transparent)",
              color: "var(--red-deep)", fontSize: 12.5,
            }}>{error}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button onClick={onClose} style={{
              border: "1px solid var(--line-strong)", background: "var(--surface)",
              padding: "9px 16px", borderRadius: 999, fontSize: 13,
            }}>Cancel</button>
            <button onClick={upload} disabled={!canSubmit} style={{
              border: "1px solid var(--ink)",
              background: canSubmit ? "var(--ink)" : "var(--line-strong)",
              color: canSubmit ? "var(--bg)" : "var(--muted-2)",
              padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}>{status === "uploading" ? "Uploading…" : "Upload"}</button>
          </div>

          <div style={{
            marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--line)",
            fontSize: 11.5, color: "var(--muted-2)", lineHeight: 1.5,
          }}>
            Endpoint: <span style={{ fontFamily: "var(--mono)" }}>{SHARE_ENDPOINT}</span>.
            Configure via <code style={{ fontFamily: "var(--mono)" }}>window.RESCHEMATIC_SHARE_ENDPOINT</code>.
          </div>
        </div>
      )}
    </Modal>
  );
};

const Field = ({ label, children }) => (
  <label style={{ display: "block", marginBottom: 12 }}>
    <div style={{
      fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
      color: "var(--eyebrow)", fontWeight: 500, marginBottom: 6,
    }}>{label}</div>
    {children}
  </label>
);

const inputStyle = {
  width: "100%", border: "1px solid var(--line-strong)", borderRadius: 10,
  background: "var(--surface-2)", padding: "10px 12px",
  fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink)",
  outline: "none",
};

// Build a self-contained snapshot of the current model. The snapshot is what
// gets uploaded to the backend and replayed on the viewer side.
const buildSnapshot = ({ scenario, items, assumptionsEff, overrides, includeSoft }) => ({
  version: 1,
  generatedAt: new Date().toISOString(),
  meta: window.PROJECT_META,
  horizon: window.HORIZON,
  scenarios: window.SCENARIO_LABELS,
  scenarioOverrides: window.SCENARIO_OVERRIDES,
  scenarioCounterfactualShift: window.SCENARIO_COUNTERFACTUAL_SHIFT,
  defaultScenario: scenario,
  categoryColors: (window.PROJECT_CONFIG && window.PROJECT_CONFIG.categoryColors) || {},
  // Items are serialized with the original formula string from PROJECT_CONFIG so
  // the viewer can recompile them. Removable runtime additions are stored as
  // numeric `gross` values.
  items: items.map(it => {
    const src = (window.PROJECT_CONFIG.items || []).find(s => s.id === it.id);
    return {
      ...it,
      color: undefined,                     // re-derived from category on viewer
      gross: src ? src.gross
                 : (typeof it.gross === "function" ? it.gross({}) : it.gross),
    };
  }),
  assumptions: assumptionsEff.map(a => ({ ...a, modified: undefined })),
  overrides,
  includeSoft,
});

Object.assign(window, { ShareModal, buildSnapshot });
