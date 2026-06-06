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
const AUTH_URL = (typeof window !== "undefined" && window.CBAGENT_AUTH_URL)
  || "https://auth.teleios.au";

// ---------- Teleios session (popup handshake) ----------
//
// The studio runs on localhost, but production Clerk can't run on a
// localhost origin. So instead of loading Clerk.js here, we open a popup
// to the platform identity host (auth.teleios.au/cli/login), which runs
// Clerk on a real teleios.au domain, signs the user in, then redirects
// back to {origin}/oauth-callback.html with a token. That callback page
// postMessages the token to us. Same handshake the `teleios` CLI uses, so
// the token is a production JWT the models.teleios.au backend can verify.
//
// The token is a Clerk session JWT (short-lived). We stamp it with the
// time we received it; if it's stale when we need it, we transparently
// re-run the popup — which completes silently if the Clerk session on
// teleios.au is still alive (no second sign-in prompt).

const SESSION_KEY = "teleios_session_v1";
const TOKEN_FRESH_MS = 50 * 1000; // Clerk session tokens last ~60s

const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
};
const writeSession = (s) => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
};
const clearStoredSession = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
};

// Opens the sign-in popup and resolves with { token, userId, email, ts }.
// MUST be called from within a user gesture (click handler) or the popup
// is blocked. Rejects on cancel/close/blocked.
const popupSignIn = () => new Promise((resolve, reject) => {
  const cb  = `${location.origin}/oauth-callback.html`;
  const url = `${AUTH_URL.replace(/\/$/, "")}/cli/login?cb=${encodeURIComponent(cb)}`;
  const popup = window.open(url, "teleios-signin",
    "width=480,height=720,menubar=no,toolbar=no,location=no,status=no");
  if (!popup) return reject(new Error("Popup blocked — allow popups for this site to sign in."));

  let settled = false;
  const cleanup = () => {
    settled = true;
    window.removeEventListener("message", onMessage);
    clearInterval(poll);
  };
  const onMessage = (e) => {
    // The callback page runs on our own origin and posts back to us.
    if (e.origin !== location.origin) return;
    const d = e.data || {};
    if (d.type !== "teleios-auth") return;
    cleanup();
    try { popup.close(); } catch {}
    if (!d.token || !d.userId) return reject(new Error("Sign-in returned no token."));
    resolve({ token: d.token, userId: d.userId, email: d.email || null, ts: Date.now() });
  };
  window.addEventListener("message", onMessage);
  // Detect a user closing the popup before completing.
  const poll = setInterval(() => {
    if (settled) return;
    if (popup.closed) { cleanup(); reject(new Error("Sign-in window closed.")); }
  }, 500);
});

// React hook exposing the current session + sign in/out + a token getter
// that guarantees freshness. `user` is null when signed out.
//
// Two backends, picked by environment:
//   • Hosted teleios.au pages (the dashboard, the hosted editor) load
//     Clerk natively as window.Clerk — production Clerk runs fine on a real
//     teleios.au origin. We use it directly: no popup, tokens straight from
//     Clerk.session.getToken().
//   • The localhost studio has no native Clerk (it can't — Clerk rejects
//     localhost origins), so it falls back to the popup + localStorage
//     handshake against auth.teleios.au.
// window.Clerk presence is fixed for a page's lifetime, so the hooks below
// run consistently every render.
const useTeleiosSession = () => {
  const nativeClerk = (typeof window !== "undefined" && window.Clerk) || null;

  // Popup-model state (localhost studio).
  const [session, setSession] = React.useState(() => readSession());
  // Native-Clerk re-render tick (fires on sign in/out/token refresh).
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    if (!nativeClerk || !nativeClerk.addListener) return;
    const unsub = nativeClerk.addListener(() => forceTick(t => t + 1));
    return () => { unsub && unsub(); };
  }, [nativeClerk]);

  const signInPopup = React.useCallback(async () => {
    const s = await popupSignIn(); writeSession(s); setSession(s); return s;
  }, []);
  const signOutPopup = React.useCallback(() => {
    clearStoredSession(); setSession(null);
  }, []);
  const getFreshPopup = React.useCallback(async () => {
    const cur = readSession();
    if (cur && Date.now() - cur.ts < TOKEN_FRESH_MS) return cur.token;
    if (!cur) return null; // never signed in → caller shares anonymously
    const s = await popupSignIn(); writeSession(s); setSession(s); return s.token;
  }, []);

  if (nativeClerk) {
    const u = nativeClerk.user;
    return {
      user: u
        ? { email: (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || u.username || null, userId: u.id }
        : null,
      signIn:  async () => { if (nativeClerk.openSignIn) nativeClerk.openSignIn({}); },
      signOut: () => { try { nativeClerk.signOut(); } catch {} },
      getFreshToken: async () => {
        try { return nativeClerk.session ? await nativeClerk.session.getToken() : null; }
        catch { return null; }
      },
    };
  }
  return {
    user: session ? { email: session.email, userId: session.userId } : null,
    signIn:  signInPopup,
    signOut: signOutPopup,
    getFreshToken: getFreshPopup,
  };
};

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

const ShareModal = ({ snapshot, onClose, existingShare: existingShareProp, onShareSaved }) => {
  // Ignore a stored share whose URL lives on a different origin than the
  // current endpoint. This happens after the endpoint changes (e.g. an old
  // localhost test share when we now publish to models.teleios.au): that URL
  // is dead, so don't offer to "update" it — start a fresh share instead.
  // The next successful share overwrites the stale record via onShareSaved.
  const existingShare = (() => {
    if (!existingShareProp || !existingShareProp.url) return null;
    let endpointOrigin;
    try { endpointOrigin = new URL(SHARE_ENDPOINT, location.href).origin; }
    catch { return existingShareProp; }
    try { return new URL(existingShareProp.url).origin === endpointOrigin ? existingShareProp : null; }
    catch { return null; }
  })();

  const initialMode = existingShare ? "update" : "create";
  const [mode, setMode]         = React.useState(initialMode);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm]   = React.useState("");
  // Optional portfolio tags (comma-separated). Sent on create; the server
  // normalises. Edit them anytime from your dashboard at /mine.
  const [tagsInput, setTagsInput] = React.useState("");
  const [status, setStatus]     = React.useState("idle"); // idle | uploading | done | error
  const [shareUrl, setShareUrl] = React.useState(existingShare?.url || null);
  const [error, setError]       = React.useState(null);
  const [copied, setCopied]     = React.useState(false);
  const [justUpdatedAt, setJustUpdatedAt] = React.useState(null);
  // Owner-only stats fetched from /api/share/:id/meta — viewer count,
  // last-seen, subscriber count. Null until the fetch resolves; stays
  // null on legacy shares whose server doesn't expose the endpoint, in
  // which case the dialog quietly falls back to the basic meta block.
  const [meta, setMeta] = React.useState(null);

  const session = useTeleiosSession();

  // Two-step create flow: choose identity (gate) → set the password (form).
  // Authors already signed in skip the gate. `authChoice` records the pick
  // so upload() knows whether to attach a bearer token.
  const [authChoice, setAuthChoice] = React.useState(session.user ? "account" : null);
  const [step, setStep]             = React.useState(session.user ? "form" : "gate");
  const [signingIn, setSigningIn]   = React.useState(false);
  // Set when the user chose "account" but the server didn't attribute the
  // share (token expired / rejected) — the share still succeeds, anonymously.
  const [attribWarning, setAttribWarning] = React.useState(false);

  // Change-viewer-password sub-flow (update mode only).
  const [pwOpen, setPwOpen]         = React.useState(false);
  const [newPw, setNewPw]           = React.useState("");
  const [newPwConfirm, setNewPwConf]= React.useState("");
  const [pwStatus, setPwStatus]     = React.useState("idle"); // idle | saving | done | error
  const [pwError, setPwError]       = React.useState(null);

  const canCreate = password.length >= 4 && password === confirm && status !== "uploading";
  const canChangePw = newPw.length >= 4 && newPw === newPwConfirm && pwStatus !== "saving";

  // Pull the stats block whenever the modal opens in update mode and
  // again after a successful update (so freshly-edited timestamps
  // reflect immediately). Skips silently if the legacy share doesn't
  // have an ownerToken stored locally.
  React.useEffect(() => {
    if (mode !== "update" || !existingShare?.id || !existingShare?.ownerToken) return;
    const baseUrl = SHARE_ENDPOINT.replace(/\/$/, "");
    const url = `${baseUrl}/${encodeURIComponent(existingShare.id)}/meta`;
    let cancelled = false;
    fetch(url, { headers: { "Authorization": `Bearer ${existingShare.ownerToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setMeta(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode, existingShare?.id, existingShare?.ownerToken, justUpdatedAt]);

  // --- Gate actions (create flow, step 1) ---
  const gateSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await session.signIn();      // opens popup → resolves with a token
      setAuthChoice("account");
      setStep("form");
    } catch (e) {
      setError(e.message || "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  };
  const gateAnon = () => {
    setAuthChoice("anon");
    setError(null);
    setStep("form");
  };
  const switchAccount = () => {
    session.signOut();
    setAuthChoice(null);
    setStep("gate");
  };

  // First-time share OR explicit "share as new"
  const upload = async () => {
    setStatus("uploading");
    setError(null);
    setAttribWarning(false);
    try {
      // Attach a bearer token only when the author chose to sign in.
      // getFreshToken() re-runs the popup if the stored token went stale;
      // it stays within this click's user gesture (no awaits precede it).
      let authHeader = {};
      if (authChoice === "account") {
        try {
          const token = await session.getFreshToken();
          if (token) authHeader = { "Authorization": `Bearer ${token}` };
          else setAttribWarning(true);
        } catch { setAttribWarning(true); }
      }
      const res = await fetch(SHARE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ password, snapshot, tags: tagsInput }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
      }
      const data = await res.json();
      // Signed in but the server didn't attribute it → token was rejected.
      if (authChoice === "account" && !data.authorUserId) setAttribWarning(true);
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

  // Push an update to an existing share. Authorized by the stored owner
  // token, or — when there's none (e.g. the hosted editor) — by the
  // signed-in account via ownerAuth's JWT fallback.
  const update = async () => {
    if (!existingShare?.ownerToken && !session.user) {
      setError("No owner token stored, and not signed in. Use 'Share as new' instead.");
      setStatus("error");
      return;
    }
    setStatus("uploading");
    setError(null);
    try {
      const baseUrl = SHARE_ENDPOINT.replace(/\/$/, "");
      const { authHeader, body } = await ownerAuth({ snapshot });
      const res = await fetch(`${baseUrl}/${encodeURIComponent(existingShare.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(body),
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

  // Auth for owner-only operations (update / change password). The owner
  // token alone authorizes, so prefer it — no sign-in popup. Only when
  // there's no owner token (a share owned purely via account) do we fetch a
  // fresh JWT, which may briefly pop the sign-in window.
  const ownerAuth = async (extraBody = {}) => {
    if (existingShare?.ownerToken) {
      return { authHeader: {}, body: { ...extraBody, ownerToken: existingShare.ownerToken } };
    }
    let authHeader = {};
    if (session.user) {
      try { const t = await session.getFreshToken(); if (t) authHeader = { "Authorization": `Bearer ${t}` }; }
      catch {}
    }
    return { authHeader, body: { ...extraBody } };
  };

  // Rotate the viewer password on an existing share. Owner-only — uses the
  // stored owner token, falling back to the signed-in session.
  const changePassword = async () => {
    if (!canChangePw) return;
    setPwStatus("saving");
    setPwError(null);
    try {
      const baseUrl = SHARE_ENDPOINT.replace(/\/$/, "");
      const { authHeader, body } = await ownerAuth({ newPassword: newPw });
      const res = await fetch(`${baseUrl}/${encodeURIComponent(existingShare.id)}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
      }
      setPwStatus("done");
      setNewPw(""); setNewPwConf("");
    } catch (e) {
      setPwError(e.message || "Couldn't change the password");
      setPwStatus("error");
    }
  };

  // -- Render states --
  //   create/gate   - step 1: sign in to keep track, or continue without
  //   create/form   - step 2: choose a password, upload
  //   update        - existing share is loaded, show URL + Update button
  //   done (create) - just created, show URL + copy
  const isUpdating = mode === "update" && existingShare;
  const justCreated = status === "done" && shareUrl && mode === "create";
  const showGate = !isUpdating && !justCreated && step === "gate";
  const showForm = !isUpdating && !justCreated && step === "form";

  return (
    <Modal title={isUpdating ? "Update shared business case" : "Share business case"} onClose={onClose} width={520}>
      {justCreated && (
        <div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
            Your business case is uploaded. Anyone with the link and password can view it.
            Subsequent clicks of <strong>Share</strong> will update this same link.
          </div>
          <UrlBar url={shareUrl} onCopy={copy} copied={copied} />
          {attribWarning ? (
            <div style={{ color: "var(--muted-2)", fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              Saved with an owner token on this device — but we couldn't link it to your
              account (your sign-in expired). It won't appear in your dashboard.
            </div>
          ) : authChoice === "account" ? (
            <div style={{ color: "var(--muted-2)", fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              Saved to your account — find it any time at{" "}
              <a href="https://models.teleios.au/mine" target="_blank" rel="noopener"
                 style={{ color: "var(--muted)" }}>your dashboard</a>.
            </div>
          ) : (
            <div style={{ color: "var(--muted-2)", fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              Password: viewers will be prompted on first load. An owner token has been saved
              locally so you can push updates from this device — keep this device, or the link is lost.
            </div>
          )}
        </div>
      )}

      {showGate && (
        <GateStep
          signingIn={signingIn}
          error={error}
          onSignIn={gateSignIn}
          onAnon={gateAnon}
        />
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
            {meta && (
              <div style={{
                marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)",
              }}>
                <div>
                  {meta.viewerCount === 0
                    ? "Not opened yet"
                    : `Opened by ${meta.viewerCount} ${meta.viewerCount === 1 ? "person" : "people"}`}
                  {meta.lastViewedAt && (
                    <span style={{ color: "var(--muted-2)" }}>
                      {" · most recent "}{__relativeTime(meta.lastViewedAt)}
                    </span>
                  )}
                </div>
                <div>
                  {meta.subscriberCount === 0
                    ? "No subscribers yet"
                    : `${meta.subscriberCount} ${meta.subscriberCount === 1 ? "subscriber" : "subscribers"} will be emailed on update`}
                </div>
              </div>
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

          {/* Change viewer password — collapsed by default */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--line)" }}>
            {!pwOpen ? (
              <button
                onClick={() => { setPwOpen(true); setPwStatus("idle"); setPwError(null); }}
                style={ghostBtnStyle}
              >Change viewer password</button>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>
                  Set a new password for viewers. The current password stops working
                  immediately — anyone you've already shared the link with will need the new one.
                </div>
                <Field label="New password">
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                    placeholder="At least 4 characters" autoFocus style={inputStyle} />
                </Field>
                <Field label="Confirm new password">
                  <input type="password" value={newPwConfirm} onChange={e => setNewPwConf(e.target.value)}
                    style={inputStyle} />
                </Field>
                {pwError && <ErrorBox text={pwError} />}
                {pwStatus === "done" && (
                  <div style={{
                    marginTop: 8, padding: "8px 12px", borderRadius: 8,
                    background: "color-mix(in srgb, var(--green) 12%, transparent)",
                    color: "var(--green-deep)", fontSize: 12.5,
                  }}>Password changed. Viewers will need the new one.</div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setPwOpen(false); setNewPw(""); setNewPwConf(""); setPwError(null); setPwStatus("idle"); }}
                    style={secondaryBtnStyle}>Cancel</button>
                  <button onClick={changePassword} disabled={!canChangePw} style={primaryBtnStyle(canChangePw)}>
                    {pwStatus === "saving" ? "Saving…" : "Set new password"}
                  </button>
                </div>
              </div>
            )}
          </div>

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

      {showForm && (
        <div>
          <AuthBanner choice={authChoice} email={session.user?.email} onSwitch={switchAccount} />

          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}>
            {existingShare
              ? "Create a new share with its own URL. The existing share won't be affected."
              : "Choose a password — viewers will need it to open the link."}
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
          <Field label="Tags — optional">
            <input type="text" value={tagsInput} onChange={e => setTagsInput(e.target.value)}
              placeholder="client:acme, pricing, q3   (comma-separated)" style={inputStyle} />
            <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 5, lineHeight: 1.45 }}>
              Organise your portfolio. Filter by these in your dashboard. Edit anytime.
            </div>
          </Field>

          {error && <ErrorBox text={error} />}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <button onClick={() => { setStep("gate"); setError(null); }} style={ghostBtnStyle}>
              ← Back
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={upload} disabled={!canCreate} style={primaryBtnStyle(canCreate)}>
                {status === "uploading" ? "Uploading…" : "Share"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

// AuthBanner — slim status line at the top of the password step, reflecting
// the choice made on the gate.
const AuthBanner = ({ choice, email, onSwitch }) => {
  if (choice === "account") {
    return (
      <div style={{
        marginBottom: 14, padding: "9px 12px", borderRadius: 10,
        background: "color-mix(in srgb, var(--green) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--green) 30%, transparent)",
        fontSize: 12, color: "var(--green-deep)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <span>Signed in{email ? <> as <strong style={{ fontWeight: 600 }}>{email}</strong></> : null} · this case will be saved to your dashboard.</span>
        <button onClick={onSwitch} style={{
          border: "none", background: "transparent", color: "var(--green-deep)",
          fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline", whiteSpace: "nowrap",
        }}>Not you?</button>
      </div>
    );
  }
  return (
    <div style={{
      marginBottom: 14, padding: "9px 12px", borderRadius: 10,
      background: "var(--surface-2)", border: "1px solid var(--line)",
      fontSize: 12, color: "var(--muted)",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <span>Sharing without an account — keep the link &amp; password safe, this case won't be in any dashboard.</span>
      <button onClick={onSwitch} style={{
        border: "none", background: "transparent", color: "var(--ink)",
        fontSize: 11, cursor: "pointer", padding: 0, textDecoration: "underline", whiteSpace: "nowrap",
      }}>Sign in</button>
    </div>
  );
};

// GateStep — step 1 of the create flow. The identity choice, before the
// password. Primary call to action is to sign in (so the case is tracked);
// a faint escape hatch shares anonymously with a clear warning.
const GateStep = ({ signingIn, error, onSignIn, onAnon }) => (
  <div style={{ padding: "8px 0 4px" }}>
    <div style={{
      fontFamily: "var(--serif)", fontWeight: 500, fontSize: 21, lineHeight: 1.2,
      color: "var(--ink)", marginBottom: 10,
    }}>
      Sign in to keep track of this case
    </div>
    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20, lineHeight: 1.55 }}>
      Sign in and this case is saved to your account — you can find it, update it,
      and re-share it from anywhere. Takes a few seconds.
    </div>

    <button
      onClick={onSignIn}
      disabled={signingIn}
      style={{
        width: "100%", border: "1px solid var(--ink)",
        background: signingIn ? "var(--line-strong)" : "var(--ink)",
        color: signingIn ? "var(--muted-2)" : "var(--bg)",
        padding: "11px 16px", borderRadius: 999, fontSize: 13.5, fontWeight: 600,
        cursor: signingIn ? "wait" : "pointer",
      }}
    >
      {signingIn ? "Waiting for sign-in…" : "Sign in to share this case"}
    </button>

    {error && <ErrorBox text={error} />}

    <div style={{ textAlign: "center", marginTop: 16 }}>
      <button
        onClick={onAnon}
        disabled={signingIn}
        style={{
          border: "none", background: "transparent", color: "var(--muted-2)",
          fontSize: 11.5, cursor: signingIn ? "default" : "pointer", padding: "4px 0",
          textDecoration: "underline", lineHeight: 1.5,
        }}
      >
        Continue without signing in <span style={{ color: "var(--red-deep)" }}>(this case could be lost)</span>
      </button>
    </div>
  </div>
);

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
const buildSnapshot = ({ items, assumptionsEff, overrides }) => {
  // Precompute a headline so the /mine portfolio dashboard can show & sort by
  // net value without re-running the engine server-side. Best-effort; the
  // viewer ignores it and recomputes from items/assumptions.
  let headline = null;
  try {
    const A = {};
    for (const a of assumptionsEff) A[a.id] = a.value;
    const m = computeModel(items, A);
    const pay = (typeof computePayback === "function") ? computePayback(items, A) : null;
    // Benefit split: scope-1 = primary (the load-bearing case); scope 2/3 =
    // bonus upside. Mirrors the page's "net benefit uses scope-1 only" framing.
    let primaryBenefit = 0, bonusBenefits = 0;
    for (const it of items) {
      if (it.kind === "cost") continue;
      const t = (m.perItem[it.id] && m.perItem[it.id].total) || 0;
      const sc = [1, 2, 3].includes(it.scope) ? it.scope : 1;
      if (sc === 1) primaryBenefit += t; else bonusBenefits += t;
    }
    // Risk exposure + counts come from the single risk reducer (computeRiskModel)
    // so the fingerprint, the case page, and the dashboard can't disagree.
    // `risk` (exposure) is byte-identical to the old headline.risk shape;
    // `riskCounts` (assessed/critical) renders even when exposure is null.
    let risk = null, riskCounts = null;
    const cfg = (typeof window !== "undefined" && window.PROJECT_CONFIG) || {};
    if (typeof computeRiskModel === "function" && Array.isArray(cfg.risks) && cfg.risks.length) {
      try {
        const rm = computeRiskModel(items, assumptionsEff, A, cfg.risks);
        risk = rm.exposure;
        riskCounts = { assessed: rm.counts.assessed, critical: rm.counts.critical };
      } catch (e2) { /* best-effort */ }
    }
    headline = {
      net: m.net, totalBenefits: m.totalBenefits, totalCosts: m.totalCosts,
      primaryBenefit, bonusBenefits,
      bcr: m.totalCosts > 0 ? m.totalBenefits / m.totalCosts : null,
      paybackPeriod: pay ? pay.paybackPeriod : null,
      risk, riskCounts,
      horizon: window.HORIZON, granularity: window.GRANULARITY || "year",
    };
  } catch (e) { /* headline is best-effort */ }
  return {
  version: 1,
  generatedAt: new Date().toISOString(),
  meta: window.PROJECT_META,
  granularity: window.GRANULARITY || "year",
  horizon: window.HORIZON,
  headline,
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
  // Snapshot carries the LEAN risk shape only. The Risk Event Card body
  // (outcomes/signposts/owner/likelihood) stays author-side in project.config.js
  // and never crosses the wire — keeps the buyer view title-only by construction
  // (no viewer-flag gating, which CLAUDE.md forbids). source/category/guideword
  // DO ship (the fingerprint + author-mode badges need them).
  risks: (Array.isArray(window.PROJECT_CONFIG && window.PROJECT_CONFIG.risks) ? window.PROJECT_CONFIG.risks : [])
    .filter(r => r && r.title && r.threatens && r.noMaterialRisk !== true)
    .map(r => ({
      title: r.title, threatens: r.threatens, locus: r.locus, source: r.source,
      category: r.category, guideword: r.guideword,
      // `likelihood` (the 1–5 rating) persists so assessed/critical survive a
      // re-save and round-trip into the editor. It's a bare number, not shown
      // on the title-only buyer page — outcomes/signposts/owner/likelihoodPrior
      // remain author-side (stripped).
      ...(typeof r.likelihood === "number" ? { likelihood: r.likelihood } : {}),
      ...(Array.isArray(r.threatensAlso) && r.threatensAlso.length ? { threatensAlso: r.threatensAlso } : {}),
    })),
  overrides,
  };
};

Object.assign(window, { ShareModal, buildSnapshot, useTeleiosSession });
