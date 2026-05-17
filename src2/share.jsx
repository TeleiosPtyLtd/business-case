// Share modal — uploads the current model snapshot to a backend so it can be
// viewed at a password-protected URL. On first share, the server returns an
// owner token that the client persists; subsequent shares PUT updates to the
// same id using that token, so a model on disk stays tied to its live URL.
//
// The backend endpoint is read from window.CBAGENT_SHARE_ENDPOINT, falling
// back to a relative `/api/share` (works when the page is served from the
// same origin as the backend in `server/`).

const SHARE_ENDPOINT = (typeof window !== "undefined" && window.CBAGENT_SHARE_ENDPOINT)
  || "/api/share";

const __relativeTime = (iso) => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
};

const ShareModal = ({ snapshot, onClose, existingShare, onShareSaved }) => {
  const initialMode = existingShare ? "update" : "create";
  const [mode, setMode]         = React.useState(initialMode);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm]   = React.useState("");
  const [status, setStatus]     = React.useState("idle"); // idle | uploading | done | error
  const [shareUrl, setShareUrl] = React.useState(existingShare?.url || null);
  const [error, setError]       = React.useState(null);
  const [copied, setCopied]     = React.useState(false);
  const [justUpdatedAt, setJustUpdatedAt] = React.useState(null);

  const canCreate = password.length >= 4 && password === confirm && status !== "uploading";

  // First-time share OR explicit "share as new"
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
      // Hand the share record back to the app so it gets persisted to
      // localStorage. ownerToken is returned ONCE — losing it means the
      // user can never update this share again (admin path only).
      onShareSaved && onShareSaved({
        id: data.id,
        url,
        ownerToken: data.ownerToken,
        expiresAt: data.expiresAt,
        sharedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e.message || "Upload failed");
      setStatus("error");
    }
  };

  // Push an update to an existing share using the stored ownerToken.
  const update = async () => {
    if (!existingShare?.ownerToken) {
      setError("No owner token stored. Use 'Share as new' instead.");
      setStatus("error");
      return;
    }
    setStatus("uploading");
    setError(null);
    try {
      const baseUrl = SHARE_ENDPOINT.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/${encodeURIComponent(existingShare.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerToken: existingShare.ownerToken, snapshot }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
      }
      const data = await res.json();
      const updatedAt = data.lastEditedAt || new Date().toISOString();
      setJustUpdatedAt(updatedAt);
      setStatus("idle"); // stay in update view; show the timestamp shifted
      onShareSaved && onShareSaved({
        ...existingShare,
        url: data.url || existingShare.url,
        expiresAt: data.expiresAt || existingShare.expiresAt,
        lastUpdatedAt: updatedAt,
      });
    } catch (e) {
      setError(e.message || "Update failed");
      setStatus("error");
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch {}
  };

  // -- Render: three states --
  //   create        - first-time share (or "share as new" mode)
  //   update        - existing share is loaded, show URL + Update button
  //   done (create) - just created, show URL + copy
  const isUpdating = mode === "update" && existingShare;
  const justCreated = status === "done" && shareUrl && mode === "create";

  return (
    <Modal title={isUpdating ? "Update shared business case" : "Share business case"} onClose={onClose} width={520}>
      {justCreated && (
        <div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
            Your business case is uploaded. Anyone with the link and password can view it.
            Subsequent clicks of <strong>Share</strong> will update this same link.
          </div>
          <UrlBar url={shareUrl} onCopy={copy} copied={copied} />
          <div style={{ color: "var(--muted-2)", fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
            Password: viewers will be prompted on first load. The password is stored hashed on the backend.
            An owner token has been saved locally so you can push updates from this device.
          </div>
        </div>
      )}

      {isUpdating && status !== "uploading" && (
        <div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}>
            This model is already shared. Click <strong>Update share</strong> to push the
            current state to the same URL. Viewers' bookmarks and passwords keep working.
          </div>
          <UrlBar url={existingShare.url} onCopy={copy} copied={copied} />
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "var(--surface-2)", border: "1px solid var(--line)",
            fontSize: 12, color: "var(--muted)",
          }}>
            <div>First shared: {__relativeTime(existingShare.sharedAt) || "—"}</div>
            <div>Last updated: {__relativeTime(justUpdatedAt || existingShare.lastUpdatedAt) || "—"}</div>
            {existingShare.expiresAt && (
              <div>Expires: {new Date(existingShare.expiresAt).toLocaleDateString()}</div>
            )}
          </div>
          {error && <ErrorBox text={error} />}
          {justUpdatedAt && !error && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 8,
              background: "color-mix(in srgb, var(--green) 12%, transparent)",
              color: "var(--green-deep)", fontSize: 12.5,
            }}>Updated.</div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <button onClick={() => { setMode("create"); setError(null); }} style={ghostBtnStyle}>
              Share as new (new URL)
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={secondaryBtnStyle}>Close</button>
              <button onClick={update} style={primaryBtnStyle(true)}>Update share</button>
            </div>
          </div>
        </div>
      )}

      {isUpdating && status === "uploading" && (
        <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
          Updating…
        </div>
      )}

      {(!isUpdating && !justCreated) && (
        <div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}>
            {existingShare
              ? "Create a new share with its own URL. The existing share won't be affected."
              : "Upload a snapshot of this business case to a hosted viewer. Choose a password — viewers will need it to open the link."}
          </div>
          {existingShare && (
            <div style={{
              marginBottom: 14, padding: "8px 12px", borderRadius: 8,
              background: "var(--surface-2)", border: "1px solid var(--line)",
              fontSize: 11.5, color: "var(--muted)",
            }}>
              Existing share will remain at <span style={{ fontFamily: "var(--mono)" }}>{existingShare.url}</span>.{" "}
              <button onClick={() => setMode("update")} style={{
                background: "none", border: "none", color: "var(--ink)", textDecoration: "underline",
                padding: 0, fontSize: 11.5, cursor: "pointer",
              }}>Update it instead</button>.
            </div>
          )}

          <Field label="Password">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="At least 4 characters" autoFocus style={inputStyle} />
          </Field>
          <Field label="Confirm password">
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              style={inputStyle} />
          </Field>

          {error && <ErrorBox text={error} />}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
            <button onClick={upload} disabled={!canCreate} style={primaryBtnStyle(canCreate)}>
              {status === "uploading" ? "Uploading…" : "Upload"}
            </button>
          </div>

          <div style={{
            marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--line)",
            fontSize: 11.5, color: "var(--muted-2)", lineHeight: 1.5,
          }}>
            Endpoint: <span style={{ fontFamily: "var(--mono)" }}>{SHARE_ENDPOINT}</span>.
            Configure via <code style={{ fontFamily: "var(--mono)" }}>window.CBAGENT_SHARE_ENDPOINT</code>.
          </div>
        </div>
      )}
    </Modal>
  );
};

const UrlBar = ({ url, onCopy, copied }) => (
  <div style={{
    border: "1px solid var(--line-strong)", borderRadius: 10,
    padding: "10px 12px", background: "var(--surface-2)",
    display: "flex", alignItems: "center", gap: 8,
  }}>
    <span style={{
      flex: 1, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)",
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>{url}</span>
    <button onClick={onCopy} style={{
      border: "1px solid var(--line-strong)", borderRadius: 8,
      background: "var(--surface)", padding: "6px 10px",
      fontSize: 12, fontWeight: 500, cursor: "pointer",
    }}>{copied ? "Copied" : "Copy"}</button>
  </div>
);

const ErrorBox = ({ text }) => (
  <div style={{
    marginTop: 12, padding: "10px 12px", borderRadius: 8,
    background: "color-mix(in srgb, var(--red-deep) 12%, transparent)",
    color: "var(--red-deep)", fontSize: 12.5,
  }}>{text}</div>
);

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
  outline: "none", boxSizing: "border-box",
};
const secondaryBtnStyle = {
  border: "1px solid var(--line-strong)", background: "var(--surface)",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, cursor: "pointer",
};
const ghostBtnStyle = {
  border: "none", background: "transparent", color: "var(--muted)",
  fontSize: 12, cursor: "pointer", padding: "6px 0", textDecoration: "underline",
};
const primaryBtnStyle = (enabled) => ({
  border: "1px solid var(--ink)",
  background: enabled ? "var(--ink)" : "var(--line-strong)",
  color: enabled ? "var(--bg)" : "var(--muted-2)",
  padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500,
  cursor: enabled ? "pointer" : "not-allowed",
});

// Build a self-contained snapshot of the current model. The snapshot is what
// gets uploaded to the backend and replayed on the viewer side.
const buildSnapshot = ({ items, assumptionsEff, overrides }) => ({
  version: 1,
  generatedAt: new Date().toISOString(),
  meta: window.PROJECT_META,
  horizon: window.HORIZON,
  // Serialize each item with a formula STRING so the viewer can recompile.
  // Order of preference for the formula source:
  //   1. item._grossSrc  - wizard-created or rehydrated items already have this
  //   2. PROJECT_CONFIG.items[i].gross when it's already a string
  //   3. last resort: evaluate the compiled function with an empty A (returns 0
  //      or a constant; not ideal — surfaces as a near-zero value for items
  //      whose source string was lost)
  items: items.map(it => {
    const src = (window.PROJECT_CONFIG.items || []).find(s => s.id === it.id);
    const grossStr = it._grossSrc
      || (src && (typeof src.gross === "string" || typeof src.gross === "number") ? String(src.gross) : null)
      || (typeof it.gross === "function" ? it.gross({}) : it.gross);
    return { ...it, color: undefined, gross: grossStr };
  }),
  assumptions: assumptionsEff.map(a => ({ ...a, modified: undefined })),
  // Baseline equations (the "These imply: revenue = proposals × win-rate
  // × fee" block under Now) live on PROJECT_CONFIG.baseline as formula
  // STRINGS — copy them through verbatim so the viewer can recompile.
  // Without this the recipient sees no Now-section equation and the
  // "Let's proceed" button falls back to its standalone placement.
  baseline: (window.PROJECT_CONFIG && window.PROJECT_CONFIG.baseline) || [],
  overrides,
});

Object.assign(window, { ShareModal, buildSnapshot });
