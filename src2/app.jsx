// App entry — wires assumptions, items, and tabs.
// PROJECT_META comes from src2/project.config.js via model.jsx.

// Per-URL localStorage key. Viewer mode uses the share id; author mode falls
// back to the project shortName so different local projects don't collide.
const STATE_KEY = (() => {
  const m = (window.location.pathname || "").match(/^\/view\/([^/]+)/);
  if (m) return `cbagent.state.view.${m[1]}`;
  const slug = (PROJECT_META.shortName || "default").replace(/[^A-Za-z0-9_-]/g, "_");
  return `cbagent.state.author.${slug}`;
})();

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.v === 1) return s;
  } catch {}
  return null;
}

// Items contain a compiled `gross` function which doesn't survive JSON.
// Strip it before storage; the source string lives in `_grossSrc`.
function serialiseItems(items) {
  return items.map(it => {
    const copy = { ...it };
    delete copy.gross;
    return copy;
  });
}
function rehydrateItems(serialised, assumptionIds) {
  return serialised.map(it => ({
    ...it,
    gross: compileFormula(it._grossSrc, assumptionIds),
  }));
}

// Reactive mobile detection via matchMedia. Threshold lines up with the
// stylesheet rules in index.html.
function useIsMobile(breakpointPx = 760) {
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia(`(max-width: ${breakpointPx}px)`).matches
  );
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", onChange);
      else mql.removeListener(onChange);
    };
  }, [breakpointPx]);
  return isMobile;
}

const App = () => {
  const isMobile = useIsMobile();
  const __snap = window.PROJECT_CONFIG || {};
  const __persisted = React.useMemo(loadPersistedState, []);

  const [theme, setTheme] = React.useState(() => __persisted?.theme || "light");
  React.useEffect(() => { document.body.dataset.theme = theme; }, [theme]);

  // Visual rounding layer — when on, fmtMoney runs every displayed value
  // through 1-2-2.5-5-10 "nice number" rounding. Calculations are
  // unaffected; this only re-skins the headline figures.
  const [niceRounding, setNiceRounding] = React.useState(() =>
    __persisted && typeof __persisted.niceRounding === "boolean"
      ? __persisted.niceRounding : true
  );
  // Sticky gate flag for the "you receive" section. Flips true the first
  // time the user has confirmed every top-N commitment in the landing
  // narrative. Once true, the Benefits / Costs / Total table is always
  // visible on subsequent visits — un-checking a commitment in the All
  // Assumptions grid doesn't re-hide the table.
  const [commitmentsConfirmed, setCommitmentsConfirmed] = React.useState(() =>
    !!(__persisted && __persisted.commitmentsConfirmed)
  );
  // Sticky flag — flips true when the buyer has finished confirming
  // every NOW input AND explicitly clicked "Let's proceed", hiding the
  // editor UI to give the rest of the proof room to breathe.
  const [worldProceedClicked, setWorldProceedClicked] = React.useState(() =>
    !!(__persisted && __persisted.worldProceedClicked)
  );
  // Toggles the full-grid assumptions editor that the popsicle tab opens.
  const [assumptionsGridOpen, setAssumptionsGridOpen] = React.useState(false);
  // Per-assumption confirmation state. Each id maps to true once the user
  // has explicitly checked-off that value (in the NOW row at the top of
  // the proof, or inside the all-assumptions grid). Persisted so
  // subsequent sessions remember which inputs the user has already
  // eyeballed.
  const [confirmedAssumptions, setConfirmedAssumptions] = React.useState(() =>
    (__persisted && __persisted.confirmedAssumptions) || {}
  );
  const markAssumptionConfirmed = React.useCallback((id, on = true) => {
    setConfirmedAssumptions(prev => {
      if (on && prev[id]) return prev;
      if (!on && !prev[id]) return prev;
      const next = { ...prev };
      if (on) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);
  // Mutate the global flag synchronously during render so all fmtMoney
  // calls in this render cycle pick up the new value.
  window.CBAGENT_ROUNDING = niceRounding;

  const [customAssumptions, setCustomAssumptions] = React.useState(() => __persisted?.customAssumptions || []);
  const __allAssumptionIds = React.useMemo(
    () => [...DEFAULT_ASSUMPTIONS.map(a => a.id), ...customAssumptions.map(a => a.id)],
    [customAssumptions]
  );
  const [items, setItems] = React.useState(() => {
    if (__persisted?.items) {
      try { return rehydrateItems(__persisted.items, __allAssumptionIds); }
      catch (e) { console.error("Failed to rehydrate items:", e); }
    }
    return DEFAULT_ITEMS;
  });
  const [tab, setTab] = React.useState(() => __persisted?.tab || "edit");
  // Toast for clipboard-prompt feedback when the user clicks Add benefit / Add cost.
  // We don't open a modal; we send the user to Claude Code via a copied prompt.
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(h);
  }, [toast]);

  // Send a freeform message to Claude Code. Native Channels first
  // (localhost:8788, spawned by `claude --dangerously-load-development-channels
  // server:cbagent`); clipboard if the channel isn't running.
  // Returns { ok, mode: "channel"|"clipboard"|"failed", chat_id? }.
  const submitToClaudeCode = React.useCallback(async (message, kind, chatId) => {
    try {
      const body = JSON.stringify({ prompt: message, kind, chat_id: chatId });
      const r = await fetch("http://localhost:8788/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        return { ok: true, mode: "channel", chat_id: data.chat_id || chatId };
      }
    } catch {/* fall through */}

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message);
        return { ok: true, mode: "clipboard" };
      } catch {/* fall through */}
    }
    console.log("[CBAgent prompt]\n" + message);
    return { ok: false, mode: "failed" };
  }, []);
  const [editingAssumption, setEditingAssumption] = React.useState(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [share, setShare] = React.useState(() => __persisted?.share || null);
  const [selectedItemId, setSelectedItemId] = React.useState(() => __persisted?.selectedItemId || null);
  const [hoveredItemId, setHoveredItemId] = React.useState(null); // transient — not persisted
  const [sortBySensitivity, setSortBySensitivity] = React.useState(() => !!__persisted?.sortBySensitivity);
  // How far up the scope ladder the user is. Integer 1..3.
  // Default 1 (only primary benefits). User clicks the scale to advance.
  const [scopeLevel, setScopeLevel] = React.useState(() => {
    const v = __persisted?.scopeLevel;
    if (v === 2 || v === 3) return v;
    // Back-compat: legacy persistence stored expandedScopes as an array
    const arr = __persisted?.expandedScopes;
    if (Array.isArray(arr) && arr.length) return Math.max(...arr, 1);
    return 1;
  });
  const [saveState, setSaveState] = React.useState("idle"); // idle | saving | saved
  const [estimatesOpen, setEstimatesOpen] = React.useState(false); // mobile collapsible
  const [resetOpen, setResetOpen] = React.useState(false);
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  // On mobile we present the model as view-only, regardless of READ_ONLY.
  const viewOnly = READ_ONLY || isMobile;

  // Merge defaults + custom assumptions. customAssumptions may shadow
  // a default by id (to edit metadata of an existing assumption);
  // ids not in defaults are appended as truly new assumptions.
  const assumptions = React.useMemo(() => {
    const customById = new Map(customAssumptions.map(a => [a.id, a]));
    const defaultIds = new Set(DEFAULT_ASSUMPTIONS.map(a => a.id));
    const base = DEFAULT_ASSUMPTIONS.map(a => customById.get(a.id) || a);
    const appended = customAssumptions.filter(a => !defaultIds.has(a.id));
    return [...base, ...appended];
  }, [customAssumptions]);

  const adjustedItems = items;

  const A = React.useMemo(() => {
    const o = {};
    for (const a of assumptions) o[a.id] = a.value;
    return o;
  }, [assumptions]);

  // Local "what-if" overrides on top of the default assumption values.
  // Hydration precedence: localStorage > snapshot.__overrides > {}.
  const [overrides, setOverrides] = React.useState(() =>
    __persisted?.overrides || __snap.__overrides || {}
  );
  const setAssumption = (id, value) => setOverrides(prev => ({ ...prev, [id]: value }));
  const A_eff = React.useMemo(() => ({ ...A, ...overrides }), [A, overrides]);
  const assumptionsEff = React.useMemo(
    () => assumptions.map(a => a.id in overrides ? { ...a, value: overrides[a.id], modified: true } : a),
    [assumptions, overrides]
  );
  // Full model — every item, every scope. Used by per-item displays,
  // tables, sensitivity, and the per-scope PV totals in the Benefits panel.
  const model = React.useMemo(
    () => computeModel(adjustedItems, A_eff),
    [adjustedItems, A_eff]
  );

  // Filtered model — only includes benefits at or below the current
  // scope level. Drives any aggregate that should reflect the user's
  // chosen "how much to include" position.
  const summaryItems = React.useMemo(() => adjustedItems.filter(it => {
    if (it.kind === "cost") return true;
    if (it.kind !== "benefit") return false;
    const scope = [1, 2, 3].includes(it.scope) ? it.scope : 1;
    return scope <= scopeLevel;
  }), [adjustedItems, scopeLevel]);
  const summaryModel = React.useMemo(
    () => computeModel(summaryItems, A_eff),
    [summaryItems, A_eff]
  );
  const irrValue = React.useMemo(
    () => computeIRR(summaryItems, A_eff),
    [summaryItems, A_eff]
  );

  // Wizard payload: { item, newAssumptions?, isEdit? }.
  const onAddItem = (payload) => {
    const item = payload && payload.item ? payload.item : payload;
    const newAss = (payload && payload.newAssumptions) || [];
    const isEdit = !!(payload && payload.isEdit);
    if (newAss.length) setCustomAssumptions(prev => [...prev, ...newAss]);
    setItems(prev => isEdit
      ? prev.map(i => i.id === item.id ? { ...i, ...item } : i)
      : [...prev, { ...item, removable: true }]
    );
  };
  const onRemoveItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
  };
  // Save (new or edit) of an assumption. Stored in customAssumptions; the
  // assumptions useMemo merges/shadows DEFAULT_ASSUMPTIONS by id.
  const onSaveAssumption = (a) => {
    setCustomAssumptions(prev => {
      const idx = prev.findIndex(x => x.id === a.id);
      if (idx === -1) return [...prev, a];
      const next = [...prev]; next[idx] = a; return next;
    });
  };

  // Derive which assumption ids a given item depends on. Prefer parsing the
  // formula source over trusting item.uses (wizard-created items only have
  // _grossSrc on first save).
  const idsFor = React.useCallback((id) => {
    if (!id) return [];
    const it = items.find(i => i.id === id);
    if (!it) return [];
    const allIds = new Set(assumptionsEff.map(a => a.id));
    const fromFormula = extractAssumptionIds(it._grossSrc, allIds);
    if (fromFormula.length) return fromFormula;
    if (Array.isArray(it.uses)) return it.uses.filter(id => allIds.has(id));
    return [];
  }, [items, assumptionsEff]);

  const highlightedIds = React.useMemo(() => idsFor(selectedItemId), [idsFor, selectedItemId]);
  const hoveredIds     = React.useMemo(() => idsFor(hoveredItemId),  [idsFor, hoveredItemId]);

  // Assumptions referenced by currently-visible benefit items (scope ≤ level).
  const visibleAssumptionIds = React.useMemo(() => {
    const ids = new Set(["discount_rate"]);
    for (const it of adjustedItems) {
      if (it.kind !== "benefit") continue;
      const scope = [1, 2, 3].includes(it.scope) ? it.scope : 1;
      if (scope > scopeLevel) continue;
      (it.uses || []).forEach(id => ids.add(id));
    }
    return ids;
  }, [adjustedItems, scopeLevel]);
  const selectedItem = selectedItemId ? items.find(i => i.id === selectedItemId) : null;
  const hoveredItem  = hoveredItemId  ? items.find(i => i.id === hoveredItemId)  : null;

  // Persist editable state to localStorage on change. Debounced so slider
  // drags don't thrash. Surface "saving" → "saved" → "idle" so the user
  // can trust the persistence layer.
  const __persistMounted = React.useRef(false);
  React.useEffect(() => {
    if (!__persistMounted.current) { __persistMounted.current = true; return; }
    setSaveState("saving");
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify({
          v: 1,
          items: serialiseItems(items),
          overrides, theme, tab, selectedItemId,
          customAssumptions, share, sortBySensitivity,
          scopeLevel, niceRounding,
          confirmedAssumptions, commitmentsConfirmed, worldProceedClicked,
        }));
        setSaveState("saved");
      } catch (e) { setSaveState("idle"); /* quota or disabled — silent */ }
    }, 200);
    return () => clearTimeout(handle);
  }, [items, overrides, theme, tab, selectedItemId, customAssumptions, share, sortBySensitivity, scopeLevel, niceRounding, confirmedAssumptions, commitmentsConfirmed, worldProceedClicked]);
  // Fade "saved" back to idle after a moment so the indicator doesn't
  // burn into the header.
  React.useEffect(() => {
    if (saveState !== "saved") return;
    const h = setTimeout(() => setSaveState("idle"), 1400);
    return () => clearTimeout(h);
  }, [saveState]);

  // Reset opens a modal first; only the confirm button actually wipes state.
  const onResetConfirm = () => {
    try { localStorage.removeItem(STATE_KEY); } catch {}
    window.location.reload();
  };

  // Click-outside handler for the Export dropdown menu.
  const exportMenuRef = React.useRef(null);
  React.useEffect(() => {
    if (!exportMenuOpen) return;
    const onDoc = (e) => {
      if (exportMenuRef.current && exportMenuRef.current.contains(e.target)) return;
      setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [exportMenuOpen]);

  const project = { name: PROJECT_META.shortName };

  return (
    <>
    <div className="no-print page-shell" style={{ minHeight: "100vh" }}>
      <header style={{
        borderBottom: "1px solid var(--line)",
        background: "color-mix(in srgb, var(--bg) 85%, transparent)",
        backdropFilter: "saturate(140%) blur(8px)",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobile ? "10px 14px" : "14px 28px", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, minWidth: 0, flex: 1 }}>
            <Logo size={isMobile ? 22 : 28} />
            {!isMobile && <span style={{
              width: 1, height: 20, background: "var(--line-strong)", flex: "0 0 auto",
            }} />}
            <h1 style={{
              fontFamily: "var(--serif)", fontWeight: 500,
              fontSize: isMobile ? 16 : 19, lineHeight: 1.2, letterSpacing: "-0.01em",
              margin: 0, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              color: "var(--ink)",
            }}>{PROJECT_META.name}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10 }}>
            <SaveIndicator state={saveState} />
            {!isMobile && (
              <label
                title="Show numbers rounded to nice steps (1, 2, 2.5, 5, 10 × 10ⁿ). Underlying values are unchanged."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 12, color: "var(--muted)", cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={niceRounding}
                  onChange={e => setNiceRounding(e.target.checked)}
                  style={{ cursor: "pointer", margin: 0 }}
                />
                Rounding
              </label>
            )}
            <ThemeToggle theme={theme} setTheme={setTheme} />
            {!isMobile && (
              <button onClick={() => setResetOpen(true)}
                title="Discard local edits and restore defaults"
                style={{
                  border: "1px solid var(--line)", background: "var(--surface)",
                  color: "var(--muted)", padding: "7px 12px", borderRadius: 999,
                  fontSize: 12, cursor: "pointer",
                }}>Reset</button>
            )}
            {!isMobile && (
              <div ref={exportMenuRef} style={{ position: "relative" }}>
                <Pill2 onClick={() => setExportMenuOpen(o => !o)}>
                  <IconDownload size={13} /> Export
                  <IconChevDown size={12} style={{ marginLeft: 2 }} />
                </Pill2>
                {exportMenuOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0,
                    minWidth: 200,
                    background: "var(--surface)", border: "1px solid var(--line)",
                    borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
                    overflow: "hidden", zIndex: 30,
                  }}>
                    <ExportMenuItem
                      title="Excel (.xlsx)"
                      sub="Live model · editable assumptions · auditor-grade"
                      onClick={() => {
                        exportXlsx({
                          items: adjustedItems, assumptions: assumptionsEff,
                          model, A: A_eff, irrValue,
                          projectName: PROJECT_META.name,
                          projectShortName: PROJECT_META.shortName,
                          projectDescription: PROJECT_META.description,
                          horizon: HORIZON,
                        });
                        setExportMenuOpen(false);
                      }}
                    />
                    <ExportMenuItem
                      title="PDF"
                      sub="Printable handout · invites markup"
                      onClick={() => {
                        setExportMenuOpen(false);
                        printPDF(PROJECT_META.shortName || PROJECT_META.name);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {!viewOnly && <Pill2 onClick={() => setShareOpen(true)}>Share</Pill2>}
            {(READ_ONLY || isMobile) && (
              <span style={{
                fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)",
                padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 999,
                background: "var(--surface-2)", whiteSpace: "nowrap",
              }}>{isMobile && !READ_ONLY ? "view only" : "shared · explore only"}</span>
            )}
            {!viewOnly && !isMobile && <Pill2 primary>Sign in</Pill2>}
          </div>
        </div>
      </header>

      <ValidationBanner />

      <MinimalLanding
        adjustedItems={adjustedItems}
        model={model}
        summaryItems={summaryItems}
        summaryModel={summaryModel}
        A={A_eff}
        assumptions={assumptionsEff}
        setAssumption={setAssumption}
        irrValue={irrValue}
        horizon={HORIZON}
        viewOnly={viewOnly}
        isMobile={isMobile}
        selectedItemId={selectedItemId}
        onSelectItem={setSelectedItemId}
        onHoverItem={setHoveredItemId}
        submitToClaudeCode={submitToClaudeCode}
        onAddItem={() => {}}
        onRemoveItem={onRemoveItem}
        onEditItem={() => {}}
        onEditAssumption={viewOnly ? null : setEditingAssumption}
        scopeLevel={scopeLevel}
        onSetScopeLevel={setScopeLevel}
        visibleAssumptionIds={visibleAssumptionIds}
        highlightedIds={highlightedIds}
        hoveredIds={hoveredIds}
        selectedItem={selectedItem}
        hoveredItem={hoveredItem}
        clearSelection={() => setSelectedItemId(null)}
        confirmedAssumptions={confirmedAssumptions}
        markAssumptionConfirmed={markAssumptionConfirmed}
        commitmentsConfirmed={commitmentsConfirmed}
        setCommitmentsConfirmed={setCommitmentsConfirmed}
        worldProceedClicked={worldProceedClicked}
        setWorldProceedClicked={setWorldProceedClicked}
      />

      {editingAssumption && (
        <Modal title="Edit estimate" onClose={() => setEditingAssumption(null)} width={560}>
          <AssumptionForm
            editing={editingAssumption}
            existingIds={assumptionsEff.map(a => a.id).filter(id => id !== editingAssumption.id)}
            onSave={(a) => { onSaveAssumption(a); setEditingAssumption(null); }}
            onCancel={() => setEditingAssumption(null)}
          />
        </Modal>
      )}

      {shareOpen && (
        <ShareModal
          snapshot={buildSnapshot({
            items: adjustedItems,
            assumptionsEff, overrides,
          })}
          existingShare={share}
          onShareSaved={setShare}
          onClose={() => setShareOpen(false)}
        />
      )}

      {resetOpen && (
        <Modal title="Reset everything on this device?" onClose={() => setResetOpen(false)} width={520}>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
            This will discard every change you've made locally and reload the page with the
            original <code style={{ fontFamily: "var(--mono)" }}>project.config.js</code> defaults. Resetting clears:
          </div>
          <ul style={{ margin: "12px 0 0", paddingLeft: 22, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-2)" }}>
            <li>Estimate overrides — your what-if slider edits</li>
            <li>Estimate edits and any new estimates you created via the wizard</li>
            <li>Items you added, edited, or removed</li>
            <li>Soft-value toggle, theme, sort preference, selected item</li>
            <li>
              <strong>Your owner token for sharing</strong>
              {share && (
                <span style={{ color: "var(--muted)" }}>
                  {" "}— after reset you won't be able to update <span style={{ fontFamily: "var(--mono)" }}>{share.url}</span> any more.
                  The existing shared snapshot stays live; you just won't own it from this device.
                </span>
              )}
            </li>
          </ul>
          <div style={{
            marginTop: 16, padding: "10px 12px", borderRadius: 8,
            background: "color-mix(in srgb, var(--red-deep) 10%, transparent)",
            color: "var(--red-deep)", fontSize: 12.5, lineHeight: 1.5,
          }}>
            This action cannot be undone.
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button onClick={() => setResetOpen(false)} style={{
              border: "1px solid var(--line-strong)", background: "var(--surface)",
              padding: "9px 16px", borderRadius: 999, fontSize: 13, cursor: "pointer",
            }}>Cancel</button>
            <button onClick={onResetConfirm} style={{
              border: "1px solid var(--red-deep)", background: "var(--red-deep)",
              color: "white", padding: "9px 16px", borderRadius: 999, fontSize: 13,
              fontWeight: 500, cursor: "pointer",
            }}>Reset everything</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "var(--bg)",
          padding: "11px 18px", borderRadius: 999,
          fontSize: 13, fontWeight: 500, zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          display: "inline-flex", alignItems: "center", gap: 10,
          maxWidth: "calc(100vw - 32px)",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999,
            background: toast.kind === "ok" ? "var(--green)" : "var(--c-yellow)",
          }} />
          {toast.text}
        </div>
      )}
    </div>
    {/* Persistent re-entry point for editing every assumption. */}
    <AssumptionsTab
      visible={true}
      onClick={() => setAssumptionsGridOpen(true)}
    />
    {assumptionsGridOpen && (
      <AssumptionsGrid
        assumptions={assumptionsEff}
        items={adjustedItems}
        A={A_eff}
        setAssumption={setAssumption}
        viewOnly={viewOnly}
        confirmedAssumptions={confirmedAssumptions}
        onToggleConfirm={(id) => markAssumptionConfirmed(id, !confirmedAssumptions[id])}
        onClose={() => setAssumptionsGridOpen(false)}
      />
    )}
    <PrintReport
      project={{
        name: PROJECT_META.name || PROJECT_META.shortName || "Business Case",
        shortName: PROJECT_META.shortName,
        description: PROJECT_META.description,
      }}
      model={model}
      items={adjustedItems}
      assumptions={assumptionsEff}
      A={A_eff}
      irrValue={irrValue}
      horizon={HORIZON}
    />
    </>
  );
};

// Item in the Export dropdown menu.
const ExportMenuItem = ({ title, sub, onClick }) => (
  <button onClick={onClick} style={{
    display: "block", width: "100%", textAlign: "left",
    border: "none", borderBottom: "1px solid var(--line)",
    background: "transparent", padding: "10px 14px", cursor: "pointer",
  }}>
    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{title}</div>
    <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }}>{sub}</div>
  </button>
);

const SaveIndicator = ({ state }) => {
  if (state === "idle") return null;
  const isSaving = state === "saving";
  return (
    <span style={{
      fontSize: 11, color: "var(--muted-2)", fontFamily: "var(--mono)",
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 8px", borderRadius: 999, background: "var(--surface-2)",
      border: "1px solid var(--line)",
    }} title={isSaving ? "Saving local changes…" : "Saved locally"}>
      <span style={{
        width: 6, height: 6, borderRadius: 999,
        background: isSaving ? "var(--c-yellow)" : "var(--green)",
        boxShadow: isSaving ? "0 0 0 3px color-mix(in srgb, var(--c-yellow) 30%, transparent)" : "none",
        transition: "background 200ms",
      }} />
      {isSaving ? "Saving" : "Saved"}
    </span>
  );
};

const ThemeToggle = ({ theme, setTheme }) => (
  <div style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 999, padding: 3, background: "var(--surface)" }}>
    {[["light", IconSun], ["dark", IconMoon]].map(([k, Icn]) => {
      const active = theme === k;
      return (
        <button key={k} onClick={() => setTheme(k)} style={{
          width: 28, height: 26, border: "none", padding: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999,
          background: active ? "var(--bg-soft)" : "transparent",
          color: active ? "var(--ink)" : "var(--muted-2)", cursor: "pointer",
        }}><Icn size={14} /></button>
      );
    })}
  </div>
);

const ValidationBanner = () => {
  const v = window.CONFIG_VALIDATION || { errors: [], warnings: [] };
  if (!v.errors.length && !v.warnings.length) return null;
  const tone = v.errors.length ? "error" : "warn";
  const bg = tone === "error"
    ? "color-mix(in srgb, var(--red-deep) 14%, transparent)"
    : "color-mix(in srgb, var(--c-yellow) 18%, transparent)";
  const fg = tone === "error" ? "var(--red-deep)" : "var(--ink-2)";
  return (
    <div style={{
      margin: "0 28px", marginTop: 16, padding: "12px 16px",
      border: `1px solid ${tone === "error" ? "var(--red-deep)" : "var(--line-strong)"}`,
      borderRadius: 12, background: bg, color: fg, fontSize: 12.5, lineHeight: 1.5,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        Config {tone === "error" ? "errors" : "warnings"} —
        the model may render incorrectly until these are fixed.
      </div>
      <ul style={{ margin: 0, paddingLeft: 20, fontFamily: "var(--mono)", fontSize: 11.5 }}>
        {v.errors.map((m, i) => <li key={`e${i}`}>{m}</li>)}
        {v.warnings.map((m, i) => <li key={`w${i}`} style={{ opacity: 0.7 }}>{m}</li>)}
      </ul>
    </div>
  );
};

const SummaryRow = ({ label, value, tooltip, helper }) => (
  <div style={{
    padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
    borderTop: "1px solid var(--line)",
  }}>
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13.5 }}>{label}</span>
        {tooltip && <HelpTip topic={tooltip} />}
      </div>
      {helper && <div style={{ color: "var(--muted-2)", fontSize: 11, marginTop: 2, fontFamily: "var(--mono)" }}>{helper}</div>}
    </div>
    <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap" }}>{value}</div>
  </div>
);

// ---------- Minimal landing ----------
//
// The default view shows almost nothing — just two lines:
//   Primary revenue uplift   +$X
//   Primary costs            -$Y
// (and a Primary cost saving line if the case has any).
//
// Below, quiet "explore more" rows reveal: adjacent benefits (Scope 2/3),
// the editable estimates, and the full analytical view (timeline / data
// tables / sensitivity / NPV / BCR / IRR). Confidence is restraint.

const LandingRow = ({ label, sublabel, value, accent, valuePrefix, valueNode, isOpen, onToggle, isFirst, children, muted, stickyTop, elevated, dataKey }) => (
  <div style={{
    borderTop: isFirst ? "none" : "1px solid var(--line)",
    opacity: muted ? 0.32 : 1,
    transition: "opacity 220ms",
  }}>
    <button
      onClick={onToggle}
      {...(stickyTop ? { "data-marginalia-top-bound": "" } : {})}
      {...(dataKey ? { "data-landing-row": dataKey } : {})}
      style={{
      width: "100%", border: "none",
      background: stickyTop ? "color-mix(in srgb, var(--bg) 92%, transparent)" : "transparent",
      ...(stickyTop ? {
        position: "sticky", top: 0, zIndex: 10,
        backdropFilter: "saturate(140%) blur(8px)",
        WebkitBackdropFilter: "saturate(140%) blur(8px)",
        borderBottom: "1px solid var(--line)",
        marginBottom: -1,
      } : {}),
      ...(elevated ? {
        position: stickyTop ? "sticky" : "relative",
        zIndex: 1002,
        pointerEvents: "none",
      } : {}),
      padding: "26px 4px", cursor: "pointer",
      display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16,
      textAlign: "left",
    }}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{
            fontFamily: "var(--mono)", color: "var(--muted)",
            fontSize: 13, display: "inline-block",
            transform: isOpen ? "rotate(90deg)" : "rotate(0)",
            transformOrigin: "center 45%",
            transition: "transform 160ms",
            width: 12,
          }}>▸</span>
          <div style={{
            fontFamily: "var(--serif)", fontWeight: 500,
            fontSize: (value != null || valueNode) ? 22 : 16,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}>{label}</div>
        </div>
        {sublabel && (
          <div style={{
            fontSize: 12, color: "var(--muted-2)",
            paddingLeft: 26,
          }}>
            {sublabel}
          </div>
        )}
      </div>
      {valueNode ? valueNode : (value != null && (
        <div style={{
          fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500,
          color: accent || "var(--ink)", whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}>
          {valuePrefix || ""}{fmtMoney(Math.abs(value), { exact: true })}
        </div>
      ))}
    </button>
    {isOpen && (
      <div style={{ padding: "0 0 32px 32px" }}>
        {children}
      </div>
    )}
  </div>
);

// Opacity per scope tier — color discipline says scopes 2/3 should fade.
const SCOPE_OPACITY = { 1: 1, 2: 0.65, 3: 0.4 };

// Static "net benefit" row — subtraction uses ONLY the primary (scope-1)
// benefit. Secondary + downstream (scope 2 + 3) PV appears in faint green
// alongside the result as a "+ bonus" so it reads as upside, not load-bearing.
const NetBenefitRow = ({
  npv, costsPV, bcr, irr, bonusPV,
  elevated, showCostsHint,
}) => {
  const positive = npv >= 0;
  const accent = positive ? "var(--green-deep)" : "var(--red-deep)";
  // "Stuck" detection: sentinel sits in normal flow just after the row.
  // When the row anchors to the viewport bottom, the sentinel is pushed
  // below the viewport. When the row sits in its natural position, the
  // sentinel is in view. Shadow only renders in the anchored state.
  const [stuck, setStuck] = React.useState(false);
  const sentinelRef = React.useRef(null);
  const barRef = React.useRef(null);
  const [barRect, setBarRect] = React.useState(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // When elevated, track the bar's screen position so the overlay can sit
  // directly on top of it as a sibling of <body>, escaping the sticky
  // stacking context and rising above the modal backdrop.
  React.useLayoutEffect(() => {
    if (!elevated) return;
    const update = () => {
      if (barRef.current) setBarRect(barRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [elevated]);

  const showBcr = costsPV > 0 && Number.isFinite(bcr);
  const showIrr = irr != null && Number.isFinite(irr);

  // Shared text content rendered both in the bar (default) and in the
  // overlaid fixed clone (when elevated). The clone has the same flex
  // layout as the bar but no background / border / shadow so it shows
  // through to the blurred bar below.
  const renderNumbers = (forOverlay) => (
    <>
      <div style={{
        fontFamily: "var(--serif)", fontWeight: 500,
        fontSize: 22, color: "var(--muted-2)", letterSpacing: "-0.01em",
        paddingLeft: 26,
        visibility: forOverlay ? "visible" : (elevated ? "hidden" : "visible"),
      }}>Total</div>
      <div style={{
        position: "relative",
        fontFamily: "var(--serif)", whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2,
        visibility: forOverlay ? "visible" : (elevated ? "hidden" : "visible"),
      }}>
        {showCostsHint && costsPV > 0 && (
          <span style={{
            fontFamily: "var(--serif)", fontSize: 14, fontWeight: 500,
            color: "var(--red-deep)", opacity: 0.7,
            fontVariantNumeric: "tabular-nums", lineHeight: 1,
            marginBottom: 2,
          }}
            title="Costs row scrolled off-screen — shown here so you can read Benefits − Costs = Total at a glance.">
            <span style={{ color: "var(--muted-2)", fontWeight: 400, marginRight: 4 }}>costs:</span>
            −{fmtMoney(costsPV, { exact: true })}
          </span>
        )}
        <div style={{ position: "relative" }}>
          <span style={{ fontSize: 28, fontWeight: 500, color: accent }}>
            {positive ? "" : "−"}{fmtMoney(Math.abs(npv), { exact: true })}
          </span>
          {bonusPV >= 1 && (
            <span style={{
              position: "absolute",
              left: "calc(100% + 16px)",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--green-deep)", opacity: 0.4,
              fontSize: 18, fontWeight: 500,
              display: "inline-flex", alignItems: "baseline", gap: 4,
            }}
              title="Secondary + downstream benefit — bonus upside, not load-bearing">
              <span style={{ fontSize: 16, fontWeight: 400 }}>+</span>
              <span>{fmtMoney(bonusPV, { exact: true })}</span>
            </span>
          )}
        </div>
        {(showBcr || showIrr) && (
          <div style={{
            display: "flex", gap: 14,
            fontFamily: "var(--sans)", fontSize: 11,
            color: "var(--muted)", letterSpacing: "0.01em",
          }}>
            {showBcr && (
              <span
                title="Benefit-Cost Ratio — every $1 of cost returns this much in benefits."
              >
                <span style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>{bcr.toFixed(2)}×</span>
                {" "}return per dollar
              </span>
            )}
            {showIrr && (
              <span
                title="Internal Rate of Return — the implied annual interest rate this project earns you."
              >
                <span style={{ color: "var(--ink-2)", fontFamily: "var(--mono)", fontWeight: 600 }}>{(irr * 100).toFixed(0)}%</span>
                {" "}annual return rate
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
    <div
      ref={barRef}
      data-marginalia-bottom-bound
      style={{
      // Sticky-to-bottom: when the row would naturally fall below the
      // viewport (because Benefits/Costs are expanded), anchor it to the
      // bottom edge so the user can see the live net update while editing
      // assumptions further up.
      position: "sticky", bottom: 0, zIndex: 10,
      background: "color-mix(in srgb, var(--bg) 92%, transparent)",
      backdropFilter: "saturate(140%) blur(8px)",
      WebkitBackdropFilter: "saturate(140%) blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 16, padding: "26px 4px",
      borderTop: "1px solid var(--line-strong)",
      boxShadow: stuck ? "0 -8px 16px -8px rgba(0,0,0,0.10)" : "none",
      transition: "box-shadow 180ms",
    }}>
      {renderNumbers(false)}
    </div>
    <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
    {/* Crisp number overlay. Portalled to <body> so that its
        `position: fixed` coords resolve against the viewport directly —
        not against the `.page-shell` wrapper whose `filter: saturate(0.5)`
        would otherwise become its containing block and make the overlay
        drift when the bar's bounding rect changes (sticky transitions,
        scroll updates). */}
    {elevated && barRect && ReactDOM.createPortal((
      <div style={{
        position: "fixed",
        top: barRect.top, left: barRect.left,
        width: barRect.width, height: barRect.height,
        zIndex: 1002,
        padding: "26px 4px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 16,
        pointerEvents: "none",
      }}>
        {renderNumbers(true)}
      </div>
    ), document.body)}
    </>
  );
};

// Headline value for the Benefits row — total of currently-included
// scopes in bold green. The remaining (un-included) scopes shown as a
// faint "+$xxx" floats absolutely into the right margin so the main
// number stays vertically aligned with the primary cost number below.
// On narrow viewports the bonus collapses inline below the headline
// to avoid the absolute-positioned chip spilling off-screen.
const BenefitsHeadlineValue = ({ includedDisp, remainingDisp }) => {
  const green = "var(--green-deep)";
  const isMobile = useIsMobile(900);
  const showBonus = remainingDisp >= 1;
  return (
    <div style={{
      position: "relative",
      fontFamily: "var(--serif)",
      whiteSpace: isMobile ? "normal" : "nowrap",
      fontVariantNumeric: "tabular-nums",
      display: isMobile ? "flex" : "block",
      flexDirection: isMobile ? "column" : undefined,
      alignItems: isMobile ? "flex-end" : undefined,
      gap: isMobile ? 2 : 0,
    }}>
      <span style={{ fontSize: 30, fontWeight: 500, color: green }}>
        {fmtMoney(includedDisp, { exact: true })}
      </span>
      {showBonus && !isMobile && (
        <span
          data-marginalia-top-bound
          style={{
            position: "absolute",
            left: "calc(100% + 16px)",
            top: "50%",
            transform: "translateY(-50%)",
            color: green, opacity: 0.4,
            fontSize: 18, fontWeight: 500,
            display: "inline-flex", alignItems: "baseline", gap: 2,
          }}
          title="Extra benefit from scope 2 + scope 3 not yet included">
          <span style={{ fontSize: 16, fontWeight: 400 }}>+</span>
          <span>{fmtMoney(remainingDisp, { exact: true })}</span>
        </span>
      )}
      {showBonus && isMobile && (
        <span
          style={{
            color: green, opacity: 0.55,
            fontSize: 14, fontWeight: 500,
            display: "inline-flex", alignItems: "baseline", gap: 2,
          }}
          title="Extra benefit from scope 2 + scope 3 not yet included">
          <span style={{ fontWeight: 400 }}>+</span>
          <span>{fmtMoney(remainingDisp, { exact: true })}</span>
        </span>
      )}
    </div>
  );
};

// Scope picker — a single bordered rectangle with three dividers.
// Click a segment → that segment AND all earlier ones get highlighted.
// (Equivalent to "show benefits up to this scope".)
const ScopeScale = ({ level, onSetLevel }) => {
  const segs = [
    { n: 1, label: "Direct benefits" },
    { n: 2, label: "Adjacent benefits" },
    { n: 3, label: "Downstream benefits" },
  ];
  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div style={{
        display: "inline-flex",
        border: "1px solid var(--line-strong)",
        borderRadius: 999, overflow: "hidden",
        background: "var(--surface)",
      }}>
        {segs.map((s, i) => {
          const included = level >= s.n;
          return (
            <div key={s.n}
              onClick={() => onSetLevel(s.n)}
              style={{
                borderLeft: i === 0 ? "none" : "1px solid var(--line-strong)",
                padding: "5px 14px",
                background: included
                  ? "color-mix(in srgb, var(--green-deep) 8%, var(--surface))"
                  : "var(--surface)",
                color: included ? "var(--ink)" : "var(--muted)",
                cursor: "pointer", userSelect: "none",
                fontFamily: "var(--serif)", fontSize: 11.5,
                fontWeight: 500, lineHeight: 1.4, whiteSpace: "nowrap",
                transition: "background 160ms, color 160ms",
              }}
            >{s.label}</div>
          );
        })}
      </div>
    </div>
  );
};

// Provenance for an assumption — only shown when the input is focused.
// Best case: Fermi breakdown (product of terms) WITH source citations.
// Next: pure Fermi or pure citation. Worst: nothing → render nothing.
const AssumptionProvenance = ({ a }) => {
  const hasFermi = Array.isArray(a.fermi) && a.fermi.length > 0;
  const hasSource = typeof a.source === "string" && a.source.trim().length > 0;
  if (!hasFermi && !hasSource) return null;

  const formatTerm = (t) => {
    if (typeof t.value !== "number" || !isFinite(t.value)) return String(t.value);
    const n = Math.abs(t.value) < 10 && Math.abs(t.value) > 0
      ? (Math.round(t.value * 100) / 100).toString()
      : Math.round(t.value).toLocaleString();
    return t.unit ? `${n} ${t.unit}` : n;
  };

  return (
    <div style={{
      padding: "10px 12px",
      background: "var(--surface)", border: "1px solid var(--line)",
      borderRadius: 8, fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-2)",
    }}>
      {hasFermi && (
        <div>
          <div style={{
            fontSize: 9.5, color: "var(--muted-2)", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: 6, fontWeight: 600,
          }}>Estimate</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {a.fermi.map((t, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", gap: 8,
              }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: "var(--muted-2)", marginRight: 4 }}>
                    {i === 0 ? " " : "×"}
                  </span>
                  {t.label}
                </span>
                <span style={{
                  fontFamily: "var(--mono)", color: "var(--ink-2)",
                  whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
                }}>{formatTerm(t)}</span>
              </div>
            ))}
          </div>
          {a.fermi.some(t => t.source) && (
            <div style={{
              marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--line)",
              display: "flex", flexDirection: "column", gap: 2,
              fontSize: 10.5, color: "var(--muted)",
            }}>
              {a.fermi.filter(t => t.source).map((t, i) => (
                <div key={i}>
                  <span style={{ fontStyle: "italic" }}>{t.label}:</span> {t.source}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {hasSource && (
        <div style={{ marginTop: hasFermi ? 8 : 0,
                       paddingTop: hasFermi ? 8 : 0,
                       borderTop: hasFermi ? "1px dashed var(--line)" : "none" }}>
          <div style={{
            fontSize: 9.5, color: "var(--muted-2)", letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: 4, fontWeight: 600,
          }}>Source</div>
          <div style={{ color: "var(--ink-2)" }}>{a.source}</div>
        </div>
      )}
    </div>
  );
};

// Inline editor for a single assumption — text field with a unit suffix.
// Hover or focus → provenance appears in the margin to the right.
// Edits recompute live.
// Clamps the floating marginalia's vertical position so it stays within
// a viewport-relative safe zone. Safe zone is computed dynamically from
// elements tagged with [data-marginalia-top-bound] / [data-marginalia-bottom-bound].
// Returns { marginaliaTop } — a CSS top value (in px, relative to the row)
// or null if not yet computed (in which case the caller should fall back
// to a CSS default like top:50%).
const useMarginaliaClamp = (active, rowRef, marginaliaRef) => {
  const [marginaliaTop, setMarginaliaTop] = React.useState(null);

  const reposition = React.useCallback(() => {
    const row = rowRef.current;
    const marg = marginaliaRef.current;
    if (!row || !marg) return;
    const REGION = 220;
    const PAD = 14;
    const vh = window.innerHeight;
    let safeTop = 16;
    let safeBottom = vh - 16;
    document.querySelectorAll("[data-marginalia-top-bound]").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      const centerY = r.top + r.height / 2;
      if (centerY < 0 || centerY > REGION) return;
      if (r.bottom + PAD > safeTop) safeTop = r.bottom + PAD;
    });
    document.querySelectorAll("[data-marginalia-bottom-bound]").forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      const centerY = r.top + r.height / 2;
      if (centerY < vh - REGION) return;
      if (r.top - PAD < safeBottom) safeBottom = r.top - PAD;
    });

    const r = row.getBoundingClientRect();
    const h = marg.offsetHeight;
    let top = r.top + r.height / 2 - h / 2;
    if (top + h > safeBottom) top = safeBottom - h;
    if (top < safeTop) top = safeTop;
    const relTop = Math.round(top - r.top);
    setMarginaliaTop(prev => (prev === relTop ? prev : relTop));
  }, [rowRef, marginaliaRef]);

  // Recompute on every render so layout shifts (scope toggle, etc.) are picked up.
  React.useLayoutEffect(() => {
    if (active) reposition();
    else setMarginaliaTop(null);
  });

  // Scroll / resize / content-resize listeners while active.
  React.useEffect(() => {
    if (!active) return;
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    let ro;
    if (typeof ResizeObserver !== "undefined" && marginaliaRef.current) {
      ro = new ResizeObserver(reposition);
      ro.observe(marginaliaRef.current);
    }
    return () => {
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
      if (ro) ro.disconnect();
    };
  }, [active, reposition, marginaliaRef]);

  return marginaliaTop;
};

// Auto-close a locked-open row when the user scrolls it far away from
// the viewport (so the pinned marginalia in the margin doesn't linger
// after the prospect has moved on).
const useAutoCloseOnScrollAway = (active, rowRef, onClose) => {
  React.useEffect(() => {
    if (!active) return;
    const SLACK = 140; // px past the viewport edge before we close
    const check = () => {
      const r = rowRef.current?.getBoundingClientRect();
      if (!r) return;
      if (r.bottom < -SLACK || r.top > window.innerHeight + SLACK) {
        onClose && onClose();
      }
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [active, onClose, rowRef]);
};

// Inline "Add benefit / Add cost" — four states:
//   idle        → looks like an AddButton (+ Add <kind>)
//   editing     → textarea + Create new + Cancel
//   conversing  → message thread with Claude + a follow-up textarea
//   sent_only   → "✓ copied to clipboard" inline (channel offline fallback)
const InlineAddItem = ({ kind, submit }) => {
  const [state, setState] = React.useState("idle");
  const [text, setText] = React.useState("");
  const [chatId, setChatId] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [statusText, setStatusText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const textareaRef = React.useRef(null);
  const followupRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);

  React.useEffect(() => {
    if (state === "editing" && textareaRef.current) textareaRef.current.focus();
    if (state === "conversing" && followupRef.current) followupRef.current.focus();
  }, [state]);

  // Auto-scroll the message list as it grows.
  React.useEffect(() => {
    if (state === "conversing" && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, state]);

  // Subscribe to Claude's replies via SSE while we have an active chat.
  React.useEffect(() => {
    if (!chatId) return;
    let es;
    try {
      es = new EventSource("http://localhost:8788/events");
    } catch { return; }
    const onReply = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.chat_id !== chatId) return;
        setMessages(m => [...m, { role: "assistant", text: data.text, t: Date.now() }]);
        setBusy(false);
      } catch {}
    };
    es.addEventListener("reply", onReply);
    es.onerror = () => {/* keep open; browser auto-reconnects */};
    return () => { es.removeEventListener("reply", onReply); es.close(); };
  }, [chatId]);

  const reset = () => {
    setState("idle"); setText(""); setStatusText("");
    setChatId(null); setMessages([]); setBusy(false);
  };

  React.useEffect(() => {
    if (state !== "sent_only") return;
    const h = setTimeout(reset, 4500);
    return () => clearTimeout(h);
  }, [state]);

  // Build the framing prompt that gets sent with the user's text on the
  // first message. Follow-up messages are passed through verbatim.
  const buildInitialMessage = (userText) => kind === "cost"
    ? `Add a new cost to the business case: ${userText}. Ask me any clarifying questions you need (what the cost is, when it lands, how big it is, what assumptions drive it), then update project.config.js. When you reply, use the \`reply\` tool with the chat_id from the channel tag.`
    : `Add a new benefit to the business case: ${userText}. Ask me any clarifying questions you need (revenue uplift / cost saving / qualitative; which scope; what's driving it; what it's worth), then update project.config.js. When you reply, use the \`reply\` tool with the chat_id from the channel tag.`;

  const sendMessage = async (userText, { initial }) => {
    const message = initial ? buildInitialMessage(userText) : userText;
    setMessages(m => [...m, { role: "user", text: userText, t: Date.now() }]);
    setBusy(true);
    const r = await submit(message, initial ? kind : undefined, chatId);
    if (r.ok && r.mode === "channel") {
      if (!chatId && r.chat_id) setChatId(r.chat_id);
      setState("conversing");
    } else if (r.ok && r.mode === "clipboard") {
      setStatusText("Channel offline — prompt copied to clipboard");
      setState("sent_only");
      setBusy(false);
    } else {
      setStatusText("Couldn't deliver — see browser console");
      setState("sent_only");
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await sendMessage(t, { initial: true });
  };

  const handleFollowup = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    await sendMessage(t, { initial: false });
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (state === "conversing") handleFollowup();
      else handleCreate();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (state === "conversing") reset();
      else reset();
    }
  };

  const handleQuickCopy = async () => {
    const prompt = kind === "cost"
      ? "Add a new cost to the business case. Ask me any clarifying questions you need (what the cost is, when it lands, how big it is, what assumptions drive it), then update project.config.js."
      : "Add a new benefit to the business case. Ask me any clarifying questions you need (revenue uplift / cost saving / qualitative; which scope; what's driving it; what it's worth), then update project.config.js.";
    try {
      await navigator.clipboard.writeText(prompt);
      setStatusText(`Prompt copied to clipboard, go back to claude code and paste this to add a new ${kind}`);
    } catch {
      console.log("[CBAgent prompt]\n" + prompt);
      setStatusText("Couldn't copy — see browser console");
    }
    setState("sent_only");
  };

  if (state === "idle") {
    return (
      <button onClick={handleQuickCopy} style={{
        border: "1px dashed var(--line-strong)", background: "transparent",
        padding: "10px 14px", borderRadius: 10,
        color: "var(--muted)", fontSize: 13, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>
        <IconPlus size={14} /> Add {kind}
      </button>
    );
  }

  if (state === "sent_only") {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        border: "1px solid var(--line)", background: "var(--bg-soft)",
        padding: "10px 14px", borderRadius: 10,
        color: "var(--ink-2)", fontSize: 13,
      }}>
        <span style={{ color: "var(--green-deep)", fontWeight: 600 }}>✓</span>
        {statusText}
      </div>
    );
  }

  if (state === "conversing") {
    return (
      <div style={{
        width: "100%", boxSizing: "border-box",
        border: "1px solid var(--line-strong)", borderRadius: 10,
        background: "var(--surface)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Messages */}
        <div style={{
          padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
          maxHeight: 360, overflowY: "auto",
        }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 12px", borderRadius: 10,
              background: m.role === "user"
                ? "var(--bg-soft)"
                : "color-mix(in srgb, var(--green-deep) 6%, var(--surface))",
              border: "1px solid var(--line)",
              fontSize: 13, lineHeight: 1.5,
              color: "var(--ink)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{m.text}</div>
          ))}
          {busy && (
            <div style={{
              alignSelf: "flex-start", fontSize: 11.5, color: "var(--muted-2)",
              fontStyle: "italic", padding: "4px 12px",
            }}>Claude is working on it…</div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {/* Follow-up input */}
        <div style={{
          borderTop: "1px solid var(--line)", padding: 12,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <textarea
            ref={followupRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Reply to Claude…"
            rows={2}
            style={{
              width: "100%", border: "none", outline: "none",
              resize: "vertical", minHeight: 44,
              fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--ink)",
              background: "transparent", padding: 2, lineHeight: 1.5,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "var(--muted-2)" }}>
              ⌘↩ to send · Esc to close
            </span>
            <div style={{ display: "inline-flex", gap: 8 }}>
              <button onClick={reset} style={{
                border: "1px solid var(--line)", background: "var(--surface)",
                color: "var(--muted)", padding: "7px 14px", borderRadius: 999,
                fontSize: 12.5, cursor: "pointer",
              }}>Close</button>
              <button onClick={handleFollowup} disabled={!text.trim() || busy} style={{
                border: "1px solid var(--ink)",
                background: text.trim() && !busy ? "var(--ink)" : "var(--surface-2)",
                color: text.trim() && !busy ? "var(--bg)" : "var(--muted-2)",
                padding: "7px 14px", borderRadius: 999,
                fontSize: 12.5, fontWeight: 500,
                cursor: text.trim() && !busy ? "pointer" : "not-allowed",
              }}>Send</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // editing (first message)
  return (
    <div style={{
      width: "100%", boxSizing: "border-box",
      border: "1px solid var(--line-strong)", borderRadius: 10,
      background: "var(--surface)", padding: 12,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder={kind === "cost"
          ? "Describe the new cost. We will send this prompt to your Claude Code terminal."
          : "Describe the new benefit. We will send this prompt to your Claude Code terminal."}
        rows={3}
        style={{
          width: "100%", border: "none", outline: "none",
          resize: "vertical", minHeight: 64,
          fontFamily: "var(--sans)", fontSize: 13.5, color: "var(--ink)",
          background: "transparent", padding: 4, lineHeight: 1.5,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 11, color: "var(--muted-2)" }}>
          ⌘↩ to send · Esc to cancel
        </span>
        <div style={{ display: "inline-flex", gap: 8 }}>
          <button onClick={reset} style={{
            border: "1px solid var(--line)", background: "var(--surface)",
            color: "var(--muted)", padding: "7px 14px", borderRadius: 999,
            fontSize: 12.5, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={!text.trim()} style={{
            border: "1px solid var(--ink)",
            background: text.trim() ? "var(--ink)" : "var(--surface-2)",
            color: text.trim() ? "var(--bg)" : "var(--muted-2)",
            padding: "7px 14px", borderRadius: 999,
            fontSize: 12.5, fontWeight: 500,
            cursor: text.trim() ? "pointer" : "not-allowed",
          }}>Create new</button>
        </div>
      </div>
    </div>
  );
};

const InlineAssumptionEditor = ({ a, value, onChange, disabled }) => {
  const [text, setText] = React.useState(() => String(value ?? a.value));
  const [focused, setFocused] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  React.useEffect(() => { setText(String(value ?? a.value)); }, [value, a.value]);

  const handle = (s) => {
    setText(s);
    const n = parseFloat(s);
    if (!isNaN(n) && isFinite(n)) onChange(n);
  };

  const show = focused || hovered;
  const hasProvenance =
    (Array.isArray(a.fermi) && a.fermi.length > 0)
    || (typeof a.source === "string" && a.source.trim().length > 0);

  // Provenance popover position. Computed via getBoundingClientRect so
  // we can render with position: fixed and escape any `overflow: hidden`
  // ancestors (e.g. the All Assumptions modal's scrollable body).
  // Prefers the right side of the input; flips left if it would overflow
  // the viewport. Tracks scroll & resize so it stays glued in place.
  const wrapperRef = React.useRef(null);
  const hoverTimerRef = React.useRef(null);
  const [popoverPos, setPopoverPos] = React.useState(null);
  const setHoverSticky = (v) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (v) setHovered(true);
    else hoverTimerRef.current = setTimeout(() => setHovered(false), 120);
  };
  const POPOVER_W = 220;
  React.useLayoutEffect(() => {
    if (!show || !hasProvenance || !wrapperRef.current) {
      setPopoverPos(null);
      return;
    }
    const update = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const GAP = 16;
      let left = rect.right + GAP;
      let placement = "right";
      if (left + POPOVER_W > vw - 16) {
        const altLeft = rect.left - POPOVER_W - GAP;
        if (altLeft >= 16) { left = altLeft; placement = "left"; }
        else left = Math.max(16, vw - POPOVER_W - 16);
      }
      setPopoverPos({ top: rect.top, left, placement });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [show, hasProvenance]);

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative" }}
      onMouseEnter={() => setHoverSticky(true)}
      onMouseLeave={() => setHoverSticky(false)}
    >
      <div style={{
        display: "flex", alignItems: "center", width: "100%",
        border: `1px solid ${focused ? "var(--ink)" : "var(--line-strong)"}`,
        borderRadius: 8,
        background: "var(--surface)", overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        transition: "border-color 120ms",
      }}>
        <input
          type="text" inputMode="decimal" value={text}
          disabled={disabled}
          step={a.step || 1}
          onChange={e => handle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={e => { handle(e.target.value); setFocused(false); }}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          style={{
            flex: 1, minWidth: 0,
            background: "transparent", border: "none", outline: "none",
            padding: "7px 10px", fontFamily: "var(--mono)", fontSize: 13,
            color: "var(--ink)", textAlign: "right",
          }}
        />
        {a.unit && (
          <span style={{
            fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--mono)",
            padding: "0 10px 0 6px", whiteSpace: "nowrap", flex: "0 0 auto",
          }}>{a.unit}</span>
        )}
      </div>
      {show && hasProvenance && popoverPos && ReactDOM.createPortal(
        (
          <div
            // Hovering the popover keeps the editor's hover state alive
            // so the popover doesn't blink away as the cursor crosses
            // the gap to it.
            onMouseEnter={() => setHoverSticky(true)}
            onMouseLeave={() => setHoverSticky(false)}
            style={{
              position: "fixed",
              top: popoverPos.top,
              left: popoverPos.left,
              width: POPOVER_W,
              zIndex: 1400,
              pointerEvents: "auto",
            }}
          >
            <AssumptionProvenance a={a} />
          </div>
        ),
        // Portal target: document.body. Rendering here guarantees the
        // popover escapes any ancestor's `overflow: hidden` (e.g. the
        // All Assumptions modal card and its scrollable body), and is
        // not subject to a backdrop-filter containing block.
        document.body
      )}
    </div>
  );
};

// Per-benefit row in the Benefits panel.
//   Hover → peek the right-margin assumptions only (no layout shift).
//   Click → lock open with the full expansion (left description + marginalia).
const BenefitItemRow = ({ item, model, A, assumptions, setAssumption, viewOnly, opacity, isExpanded, hoveredId, onToggle, onHoverChange, horizon, isMobile, scope }) => {
  const pv = (model.perItem[item.id]?.grossPV ?? 0);
  const usedIds = Array.isArray(item.uses) ? item.uses : [];
  const usedAssumptions = (assumptions || []).filter(a => usedIds.includes(a.id));
  const isQualitative = (item.benefitKind || "qualitative") === "qualitative";
  const isHovered = hoveredId === item.id;
  const otherHovered = hoveredId != null && hoveredId !== item.id;
  const showLeftBox = isExpanded;
  // Hovered row's marginalia overrides any clicked-open row's marginalia
  // so the two don't visually overlap in the right margin.
  const showMarginalia = isHovered || (isExpanded && !otherHovered);

  const rowRef = React.useRef(null);
  useAutoCloseOnScrollAway(isExpanded, rowRef, onToggle);

  return (
    <div
      data-benefit-row-id={item.id}
      style={{
        // The selected (modal-open) row pops to full opacity even if it's
        // a scope 2/3 item; other rows keep their scope-faded opacity even
        // when shown above the modal blur for cross-column context.
        opacity: isExpanded ? 1 : opacity,
        transition: "opacity 220ms ease",
        ...(isExpanded ? { position: "relative", zIndex: 1002 } : {}),
      }}
      onMouseEnter={onHoverChange ? () => onHoverChange(item.id) : undefined}
      onMouseLeave={onHoverChange ? () => onHoverChange(null) : undefined}
    >
      <button ref={rowRef} onClick={onToggle} style={{
        width: "100%", border: "none",
        background: showMarginalia ? "var(--bg-soft)" : "transparent",
        margin: "0 -12px", padding: "16px 12px",
        borderRadius: 8,
        cursor: "pointer",
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 12, textAlign: "left",
        transition: "background 160ms",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
          <span style={{
            fontSize: 12, color: "var(--muted-2)", fontFamily: "var(--mono)",
            width: 10, display: "inline-block",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
            transition: "transform 160ms",
          }}>▸</span>
          <span style={{
            fontFamily: "var(--serif)", fontSize: 16, fontWeight: 500,
            color: "var(--ink)", letterSpacing: "-0.005em",
          }}>{item.name}</span>
        </div>
        {!isQualitative && (
          <span style={{
            fontFamily: "var(--serif)", fontSize: 18, fontWeight: 500,
            color: "var(--green-deep)",
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}>
            {fmtMoney(pv, { exact: true })}
          </span>
        )}
      </button>
    </div>
  );
};


// Per-cost row — same expanding-with-marginalia pattern as BenefitItemRow.
// Value renders in dark yellow (no minus sign, no red).
const CostItemRow = ({ item, model, A, assumptions, setAssumption, viewOnly, isExpanded, onToggle, horizon, isMobile, isHighlighted, onHover, hoveredId }) => {
  const pv = (model.perItem[item.id]?.grossPV ?? 0);
  const usedIds = Array.isArray(item.uses) ? item.uses : [];
  const usedAssumptions = (assumptions || []).filter(a => usedIds.includes(a.id));
  const accent = "var(--red-deep)";
  const otherHovered = hoveredId != null && hoveredId !== item.id;
  const showLeftBox = isExpanded;
  // Hovered row overrides any clicked-open row's marginalia.
  const showMarginalia = isHighlighted || (isExpanded && !otherHovered);
  // Faint per-item color used to visually connect the row to its
  // assumptions in the right margin.
  const sharedHighlight = showMarginalia
    ? `color-mix(in srgb, ${item.color} 14%, transparent)`
    : "transparent";

  const rowRef = React.useRef(null);
  const marginaliaRef = React.useRef(null);
  const marginaliaTop = useMarginaliaClamp(showMarginalia && !isMobile && usedAssumptions.length > 0, rowRef, marginaliaRef);
  useAutoCloseOnScrollAway(isExpanded, rowRef, onToggle);
  return (
    <div
      onMouseEnter={() => onHover && onHover(item.id)}
      onMouseLeave={() => onHover && onHover(null)}
      style={{
        background: sharedHighlight,
        boxShadow: isHighlighted
          ? `inset 3px 0 0 ${item.color}`
          : "none",
        margin: "0 -12px", padding: "0 12px",
        borderRadius: 6,
        transition: "background 120ms, box-shadow 120ms",
        position: "relative",
      }}
    >
      <button ref={rowRef} onClick={onToggle} style={{
        width: "100%", border: "none", background: "transparent",
        padding: "12px 0", cursor: "pointer",
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 12, textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            fontSize: 11, color: "var(--muted-2)", fontFamily: "var(--mono)",
            width: 10, display: "inline-block",
            transform: isExpanded ? "rotate(90deg)" : "rotate(0)",
            transition: "transform 160ms",
          }}>▸</span>
          <span style={{
            width: 10, height: 10, flex: "0 0 auto",
            background: item.color,
            border: "1px solid var(--ink-2)",
            display: "inline-block",
          }} />
          <span style={{ fontSize: 13.5, color: "var(--ink)" }}>{item.name}</span>
        </div>
        <span style={{
          fontFamily: "var(--mono)", fontSize: 13, color: accent,
          fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
        }}>{fmtMoney(pv, { exact: true })}</span>
      </button>

      {/* Marginalia for costs — hover OR click. */}
      {showMarginalia && !isMobile && usedAssumptions.length > 0 && (
        <>
          <div style={{
            position: "absolute",
            left: "100%", top: 0, bottom: 0, width: 40,
          }} />
          <div ref={marginaliaRef} style={{
            position: "absolute",
            left: "calc(100% + 40px)",
            top: marginaliaTop != null ? `${marginaliaTop}px` : "50%",
            transform: marginaliaTop != null ? "none" : "translateY(-50%)",
            width: 180,
            display: "flex", flexDirection: "column", gap: 14,
            background: sharedHighlight,
            padding: "14px 16px",
            borderRadius: 10,
          }}>
            {usedAssumptions.map(a => (
              <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{
                  fontSize: 11, color: "var(--muted-2)",
                  letterSpacing: "0.04em",
                }}>{a.label}</div>
                <InlineAssumptionEditor
                  a={a} value={A[a.id]}
                  onChange={v => setAssumption(a.id, v)}
                  disabled={viewOnly}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Left-side description box — only on click. */}
      {showLeftBox && (
        <div style={{ marginTop: 4, marginBottom: 12 }}>
          <div style={{
            padding: "20px 22px",
            background: "var(--bg-soft)",
            borderRadius: 10,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div style={{
              fontFamily: "var(--serif)", fontSize: 28, fontWeight: 500,
              color: accent, lineHeight: 1.1,
            }}>
              {fmtMoney(pv, { exact: true })}
              <span style={{
                fontSize: 12, color: "var(--muted-2)", fontFamily: "var(--mono)",
                marginLeft: 10, fontWeight: 400,
              }}>over {horizon} years</span>
            </div>
            {item.desc && (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
                {item.desc}
              </div>
            )}
          </div>
          {isMobile && usedAssumptions.length > 0 && (
            <div style={{
              marginTop: 14, padding: "0 22px",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              {usedAssumptions.map(a => (
                <div key={a.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--muted-2)" }}>{a.label}</div>
                  <InlineAssumptionEditor
                    a={a} value={A[a.id]}
                    onChange={v => setAssumption(a.id, v)}
                    disabled={viewOnly}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Costs section — chart + clickable item rows in the same minimalist
// style as Benefits. No Card2 wrapper, no eyebrow header.
const CostsBreakdown = ({ costs, model, A, assumptions, setAssumption, horizon, viewOnly, isMobile, costSeries, costYMax, selectedItemId, onSelectItem, onAddItem, openId, setOpenId, hoveredId, setHoveredId, submitToClaudeCode }) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div style={{
          fontSize: 11, color: "var(--muted-2)", letterSpacing: "0.1em",
          textTransform: "uppercase", marginBottom: 10, fontWeight: 500,
        }}>Costs over time</div>
        <div style={{ marginLeft: -8, marginRight: -4 }}>
          <HoverStackedBars
            series={costSeries} height={220} yMax={costYMax}
            selectedKey={selectedItemId} onSegmentClick={onSelectItem}
            hoveredKey={hoveredId} onSegmentHover={setHoveredId}
            yLabelFmt={v => v >= 1000 ? `$${(v/1000).toFixed(1)}M` : `$${v.toFixed(0)}k`}
          />
        </div>
      </div>

      <div>
        <div style={{
          fontSize: 11, color: "var(--muted-2)", letterSpacing: "0.1em",
          textTransform: "uppercase", marginBottom: 6, fontWeight: 500,
        }}>Costs</div>
        <div style={{ borderTop: "1px solid var(--line)" }}>
          {/* Drop cost lines that round to $0 — same threshold as the
              benefit column rows. */}
          {costs
            .filter(i => Math.abs(model.perItem[i.id]?.grossPV ?? 0) >= 0.5)
            .map(i => (
            <div key={i.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <CostItemRow
                item={i} model={model} A={A} assumptions={assumptions}
                setAssumption={setAssumption} viewOnly={viewOnly}
                isExpanded={openId === i.id}
                onToggle={() => setOpenId(openId === i.id ? null : i.id)}
                horizon={horizon} isMobile={isMobile}
                isHighlighted={hoveredId === i.id}
                hoveredId={hoveredId}
                onHover={setHoveredId}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Per-column block in the benefits grid. Header (label + headline value)
// is always crisp; the item rows underneath start heavily blurred and
// reveal on hover — progressive disclosure so a viewer reads the three
// summary numbers first, and chooses where to look closer. Rows above
// the current scope still occupy layout space (invisible) so column
// heights stay constant as the scope dial moves.
const BenefitColumn = ({
  kind, label, rows, scopeLevel, maxRows, colIdx, useSubgrid, activeKind,
  focusedAssumptionId, revealed, onReveal,
  headlineValue, // pre-rounded value passed from parent for consistency
  model, A, assumptions, setAssumption,
  viewOnly, horizon, openId, setOpenId, hoveredId, setHoveredId,
}) => {
  const isQualitative = kind === "qualitative";
  const isVisibleAt = (i) => {
    const sc = [1,2,3].includes(i.scope) ? i.scope : 1;
    return sc <= scopeLevel;
  };
  const visibleRows = rows.filter(isVisibleAt);
  const headline = isQualitative
    ? `${visibleRows.length}`
    : fmtMoney(headlineValue, { exact: true });
  const headlineSub = isQualitative
    ? (visibleRows.length === 1 ? "benefit" : "benefits")
    : null;
  // Drop rows whose value rounds to zero in the displayed format. The
  // threshold matches fmtMoney's rounding (anything with |pv| < 0.5
  // would render as "$0"). Qualitative items are zero-valued by design
  // and stay visible — they carry their meaning in the label, not a
  // number.
  const renderedRows = rows.filter(r => {
    if ((r.benefitKind || "qualitative") === "qualitative") return true;
    const pv = model.perItem[r.id]?.grossPV ?? 0;
    return Math.abs(pv) >= 0.5;
  });
  const phantomCount = Math.max(0, maxRows - renderedRows.length);

  const containerStyle = useSubgrid ? {
    display: "grid",
    gridTemplateRows: "subgrid",
    gridRow: "1 / -1",
    gridColumn: `${colIdx + 1}`,
    minWidth: 0,
  } : { minWidth: 0 };

  const headlineFocusRelated = !!focusedAssumptionId
    && rows.some(r => Array.isArray(r.uses) && r.uses.includes(focusedAssumptionId));
  const headlineElevated = kind === activeKind || headlineFocusRelated;

  return (
    <div
      style={containerStyle}
      onMouseEnter={() => onReveal && onReveal(kind)}
    >
      <div
        data-benefit-column-header={kind}
        style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 10, marginBottom: 10,
        // BenefitItemRow's button (margin: 0 -12px, padding: 16px 12px,
        // width: 100%, border-box) places its content-right at
        // column_right − 24px. Mirror that inset here so the headline
        // value lands at the same x as every per-row value below.
        paddingRight: 24,
        // Dim non-active columns' headlines while a benefit is being
        // inspected — same 50% step as the dimmed rows.
        opacity: (openId != null && kind !== activeKind) ? 0.5 : 1,
        transition: "opacity 220ms ease",
        ...(headlineElevated ? { position: "relative", zIndex: 1002 } : {}),
      }}>
        <div style={{
          display: "inline-flex", alignItems: "baseline", gap: 8,
          fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500,
          color: "var(--ink)", letterSpacing: "-0.01em",
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {kind === "revenue_uplift" && (
            <span style={{
              color: "var(--green-deep)",
              alignSelf: "center", display: "inline-flex",
            }}>
              <IconBarsUp size={18} stroke={1.8} />
            </span>
          )}
          {kind === "cost_saving" && (
            <span style={{
              color: "var(--green-deep)",
              alignSelf: "center", display: "inline-flex",
            }}>
              <IconPiggy size={18} stroke={1.8} />
            </span>
          )}
          {label}
        </div>
        <div style={{
          display: "inline-flex", alignItems: "baseline", gap: 6,
          fontFamily: "var(--serif)", fontWeight: 500,
          color: isQualitative ? "var(--ink-2)" : "var(--green-deep)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 22, letterSpacing: "-0.01em" }}>{headline}</span>
          {headlineSub && (
            <span style={{
              fontSize: 11, color: "var(--muted-2)",
              fontFamily: "var(--sans)", fontWeight: 400,
            }}>{headlineSub}</span>
          )}
        </div>
      </div>
      {renderedRows.map((i, idx) => {
        const sc = [1,2,3].includes(i.scope) ? i.scope : 1;
        const visible = sc <= scopeLevel;
        // Out-of-scope rows stay blurred / hidden even when the focused
        // assumption drives them — they're deliberately not on screen
        // at the current scope, so they shouldn't pop into view.
        const focusRelated = visible
          && !!focusedAssumptionId
          && Array.isArray(i.uses)
          && i.uses.includes(focusedAssumptionId);
        const isSelected = openId === i.id;
        const elevate = isSelected || focusRelated;
        const modalOpen = openId != null;
        // Whenever a row is selected, every other row drops to a fraction
        // of its scope opacity so the selected one reads as the only
        // fully-lit item. Selected row's opacity is overridden to 1
        // inside BenefitItemRow.
        const dimmedOpacity = (modalOpen && !isSelected)
          ? SCOPE_OPACITY[sc] * 0.5
          : SCOPE_OPACITY[sc];
        return (
          <div key={i.id} style={{
            borderTop: idx === 0 ? "1px solid var(--line)" : "none",
            borderBottom: "1px solid var(--line)",
            filter: (revealed || focusRelated) ? "none" : "blur(10px)",
            opacity: (revealed || focusRelated) ? 1 : 0.85,
            // Progressive-disclosure reveal uses the default 220ms ease;
            // the focus-triggered deblur (when an assumption click lights
            // up cross-column rows) snaps in quickly so the user sees the
            // affected numbers immediately on click.
            transition: focusRelated
              ? "filter 100ms ease-out, opacity 100ms ease-out"
              : "filter 220ms, opacity 220ms",
            // Lock interactions on every row while the modal is open —
            // even rows that float crisp above the backdrop should not
            // catch clicks or hovers. The modal is the only focus.
            pointerEvents: (revealed && !modalOpen) ? "auto" : "none",
            minWidth: 0,
            ...(elevate ? { position: "relative", zIndex: 1002 } : {}),
          }}>
            <div style={{
              visibility: visible ? "visible" : "hidden",
              transition: "visibility 220ms",
            }}>
              <BenefitItemRow
                item={i} model={model} A={A} assumptions={assumptions}
                setAssumption={setAssumption} viewOnly={viewOnly}
                opacity={dimmedOpacity}
                isExpanded={isSelected}
                hoveredId={hoveredId}
                onToggle={() => setOpenId(openId === i.id ? null : i.id)}
                onHoverChange={setHoveredId}
                horizon={horizon}
                // Column layout has no right-margin to spare — force the
                // compact path so assumption editors render inside the
                // expanded block, not floating off to the side.
                isMobile={true}
                scope={sc}
              />
            </div>
          </div>
        );
      })}
      {/* Phantom rows pad shorter columns up to maxRows so the horizontal
          rules line up across columns. Empty content, same border treatment. */}
      {Array.from({ length: phantomCount }).map((_, idx) => (
        <div key={`__phantom_${idx}`} style={{
          borderTop: renderedRows.length === 0 && idx === 0 ? "1px solid var(--line)" : "none",
          borderBottom: "1px solid var(--line)",
          minWidth: 0,
        }} />
      ))}
    </div>
  );
};

// Group benefit items by kind, render a small header per kind, and use
// BenefitItemRow for each. Handles per-item click-to-expand state.
const BenefitsBreakdown = ({ items, scopeLevel, activeKind, focusedAssumptionId, revealedKinds, onRevealKind, headlineByKind, model, A, assumptions, setAssumption, viewOnly, horizon, isMobile, openId, setOpenId, hoveredId, setHoveredId }) => {
  const order = [
    { kind: "revenue_uplift", label: "Revenue increases" },
    { kind: "cost_saving",    label: "Cost savings" },
    { kind: "qualitative",    label: "Qualitative benefits" },
  ];
  const groups = order.map(({ kind, label }) => ({
    kind, label,
    rows: items.filter(i => (i.benefitKind || "qualitative") === kind),
  }));
  const maxRows = Math.max(0, ...groups.map(g => g.rows.length));
  const useSubgrid = !isMobile;
  // Qualitative is dollarless and the labels are short, so this column
  // gets a slightly tighter share. The freed width keeps the overall
  // table narrower and leaves more page margin for side popovers.
  const colTemplate = "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr)";
  return (
    <div style={useSubgrid ? {
      display: "grid",
      gridTemplateColumns: colTemplate,
      gridTemplateRows: `auto repeat(${maxRows}, auto)`,
      columnGap: 14,
    } : {
      display: "flex", flexDirection: "column", gap: 22,
    }}>
      {groups.map(({ kind, label, rows }, colIdx) => (
        <BenefitColumn
          key={kind}
          kind={kind} label={label} rows={rows}
          scopeLevel={scopeLevel}
          maxRows={maxRows} colIdx={colIdx} useSubgrid={useSubgrid}
          activeKind={activeKind}
          focusedAssumptionId={focusedAssumptionId}
          revealed={revealedKinds ? revealedKinds.has(kind) : false}
          onReveal={onRevealKind}
          headlineValue={headlineByKind ? headlineByKind[kind] : 0}
          model={model} A={A} assumptions={assumptions}
          setAssumption={setAssumption}
          viewOnly={viewOnly} horizon={horizon}
          openId={openId} setOpenId={setOpenId}
          hoveredId={hoveredId} setHoveredId={setHoveredId}
        />
      ))}
    </div>
  );
};

// Tooltip-style estimate editor. Anchored adjacent to the clicked row
// (positioned via getBoundingClientRect on the row's data-attribute).
// A very light backdrop fade dims the rest of the page; the card itself
// is borderless with a soft shadow. Click anywhere outside the card
// (or press Esc) to dismiss.
const POPOVER_WIDTH = 420;
const POPOVER_FADE_IN_MS = 600;
const POPOVER_FADE_OUT_MS = 140;

const EstimateModal = ({ item, model, A, assumptions, setAssumption, viewOnly, horizon, onClose, onFocusAssumption, attribution }) => {
  const [mounted, setMounted] = React.useState(!!item);
  const [shown, setShown] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0, width: POPOVER_WIDTH, placement: "below" });
  // Cache last non-null item so content doesn't blank during fade-out.
  const lastItemRef = React.useRef(item);
  if (item) lastItemRef.current = item;
  const cardRef = React.useRef(null);

  const measure = React.useCallback(() => {
    const it = lastItemRef.current;
    if (!it) return;
    const row = document.querySelector(`[data-benefit-row-id="${CSS.escape(it.id)}"]`);
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const cardH = cardRef.current ? cardRef.current.offsetHeight : 320;
    const vw = window.innerWidth, vh = window.innerHeight;
    const gap = 12;
    const kind = it.benefitKind || "qualitative";

    // Don't let the popover overlap headline figures that need to stay
    // visible while the user edits assumptions — the Benefits row total
    // at the top of the page, and the active column's subtotal header.
    const headlineFloors = [];
    const benefitsHeader = document.querySelector('[data-landing-row="benefits"]');
    if (benefitsHeader) {
      const r = benefitsHeader.getBoundingClientRect();
      if (r.bottom > 0 && r.bottom < vh) headlineFloors.push(r.bottom);
    }
    const colHeader = document.querySelector(`[data-benefit-column-header="${kind}"]`);
    if (colHeader) {
      const r = colHeader.getBoundingClientRect();
      if (r.bottom > 0 && r.bottom < vh) headlineFloors.push(r.bottom);
    }
    const minTop = (headlineFloors.length ? Math.max(...headlineFloors) : 0) + 8;

    // Qualitative: open directly below its row (no dollar to read alongside,
    // and the narrower qualitative column makes a side popup awkward).
    if (kind === "qualitative") {
      const width = POPOVER_WIDTH;
      let left = rect.left;
      if (left + width > vw - 16) left = vw - width - 16;
      if (left < 16) left = 16;
      let top = rect.bottom + gap;
      let placement = "below";
      if (top + cardH > vh - 16) {
        const aboveTop = rect.top - cardH - gap;
        if (aboveTop >= minTop) { top = aboveTop; placement = "above"; }
        else top = Math.max(minTop, vh - cardH - 16);
      }
      top = Math.max(top, minTop);
      setPos({ top, left, width, placement });
      return;
    }

    // Revenue uplift opens left of its row, cost saving opens right.
    // The width adapts to the side's available space so the card never
    // overlaps its source column.
    const MIN_W = 260;
    let left, placement, width;
    if (kind === "cost_saving") {
      const available = (vw - 16) - (rect.right + gap);
      width = Math.max(MIN_W, Math.min(POPOVER_WIDTH, available));
      left = rect.right + gap;
      placement = "right";
    } else {
      const available = rect.left - gap - 16;
      width = Math.max(MIN_W, Math.min(POPOVER_WIDTH, available));
      left = rect.left - width - gap;
      placement = "left";
    }
    // Final viewport-edge clamps (only matter if MIN_W can't fit).
    if (left + width > vw - 16) left = vw - width - 16;
    if (left < 16) left = 16;
    // Vertically center the card on the row, then clamp so it sits below
    // the headline floor and within the viewport bottom.
    let top = rect.top + rect.height / 2 - cardH / 2;
    top = Math.max(top, minTop);
    if (top + cardH > vh - 16) top = Math.max(minTop, vh - cardH - 16);
    setPos({ top, left, width, placement });
  }, []);

  React.useLayoutEffect(() => {
    if (item) {
      setMounted(true);
      measure();
      return;
    }
    // Close path runs in useLayoutEffect (not useEffect) so setShown(false)
    // commits in the same paint as the parent's elevation drops. Otherwise
    // the previously-elevated row/headline/total would render for one
    // frame behind a backdrop still applying its blur filter.
    setShown(false);
    const t = setTimeout(() => setMounted(false), POPOVER_FADE_OUT_MS);
    return () => clearTimeout(t);
  }, [item, measure]);

  React.useEffect(() => {
    if (!item) return;
    const r = requestAnimationFrame(() => setShown(true));
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [item, measure]);

  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;
  const displayItem = lastItemRef.current;
  if (!displayItem) return null;
  const pv = model.perItem[displayItem.id]?.grossPV ?? 0;
  const isQualitative = (displayItem.benefitKind || "qualitative") === "qualitative";
  const usedIds = Array.isArray(displayItem.uses) ? displayItem.uses : [];
  const usedAssumptions = (assumptions || []).filter(a => usedIds.includes(a.id));

  return (
    <>
      {/* Backdrop: blur fades in gradually so the page recedes softly.
          Light dim + mild blur — both animated by opacity on this layer.
          Stays inside `.page-shell` so that elements with explicit
          `z-index: 1002` (active benefit row, active column headline,
          focus-related rows in other columns, Total overlay) remain in
          the same stacking context as the backdrop and can render
          above it. */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.05)",
          // Drop the blur the instant we're closing. If it lingered with
          // the dim fade-out, elements that lose their z-index elevation
          // would briefly fall behind a still-blurring backdrop, flashing
          // back to blurred for ~140ms before clearing.
          backdropFilter: shown ? "blur(6px) grayscale(1)" : "none",
          WebkitBackdropFilter: shown ? "blur(6px) grayscale(1)" : "none",
          opacity: shown ? 1 : 0,
          transition: shown
            ? `opacity ${POPOVER_FADE_IN_MS}ms var(--ease-expo)`
            : `opacity ${POPOVER_FADE_OUT_MS}ms ease-out`,
          // While the backdrop fades out, ignore pointer events so the
          // user can immediately click another row without waiting for
          // the fade to finish.
          pointerEvents: shown ? "auto" : "none",
        }}
      />
      {/* Card portaled to document.body so its `position: fixed`
          resolves against the viewport. Inside `.page-shell` the
          ancestor `filter: saturate(...)` establishes a containing
          block for fixed-positioned descendants, which makes the
          popover drift away from the row by scrollY pixels. */}
      {item && ReactDOM.createPortal((
      <div
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: pos.top, left: pos.left,
          width: pos.width, maxWidth: "calc(100vw - 32px)",
          zIndex: 1001,
          background: "var(--surface)",
          borderRadius: 12,
          padding: "18px 20px",
          boxShadow: "0 18px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        {displayItem.desc && (
          <div style={{
            fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)",
          }}>{displayItem.desc}</div>
        )}
        {usedAssumptions.length > 0 && (() => {
          // Split into two groups by rhetorical role:
          //   • Commitments — outcomes the implementer controls (and can
          //     be held to). Marked with a left-edge accent.
          //   • Assumptions — facts about the buyer's world. Confirmable
          //     by the audience; no commitment is being made.
          const commitments = usedAssumptions.filter(a => a.controllable);
          const worldFacts  = usedAssumptions.filter(a => !a.controllable);
          const sectionEyebrow = {
            fontSize: 9.5, color: "var(--muted-2)",
            letterSpacing: "0.12em", textTransform: "uppercase",
            fontWeight: 500, marginBottom: 4,
          };
          const renderEditor = (a, opts = {}) => {
            return (
            <div
              key={a.id}
              style={{
                display: "flex", flexDirection: "column", gap: 4,
                ...(opts.commitment ? {
                  padding: "6px 9px",
                  background: "color-mix(in srgb, var(--green-deep) 8%, transparent)",
                  borderLeft: "1px solid color-mix(in srgb, var(--green-deep) 40%, transparent)",
                  borderRadius: 3,
                } : {}),
              }}
              onFocus={() => onFocusAssumption && onFocusAssumption(a.id)}
              onBlur={() => onFocusAssumption && onFocusAssumption(null)}
            >
              <div style={{
                fontSize: 11, color: "var(--muted-2)", letterSpacing: "0.04em",
              }}>{a.label}</div>
              <InlineAssumptionEditor
                a={a} value={A[a.id]}
                onChange={v => setAssumption(a.id, v)}
                disabled={viewOnly}
              />
            </div>
            );
          };
          return (
            <div style={{
              display: "flex", flexDirection: "column", gap: 14,
              borderTop: "1px solid var(--line)", paddingTop: 12,
            }}>
              {commitments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={sectionEyebrow}>Our commitments</div>
                  {commitments.map(a => renderEditor(a, { commitment: true }))}
                </div>
              )}
              {worldFacts.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {commitments.length > 0 && (
                    <div style={sectionEyebrow}>Assumptions about your business</div>
                  )}
                  {worldFacts.map(a => renderEditor(a))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
      ), document.body)}
    </>
  );
};

// Sharp-cornered, large-type value editor used inside the commitment
// target rows. Distinct from the InlineAssumptionEditor used elsewhere
// (which has rounded corners + a smaller mono font + a provenance
// popover) — here we want the value to land like a confident headline
// next to the target name.
const TargetValueEditor = ({ a, value, onChange, disabled }) => {
  const [text, setText] = React.useState(() => String(value ?? a.value));
  const [focused, setFocused] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  React.useEffect(() => { setText(String(value ?? a.value)); }, [value, a.value]);

  // Sensible hard bounds by unit. Percentages stay in 0–100, percentage
  // points in -100..100, hours/dollars non-negative. The assumption's
  // sensitivityRange (multipliers on the base value) is treated as a
  // soft outer bound — values outside it are still allowed, but
  // flagged with a warning border.
  const hardBounds = React.useMemo(() => {
    const u = (a.unit || "").trim();
    if (u === "%")        return { lo: 0,   hi: 100 };
    if (u === "pp")       return { lo: -100, hi: 100 };
    if (u === "hrs")      return { lo: 0,   hi: Infinity };
    if (u === "$"  || u === "$/yr" || u === "$/hr") return { lo: 0, hi: Infinity };
    if (u === "/yr" || u === "/mo") return { lo: 0, hi: Infinity };
    return { lo: -Infinity, hi: Infinity };
  }, [a.unit]);
  const softBounds = React.useMemo(() => {
    const r = a.sensitivityRange;
    if (!r || !Number.isFinite(r.lo) || !Number.isFinite(r.hi)) return null;
    const base = Number.isFinite(a.value) ? a.value : 0;
    return { lo: base * r.lo, hi: base * r.hi };
  }, [a.sensitivityRange, a.value]);

  const handle = (s) => {
    setText(s);
    const n = parseFloat(s);
    if (isNaN(n) || !isFinite(n)) { setInvalid(true); return; }
    // Hard clamp — silently corrected on commit (blur).
    const clamped = Math.max(hardBounds.lo, Math.min(hardBounds.hi, n));
    // Soft bounds drive the warning border; we don't reject the value.
    const soft = softBounds
      ? (clamped < softBounds.lo || clamped > softBounds.hi)
      : false;
    setInvalid(soft);
    onChange(clamped);
  };
  const commit = (s) => {
    handle(s);
    const n = parseFloat(s);
    if (!isNaN(n) && isFinite(n)) {
      const clamped = Math.max(hardBounds.lo, Math.min(hardBounds.hi, n));
      if (clamped !== n) setText(String(clamped));
    }
    setFocused(false);
  };

  const borderColor = invalid
    ? "var(--red-deep)"
    : (focused ? "var(--ink)" : "var(--line-strong)");

  // Format the soft-bound range for the inline hint shown when a
  // value drifts outside its sensitivityRange.
  const fmtBound = (v) => {
    if (!Number.isFinite(v)) return "—";
    if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString();
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1).replace(/\.0$/, "");
  };
  const boundsHint = invalid && softBounds
    ? `Expected ${fmtBound(softBounds.lo)}–${fmtBound(softBounds.hi)}${a.unit ? " " + a.unit : ""}`
    : null;

  return (
    <div style={{ width: "100%" }}>
    <div style={{
      display: "flex", alignItems: "baseline",
      width: "100%",
      border: `1px solid ${borderColor}`,
      // No borderRadius — sharp corners for the editorial look.
      background: "var(--surface)",
      opacity: disabled ? 0.5 : 1,
      transition: "border-color 120ms",
      padding: "8px 12px",
      minWidth: 0, boxSizing: "border-box",
    }}>
      <input
        type="text" inputMode="decimal" value={text}
        disabled={disabled}
        step={a.step || 1}
        aria-invalid={invalid || undefined}
        title={invalid && softBounds
          ? `Outside the expected range (${softBounds.lo}–${softBounds.hi})`
          : undefined}
        onChange={e => handle(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        style={{
          flex: 1, minWidth: 0,
          background: "transparent", border: "none", outline: "none",
          padding: 0,
          fontFamily: "var(--mono)", fontSize: 20, fontWeight: 600,
          color: "var(--ink)", textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      />
      {a.unit && (
        <span style={{
          fontSize: 14, color: "var(--muted-2)", fontFamily: "var(--mono)",
          fontWeight: 500, marginLeft: 6, whiteSpace: "nowrap",
          flex: "0 0 auto",
        }}>{a.unit}</span>
      )}
    </div>
    {boundsHint && (
      <div
        role="status"
        style={{
          fontFamily: "var(--sans)", fontSize: 10.5,
          color: "var(--red-deep)", lineHeight: 1.3,
          marginTop: 4, letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
      >{boundsHint}</div>
    )}
    </div>
  );
};

// Single row of the landing-page "targets" lead-in. Renders the editor
// on the left + the target name and a small muted description on the
// right. When `confirmable` is set, a "Sounds right" button appears on
// the far right; the value input is already editable in place.
const CommitmentTargetRow = ({
  a, value, setAssumption, viewOnly, accentColor,
  confirmable, confirmed, onToggleConfirm, confirmLabel,
}) => {
  const accent = accentColor || "var(--green-deep)";
  // Per-row description is progressive disclosure: visually hidden by
  // default, revealed on hover or keyboard focus of the row. The text
  // is always in the DOM (sr-only when hidden) so screen-reader users
  // tabbing through the row reach it via aria-describedby.
  const [showDesc, setShowDesc] = React.useState(false);
  const hasDesc = !!a.description;
  const descId = `desc-${a.id}`;
  return (
    <div
      onMouseEnter={hasDesc ? () => setShowDesc(true) : undefined}
      onMouseLeave={hasDesc ? () => setShowDesc(false) : undefined}
      onFocus={hasDesc ? () => setShowDesc(true) : undefined}
      onBlur={hasDesc ? (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setShowDesc(false);
      } : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        paddingLeft: 15, paddingRight: 12,
        paddingTop: 8, paddingBottom: 8,
        // A 1px hairline (under the side-stripe ban threshold) plus
        // an 8% wash gives the row a quiet architectural marker
        // without the version-control-diff aesthetic.
        background: `color-mix(in srgb, ${accent} 8%, transparent)`,
        borderLeft: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
        borderRadius: 3,
      }}
    >
      {/* Editor on the LEFT — sharp corners + larger numeric so the
          target value reads as the strongest element of the row. Fixed
          width across all rows so the editors form a clean vertical
          rail aligned to the label column. */}
      <div style={{ width: 150, flex: "0 0 150px" }}>
        <TargetValueEditor
          a={a} value={value}
          onChange={v => setAssumption(a.id, v)}
          disabled={viewOnly}
        />
      </div>
      <div style={{
        flex: "1 1 auto", minWidth: 0,
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <span style={{
          fontFamily: "var(--serif)", fontWeight: 500,
          fontSize: 18, color: "var(--ink)",
          letterSpacing: "-0.005em",
          lineHeight: 1.25,
        }}>
          {a.label}
        </span>
        {hasDesc && (
          <span
            id={descId}
            style={showDesc ? {
              fontFamily: "var(--serif)", fontStyle: "italic",
              fontSize: 13.5, color: "var(--muted)",
              lineHeight: 1.4,
              animation: "fadeIn 160ms var(--ease-quart)",
            } : {
              // sr-only: in DOM and reachable via aria-describedby,
              // invisible to sighted users until hover/focus reveals it.
              position: "absolute", width: 1, height: 1,
              padding: 0, margin: -1, overflow: "hidden",
              clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
            }}
          >{a.description}</span>
        )}
      </div>
      {confirmable && (
        <button
          type="button"
          onClick={onToggleConfirm}
          aria-pressed={!!confirmed}
          aria-label={`${confirmLabel || "Sounds right"}: ${a.label}`}
          aria-describedby={hasDesc ? descId : undefined}
          style={{
            flex: "0 0 auto",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontFamily: "var(--sans)", fontSize: 12, fontWeight: 600,
            letterSpacing: "0.01em",
            borderRadius: 999,
            border: `1.5px solid ${confirmed ? "var(--green-deep)" : "var(--line-strong)"}`,
            background: confirmed ? "var(--green-deep)" : "transparent",
            color: confirmed ? "var(--bg)" : "var(--ink-2)",
            padding: "6px 12px",
            cursor: "pointer", whiteSpace: "nowrap",
            transition: "background 160ms ease, color 160ms ease, border-color 160ms ease",
          }}
        >
          <IconCheck size={13} stroke={2.4} />
          {confirmLabel || "Sounds right"}
        </button>
      )}
    </div>
  );
};

// Popsicle-stick tab that sits at the bottom-right of the viewport. The
// rounded top peeks above the viewport edge by default; on hover it slides
// up and a small "Assumptions" label appears next to it. Clicking opens
// the full assumptions grid (AssumptionsGrid). Mounted after the world
// confirmation has been completed once — the tab is the persistent
// re-entry point for editing every assumption.
const AssumptionsTab = ({ visible, onClick }) => {
  const [hovered, setHovered] = React.useState(false);
  const [entered, setEntered] = React.useState(false);

  // Small head-start delay so the dialog's cards have time to begin
  // falling away before the tab springs up. The tab is intentionally
  // mid-motion while the cards are still in motion — they read as the
  // same gesture: large surface compressing into a small handle.
  React.useEffect(() => {
    if (!visible) { setEntered(false); return; }
    const t = setTimeout(() => setEntered(true), 150);
    return () => clearTimeout(t);
  }, [visible]);

  // Translation states (all measured from the tab's home "peeking" pose):
  //   off-screen: translateY(40px) — fully hidden below the viewport
  //   resting:    translateY(14px) — just the rounded top visible
  //   hovered:    translateY(-2px) — slides up to reveal the full body
  const tabTransform = !visible || !entered
    ? "translateY(40px)"
    : (hovered ? "translateY(-2px)" : "translateY(14px)");

  return (
    <div style={{
      position: "fixed", bottom: 0, right: 40,
      zIndex: 60,
      display: "flex", alignItems: "flex-end", gap: 10,
      pointerEvents: visible ? "auto" : "none",
    }}>
      {/* Label: slides in from the right and fades on hover. Sits above
          the tab's rounded top so the visual relation is "label perched
          on the stick." */}
      <span style={{
        fontFamily: "var(--sans)",
        fontSize: 12, fontWeight: 500, color: "var(--ink)",
        background: "var(--surface)",
        padding: "5px 10px", borderRadius: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px var(--line)",
        marginBottom: 18,
        whiteSpace: "nowrap",
        opacity: hovered && entered ? 1 : 0,
        transform: hovered ? "translateX(0)" : "translateX(8px)",
        transition: "opacity 200ms ease, transform 220ms var(--ease-quart)",
        pointerEvents: "none",
      }}>Assumptions</span>

      {/* The stick itself — top corners rounded, flat bottom flush with
          the viewport edge. Soft shadow above to lift it off the page. */}
      <button
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
        aria-label="Open assumptions"
        style={{
          width: 72, height: 36,
          background: "var(--ink-2)",
          borderRadius: "20px 20px 0 0",
          border: "none",
          cursor: "pointer",
          color: "var(--bg)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          boxShadow: hovered
            ? "0 -6px 18px rgba(0,0,0,0.14), 0 -1px 0 rgba(0,0,0,0.05)"
            : "0 -4px 12px rgba(0,0,0,0.08)",
          transform: tabTransform,
          // Quiet entrance (expo); quart on the resting / hover swap.
          transition: !entered
            ? "transform 460ms var(--ease-expo)"
            : "transform 240ms var(--ease-quart), box-shadow 200ms ease",
        }}
      >
        {/* Tiny three-dot grip mark so the user reads it as a handle. */}
        <span style={{
          display: "inline-flex", gap: 3,
          opacity: 0.85,
        }}>
          <span style={{ width: 3, height: 3, borderRadius: 999, background: "#FFFFFF" }} />
          <span style={{ width: 3, height: 3, borderRadius: 999, background: "#FFFFFF" }} />
          <span style={{ width: 3, height: 3, borderRadius: 999, background: "#FFFFFF" }} />
        </span>
      </button>
    </div>
  );
};

// Full-page assumptions editor. Opens when the AssumptionsTab is clicked.
// Lays out every assumption in two rhetorical sections (commitments first,
// then world facts) so the contractable-vs-confirmable distinction stays
// visible. Each row is a label + inline value editor; the underlying
// `setAssumption` mechanism is shared with the per-benefit popovers.
//
// A scope picker (1 / 1-2 / 1-2-3) at the top filters the rows to only
// those whose assumptions feed an item at or below the chosen scope.
// Costs are always counted as scope-1 (they always sit in the load-bearing
// case). Discount rate sits in every PV calculation so it's pinned.
const AssumptionsGrid = ({ assumptions, items, A, setAssumption, viewOnly, confirmedAssumptions, onToggleConfirm, onClose }) => {
  const [shown, setShown] = React.useState(false);
  // Always default to scope-1 — the load-bearing case is the reader's
  // first port of call. They can dial it up via the picker if they want
  // to see the bonus-upside assumptions too.
  const [scopeFilter, setScopeFilter] = React.useState(1);
  React.useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Build assumption_id -> Set of scopes that reference it via item.uses.
  // Costs and items without a recognised scope land at scope 1.
  const usedInScopes = React.useMemo(() => {
    const map = {};
    for (const it of (items || [])) {
      const sc = it.kind === "cost"
        ? 1
        : ([1, 2, 3].includes(it.scope) ? it.scope : 1);
      for (const uid of (it.uses || [])) {
        if (!map[uid]) map[uid] = new Set();
        map[uid].add(sc);
      }
    }
    return map;
  }, [items]);

  const matchesScope = (a) => {
    // discount_rate isn't in any item's `uses` but it gates every PV
    // calculation, so it's always relevant.
    if (a.id === "discount_rate") return true;
    const scopes = usedInScopes[a.id];
    if (!scopes) return true; // orphaned — show so user can still edit
    for (const s of scopes) if (s <= scopeFilter) return true;
    return false;
  };

  const commitments = (assumptions || []).filter(a => a.controllable && matchesScope(a));
  const worldFacts  = (assumptions || []).filter(a => !a.controllable && matchesScope(a));

  const renderRow = (a, commitment) => {
    const isConfirmed = !!(confirmedAssumptions && confirmedAssumptions[a.id]);
    return (
      <div
        key={a.id}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) 36px",
          gap: 14, alignItems: "center",
          padding: "10px 18px 10px 17px",
          borderBottom: "1px solid var(--line)",
          // Commitments get a faint green wash + 1px hairline marker
          // — same "this is a promise" signal, no diff-bar aesthetic.
          ...(commitment ? {
            background: "color-mix(in srgb, var(--green-deep) 7%, transparent)",
            borderLeft: "1px solid color-mix(in srgb, var(--green-deep) 35%, transparent)",
          } : {}),
          ...(isConfirmed ? {
            background: "color-mix(in srgb, var(--green-deep) 5%, transparent)",
          } : {}),
          transition: "background 180ms ease",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: "var(--ink)",
            letterSpacing: "-0.005em",
          }}>{a.label}</div>
          {a.description && (
            <div style={{
              fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.45,
            }}>{a.description}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineAssumptionEditor
              a={a} value={A[a.id]}
              onChange={v => setAssumption(a.id, v)}
              disabled={viewOnly}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleConfirm && onToggleConfirm(a.id)}
          title={isConfirmed ? "Confirmed" : "Unconfirmed"}
          aria-label={isConfirmed ? "Confirmed" : "Unconfirmed"}
          aria-pressed={isConfirmed}
          style={{
            width: 26, height: 26, borderRadius: 999,
            border: isConfirmed
              ? "1px solid var(--green-deep)"
              : "1px solid var(--line-strong)",
            background: isConfirmed ? "var(--green-deep)" : "var(--surface)",
            color: isConfirmed ? "#FFFFFF" : "var(--muted-2)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            transition: "background 180ms ease, border-color 180ms ease, color 180ms ease",
            padding: 0, lineHeight: 0,
          }}
        >
          <IconCheck size={13} stroke={isConfirmed ? 2.6 : 1.8} />
        </button>
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        background: "rgba(0,0,0,0.18)",
        backdropFilter: shown ? "blur(6px)" : "none",
        WebkitBackdropFilter: shown ? "blur(6px)" : "none",
        opacity: shown ? 1 : 0,
        transition: "opacity 320ms var(--ease-quint)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 720, width: "100%", maxHeight: "calc(100vh - 48px)",
          background: "var(--surface)",
          border: "1px solid var(--line-strong)", borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
          display: "flex", flexDirection: "column",
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 320ms ease, transform 360ms var(--ease-expo)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 24px 14px",
          borderBottom: "1px solid var(--line)",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 16,
          }}>
            <div>
              <div style={{
                fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500,
                letterSpacing: "-0.01em", color: "var(--ink)",
              }}>All assumptions</div>
              <div style={{
                fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.5,
              }}>
                Edit any value to see the model update live. Outcomes we'll deliver are bordered green; world facts are everything else.
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                border: "none", background: "transparent",
                color: "var(--muted)", cursor: "pointer",
                fontSize: 22, lineHeight: 1, padding: 4,
              }}
            >×</button>
          </div>
          {/* Scope filter — narrows the visible assumption rows to those
              feeding items at or below the chosen scope. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 10.5, color: "var(--muted-2)",
              letterSpacing: "0.12em", textTransform: "uppercase",
              fontWeight: 500, whiteSpace: "nowrap",
            }}>Show assumptions for</span>
            <ScopeScale level={scopeFilter} onSetLevel={setScopeFilter} />
          </div>
        </div>

        {/* Body — scrollable when overflowing the viewport. */}
        <div style={{
          overflowY: "auto",
          padding: "0 0 24px",
        }}>
          {/* World facts first — these are what the audience is being
              asked to confirm, so they lead the page. */}
          {worldFacts.length > 0 && (
            <>
              <div style={{
                fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500,
                color: "var(--ink)", letterSpacing: "-0.015em", lineHeight: 1.1,
                padding: "28px 24px 14px",
              }}>Assumptions about your business</div>
              <div>
                {worldFacts.map(a => renderRow(a, false))}
              </div>
            </>
          )}
          {commitments.length > 0 && (
            <>
              <div style={{
                fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500,
                color: "var(--ink)", letterSpacing: "-0.015em", lineHeight: 1.1,
                padding: "32px 24px 14px",
                // No top rule — each row already carries a bottom border,
                // so adding one here would read as a double line between
                // the last world-fact row and this heading.
              }}>Our commitments</div>
              <div>
                {commitments.map(a => renderRow(a, true))}
              </div>
            </>
          )}
          {commitments.length === 0 && worldFacts.length === 0 && (
            <div style={{
              padding: "60px 24px", textAlign: "center",
              color: "var(--muted)", fontSize: 13, lineHeight: 1.5,
            }}>
              No assumptions match this scope filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MinimalLanding = (props) => {
  const {
    adjustedItems, model,
    A, assumptions,
    horizon, viewOnly, isMobile,
    selectedItemId, onSelectItem, onHoverItem,
    onAddItem, onRemoveItem, onEditItem,
    scopeLevel, onSetScopeLevel,
    confirmedAssumptions, markAssumptionConfirmed,
    commitmentsConfirmed, setCommitmentsConfirmed,
    worldProceedClicked, setWorldProceedClicked,
  } = props;
  // Below ~1100px the marginalia operators (Now/And/Then/Risks)
  // start clipping past the viewport edge. Collapse them inline at
  // that breakpoint, same shape as the mobile path.
  const isNarrow = useIsMobile(1100);
  const collapseMarginalia = isMobile || isNarrow;

  const [open, setOpen] = React.useState(() => new Set());
  const toggle = (k) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Shared across Benefits and Costs so hovering a row in one section
  // overrides any locked-open row in the other (no duplicate marginalia).
  const [openItemId, setOpenItemId] = React.useState(null);
  const [hoveredItemId, setHoveredItemId] = React.useState(null);
  // AND-section audit-trail visibility. Compact (commitment + name +
  // result per benefit) by default; expanded (multiplication chain
  // with confirmed factors) on demand. Per-session, not persisted —
  // the disclosure is for the math-curious reader.
  const [andShowMath, setAndShowMath] = React.useState(false);
  // Track whether the Costs row's headline is visible in the viewport
  // above the Total bar. When it's pushed off the page, the Total row
  // surfaces a small "−$Xk" hint so the viewer can still see the
  // subtraction chain Benefits − Costs = Total at a glance.
  const [costsRowVisible, setCostsRowVisible] = React.useState(true);
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = document.querySelector('[data-landing-row="costs"]');
    if (!el) return;
    // The Total bar at the bottom is ~100px tall; pull the bottom edge
    // of the observation viewport up so a costs row hidden behind it
    // counts as off-screen.
    const obs = new IntersectionObserver(
      ([entry]) => setCostsRowVisible(entry.isIntersecting),
      { rootMargin: "0px 0px -110px 0px", threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // When the user focuses an assumption input inside the estimate modal,
  // rows whose `uses` includes that assumption rise above the modal blur
  // so the user can watch their values move while editing.
  const [focusedAssumptionId, setFocusedAssumptionId] = React.useState(null);
  // Progressive-disclosure latch — once a benefit column has been hovered,
  // it stays unblurred for the rest of the session even if the benefits
  // drawer is collapsed and re-opened.
  const [revealedKinds, setRevealedKinds] = React.useState(() => new Set());
  const onRevealKind = React.useCallback((kind) => {
    setRevealedKinds(prev => {
      if (prev.has(kind)) return prev;
      const next = new Set(prev);
      next.add(kind);
      return next;
    });
  }, []);

  // Items by scope. Legacy items without a recognised scope fall into 1.
  const allBenefits = adjustedItems.filter(it => it.kind === "benefit");
  // Drives the "stay crisp above the modal blur" exemptions.
  const activeBenefit = allBenefits.find(b => b.id === openItemId) || null;
  const activeBenefitKind = activeBenefit?.benefitKind || null;
  const modalOpen = !!activeBenefit;

  // Drive the page-wide grayscale via the .page-shell filter when the
  // estimate modal is open. The popover's own `backdrop-filter` doesn't
  // visibly grayscale the page because backdrop-filter sampling is
  // broken inside a parent with `filter:` set — so we apply the effect
  // at the source instead.
  React.useEffect(() => {
    const shell = document.querySelector(".page-shell");
    if (!shell) return;
    if (modalOpen) shell.classList.add("is-greyscale");
    else shell.classList.remove("is-greyscale");
    return () => shell.classList.remove("is-greyscale");
  }, [modalOpen]);

  // Per-category sensitivity attribution. For each assumption, what share
  // of its category's total NPV swing does it contribute? Used to surface
  // "this is the input with the most weight inside its rhetorical
  // bucket" inside the estimate modal.
  //
  // Restricted to scope-1 outcomes (plus costs): the question being
  // answered is "which inputs drive the load-bearing case?" Scope-2 and
  // scope-3 benefits are bonus upside and excluded from this calculation
  // by design — otherwise they dilute the weighting with speculative
  // impact and obscure which commitments / world facts matter most.
  const attribution = React.useMemo(() => {
    if (typeof computeSensitivity !== "function") return null;
    const scope1Items = adjustedItems.filter(it =>
      it.kind === "cost" || (it.kind === "benefit" && (it.scope == null || it.scope === 1))
    );
    let sens;
    try {
      sens = computeSensitivity(scope1Items, A, props.assumptions);
    } catch (e) { return null; }
    const idToA = new Map((props.assumptions || []).map(a => [a.id, a]));
    const commitMap = {}, worldMap = {};
    let commitSum = 0, worldSum = 0;
    for (const s of sens) {
      const a = idToA.get(s.id);
      if (a?.controllable) {
        commitMap[s.id] = s.range;
        commitSum += s.range;
      } else {
        worldMap[s.id] = s.range;
        worldSum += s.range;
      }
    }
    const normalize = (m, total) => {
      const out = {};
      if (total > 0) for (const id in m) out[id] = m[id] / total;
      return out;
    };
    return {
      commit: normalize(commitMap, commitSum),
      world:  normalize(worldMap,  worldSum),
    };
  }, [adjustedItems, A, props.assumptions]);

  // Top 3 commitments by scope-1 sensitivity. Captured ONCE on first
  // successful sensitivity computation and then frozen for the rest of
  // the session — we don't want the lead-in's "targets" list to
  // reshuffle as the user tweaks individual values down toward zero
  // (which would otherwise drop a row out of the top-N and replace it
  // with another). Page reload re-captures.
  const [frozenTopCommitIds, setFrozenTopCommitIds] = React.useState(null);
  React.useEffect(() => {
    if (frozenTopCommitIds) return;
    if (!attribution || !attribution.commit) return;
    const ids = Object.keys(attribution.commit).slice(0, 3);
    if (ids.length === 0) return;
    setFrozenTopCommitIds(ids);
  }, [attribution, frozenTopCommitIds]);
  const topCommitments = React.useMemo(() => {
    const idsSource = frozenTopCommitIds
      || (attribution && attribution.commit ? Object.keys(attribution.commit).slice(0, 3) : null);
    if (!idsSource) return [];
    return idsSource
      .map(id => (props.assumptions || []).find(x => x.id === id))
      .filter(Boolean);
  }, [frozenTopCommitIds, attribution, props.assumptions]);

  // Mirror of the commitment-freeze: top 3 world facts by scope-1
  // sensitivity, captured once and frozen for the session. Powers the
  // NOW row at the top of the proof.
  const [frozenTopWorldIds, setFrozenTopWorldIds] = React.useState(null);
  React.useEffect(() => {
    if (frozenTopWorldIds) return;
    if (!attribution || !attribution.world) return;
    const ids = Object.keys(attribution.world).slice(0, 3);
    if (ids.length === 0) return;
    setFrozenTopWorldIds(ids);
  }, [attribution, frozenTopWorldIds]);
  const topWorldFacts = React.useMemo(() => {
    const idsSource = frozenTopWorldIds
      || (attribution && attribution.world ? Object.keys(attribution.world).slice(0, 3) : null);
    if (!idsSource) return [];
    return idsSource
      .map(id => (props.assumptions || []).find(x => x.id === id))
      .filter(Boolean);
  }, [frozenTopWorldIds, attribution, props.assumptions]);

  // Sequential-reveal bookkeeping. NOW and AND each step the reader
  // through the rows one at a time — the next row appears only after
  // the previous has been acknowledged. Source of truth is
  // `confirmedAssumptions`; counts feed each section's slice size.
  const worldConfirmedCount = React.useMemo(
    () => topWorldFacts.filter(a => confirmedAssumptions && confirmedAssumptions[a.id]).length,
    [topWorldFacts, confirmedAssumptions]
  );
  const allWorldConfirmed = topWorldFacts.length > 0
    && worldConfirmedCount === topWorldFacts.length;
  const commitmentConfirmedCount = React.useMemo(
    () => topCommitments.filter(a => confirmedAssumptions && confirmedAssumptions[a.id]).length,
    [topCommitments, confirmedAssumptions]
  );
  // Once every commitment has been acknowledged in AND, flip the
  // sticky `commitmentsConfirmed` flag — that reveals THEN + the
  // outcome table and persists across reloads so revisits don't
  // re-walk the staircase.
  React.useEffect(() => {
    if (commitmentsConfirmed) return;
    if (topCommitments.length === 0) return;
    if (commitmentConfirmedCount === topCommitments.length) {
      setCommitmentsConfirmed(true);
    }
  }, [commitmentConfirmedCount, topCommitments.length, commitmentsConfirmed, setCommitmentsConfirmed]);

  // ---- Shared breakdown helpers ------------------------------------
  // Used by the NOW baseline equation AND by the per-benefit
  // equations under "we hit the following targets" in AND. Each
  // factor that maps to a single assumption shows that assumption's
  // raw value with its unit; unconfirmed ones render as "?".
  const fmtValueWithUnit = (raw, unit) => {
    if (raw == null || !Number.isFinite(raw)) return "—";
    const u = unit || "";
    if (u === "$")    return fmtMoneyExact(raw);
    if (u === "$/yr") return fmtMoneyExact(raw) + "/yr";
    if (u === "$/hr") return fmtMoneyExact(raw) + "/hr";
    if (u === "%")    return `${raw}%`;
    return u ? `${raw} ${u}` : `${raw}`;
  };
  const factorIsConfirmed = (f) => {
    // When the math toggle is open, the reader has opted in to the
    // full audit trail — show all real values regardless of buyer
    // acknowledgment. The Okay gating is a UX device for the buyer,
    // not for an auditor inspecting the math.
    if (viewOnly || commitmentsConfirmed || andShowMath) return true;
    if (!f || !Array.isArray(f.ids) || f.ids.length !== 1) return true;
    return !!(confirmedAssumptions && confirmedAssumptions[f.ids[0]]);
  };
  const formatFactor = (f) => {
    const confirmed = factorIsConfirmed(f);
    if (f.ids.length === 1) {
      const aId = f.ids[0];
      const a = (props.assumptions || []).find(x => x.id === aId);
      if (a) {
        const change = a.change || null;
        if (!confirmed) return { value: "?", label: a.label, confirmed: false, change };
        const raw = (A && A[aId] != null) ? A[aId] : a.value;
        return { value: fmtValueWithUnit(raw, a.unit), label: a.label, confirmed: true, change };
      }
    }
    const v = f.eval(A);
    const rounded = Number.isFinite(v) ? Math.round(v).toLocaleString() : "—";
    return { value: rounded, label: f.src, confirmed: true, change: null };
  };

  // Commitment factors in AND are always scope-1 *benefits*, so they
  // render in the benefit-positive green. The diff-style add/remove/
  // modify convention was over-engineered for a non-financial buyer
  // (red on a benefit reads as warning). The `change` field stays in
  // the schema for future use; it's no longer threaded into the UI.
  const COMMITMENT_COLOR = "var(--green-deep)";

  const showOutcomeBlock = commitmentsConfirmed || topCommitments.length === 0;
  const scopeItems = (n) => allBenefits.filter(b =>
    n === 1 ? (b.scope === 1 || ![2, 3].includes(b.scope)) : b.scope === n
  );
  const s1Items = scopeItems(1);
  const s2Items = scopeItems(2);
  const s3Items = scopeItems(3);
  const costs   = adjustedItems.filter(it => it.kind === "cost");

  const pvSum = (arr) => arr.reduce(
    (s, it) => s + (model.perItem[it.id]?.grossPV ?? 0), 0
  );
  const s1PV = pvSum(s1Items);
  const s2PV = pvSum(s2Items);
  const s3PV = pvSum(s3Items);

  // Visible benefits (scope <= level), partitioned by kind for the
  // collapsed-Benefits summary sublabel.
  const visibleBens = allBenefits.filter(b => {
    const sc = [1,2,3].includes(b.scope) ? b.scope : 1;
    return sc <= scopeLevel;
  });
  const revenueUpliftPV = pvSum(visibleBens.filter(b => b.benefitKind === "revenue_uplift"));
  const costSavingPV    = pvSum(visibleBens.filter(b => b.benefitKind === "cost_saving"));

  // Items visible inside Benefits: scope <= scopeLevel.
  const visibleBenefits = allBenefits.filter(b => {
    const sc = [1,2,3].includes(b.scope) ? b.scope : 1;
    return sc <= scopeLevel;
  });

  // ---------------------------------------------------------------------
  // Display-rounding coordination. When the rounding toggle is on, every
  // arithmetic chain visible on screen — Revenue + CostSaving = Benefits
  // and Benefits − Costs = Total — must stay self-consistent. We round
  // each LEAF independently and derive composites from the rounded
  // leaves, so the user never sees "$500k − $100k = $500k".
  // ---------------------------------------------------------------------
  const __roundOn = !!(typeof window !== "undefined" && window.CBAGENT_ROUNDING);
  const __r = (v) => (__roundOn && typeof window !== "undefined" && window.niceRound)
    ? window.niceRound(v) : v;
  const revenueUpliftDisp = __r(revenueUpliftPV);
  const costSavingDisp = __r(costSavingPV);
  const benefitsTotalDisp = revenueUpliftDisp + costSavingDisp;
  const costsDisp = __r(pvSum(costs));
  const npvDisp = benefitsTotalDisp - costsDisp;
  // "Bonus" upside out of current scope. Derived per-kind so the bonus
  // figure tracks the displayed kind totals when scoped up later.
  const __bonusRev = __r(pvSum(
    allBenefits.filter(b => b.benefitKind === "revenue_uplift"
      && (b.scope === 2 && scopeLevel < 2 || b.scope === 3 && scopeLevel < 3))
  ));
  const __bonusSav = __r(pvSum(
    allBenefits.filter(b => b.benefitKind === "cost_saving"
      && (b.scope === 2 && scopeLevel < 2 || b.scope === 3 && scopeLevel < 3))
  ));
  const bonusDisp = __bonusRev + __bonusSav;
  const headlineByKind = {
    revenue_uplift: revenueUpliftDisp,
    cost_saving: costSavingDisp,
    qualitative: 0,
  };

  const yearTotalsCost = model.yearTotals.cost;
  const costYMax = Math.max(...yearTotalsCost, 1) * 1.05;
  const costSeries = costs.map(i => {
    const s = model.perItem[i.id];
    return { key: i.id, color: i.color, name: i.name, values: s.cash };
  });

  // First-run framing — appears once before the buyer has gone through
  // the NOW → AND → THEN staircase. Tells them what they're reading
  // and what they're about to do. Disappears once the proof has been
  // walked (commitmentsConfirmed flips sticky on first completion).
  const showFraming = !viewOnly && !commitmentsConfirmed;
  const interventionName =
    (typeof PROJECT_META !== "undefined" && (PROJECT_META.shortName || PROJECT_META.name))
    || "this proposal";

  return (
    <div style={{
      maxWidth: 1080, margin: "0 auto",
      padding: isMobile ? "40px 16px 80px" : "72px 28px 96px",
    }}>
      {showFraming && (
        <div style={{
          marginBottom: isMobile ? 32 : 56,
          maxWidth: 620,
        }}>
          <div style={{
            fontFamily: "var(--mono)", fontSize: 10,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: "var(--muted-2)", fontWeight: 600,
            marginBottom: 12,
          }}>The business case for {interventionName}</div>
          <p style={{
            margin: 0,
            fontFamily: "var(--serif)", fontStyle: "italic",
            fontSize: 18, lineHeight: 1.55,
            color: "var(--ink-2)", letterSpacing: "-0.005em",
          }}>
            A short walk-through. Confirm a few facts about your business,
            then we'll show what we'll change and what's likely to come of it.
          </p>
        </div>
      )}
      {/* Lead-in narrative — frames the table that follows as the
          conditional payoff of two specific commitments. The "targets"
          shown are the two commitments whose accuracy moves the
          scope-1 result the most. */}
      {topCommitments.length > 0 && (() => {
        // Operators bleed into the actual page margin via absolute
        // positioning — each row is `position: relative`, and the
        // operator anchors to `right: 100%` of that row (so its right
        // edge meets the row's left edge). On desktop the operators
        // float to the LEFT of the centered page column, sitting in
        // the real margin. On mobile they collapse to a header above
        // each block.
        const opStyle = (emphatic) => collapseMarginalia ? ({
          fontFamily: "var(--serif)",
          fontSize: 28, lineHeight: 1,
          fontWeight: emphatic ? 600 : 400,
          fontStyle: emphatic ? "normal" : "italic",
          color: "var(--muted)",
          opacity: 0.55,
          letterSpacing: "-0.02em",
          marginBottom: 6,
        }) : ({
          position: "absolute",
          right: "100%",
          // Generous gap between the operator (in the actual margin)
          // and the content column so the eye treats them as visually
          // distinct anchors rather than a tight label-content pair.
          marginRight: 56,
          top: -4,
          fontFamily: "var(--serif)",
          fontSize: 64, lineHeight: 1,
          fontWeight: emphatic ? 600 : 400,
          fontStyle: emphatic ? "normal" : "italic",
          // Lighter base colour + explicit opacity so the large serif
          // glyphs feel as faded as the body prose around them. At 64px,
          // pure --ink-2 stamps onto the page even at 50% page-saturation
          // because the type's sheer mass overwhelms the colour value.
          color: "var(--muted)",
          opacity: 0.55,
          letterSpacing: "-0.03em",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        });
        const conditionProse = {
          fontFamily: "var(--serif)", fontStyle: "italic",
          fontSize: 19, lineHeight: 1.5, color: "var(--ink-2)",
          margin: 0, letterSpacing: "-0.005em",
        };
        const rowStyle = {
          position: "relative",
          // Big vertical gap so each IF / AND / THEN block reads as its
          // own paragraph in the proof, not part of a tight stack.
          marginBottom: isMobile ? 44 : 96,
        };

        return (
          <div style={{
            marginBottom: 8,
            // When the estimate modal is open, explicitly dim and blur
            // the IF/AND/THEN narrative. The modal's `backdrop-filter`
            // doesn't reliably reach the absolute-positioned operators
            // inside the `.page-shell` filter context, so we apply the
            // recede effect at the source here.
            opacity: modalOpen ? 0.25 : 1,
            filter: modalOpen ? "blur(3px)" : "none",
            transition: "opacity 360ms ease, filter 360ms ease",
            pointerEvents: modalOpen ? "none" : "auto",
          }}>
            {/* NOW — base state of the business. The top-3 world facts
                by scope-1 sensitivity, rendered with the same row
                treatment as AND's commitment targets but in a neutral
                accent (these are observations, not promises). Anchors
                the reader on what is, before the proof walks them
                through what could be. */}
            {topWorldFacts.length > 0 && (() => {
              // Sequential reveal: show one more row than is currently
              // confirmed, capped at the total. In view-only mode (the
              // public share URL) and on revisits once the whole proof
              // has been completed before, reveal everything at once.
              const visibleCount = (viewOnly || commitmentsConfirmed)
                ? topWorldFacts.length
                : Math.min(worldConfirmedCount + 1, topWorldFacts.length);
              const visibleFacts = topWorldFacts.slice(0, visibleCount);

              // Baseline breakdown — what these world-fact assumptions
              // imply about the business *today*, before any of our
              // commitments land. Lets the reader sanity-check their
              // inputs against a number they already know (e.g. their
              // current annual revenue).
              const baselines = (typeof BASELINE !== "undefined" && Array.isArray(BASELINE))
                ? BASELINE : [];

              // Once the buyer has clicked "Let's proceed", the editing
              // UI collapses — only the resolved baseline equation
              // remains so the reader can keep that context visible
              // while the rest of the proof unfolds beneath.
              const collapsed = !!worldProceedClicked || !!viewOnly;
              return (
                <div style={rowStyle}>
                  <div style={opStyle(false)} aria-hidden>Now</div>
                  {!collapsed && (
                    <p style={conditionProse}>
                      the world looks like this — confirm what matches your business:
                    </p>
                  )}
                  {!collapsed && (
                    <div style={{
                      display: "flex", flexDirection: "column", gap: 8,
                      margin: "14px 0 0",
                    }}>
                      {visibleFacts.map((a, idx) => {
                        const isConfirmed = !!(confirmedAssumptions && confirmedAssumptions[a.id]);
                        const isLatest = !viewOnly && idx === visibleCount - 1 && !isConfirmed;
                        return (
                          <div key={a.id}
                               style={isLatest ? { animation: "fadeIn 360ms var(--ease-quint)" } : undefined}>
                            <CommitmentTargetRow
                              a={a}
                              value={(A && A[a.id] != null) ? A[a.id] : a.value}
                              setAssumption={props.setAssumption}
                              viewOnly={viewOnly}
                              accentColor={isConfirmed ? "var(--green-deep)" : "var(--muted)"}
                              confirmable={!viewOnly}
                              confirmed={isConfirmed}
                              onToggleConfirm={() =>
                                markAssumptionConfirmed(a.id, !isConfirmed)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {baselines.length > 0 && (
                    <div style={{
                      marginTop: collapsed ? 8 : 22,
                      paddingTop: collapsed ? 0 : 18,
                      borderTop: collapsed ? "none" : "1px dashed var(--line)",
                      display: "flex", flexDirection: "column", gap: 18,
                    }}>
                      {!collapsed && (
                        <div style={{
                          fontFamily: "var(--serif)", fontStyle: "italic",
                          fontSize: 13.5, color: "var(--muted)",
                          lineHeight: 1.5,
                        }}>
                          These imply:
                        </div>
                      )}
                      {baselines.map((b, bi) => {
                        const factors = b.factors.map(formatFactor);
                        const allConfirmed = factors.every(f => f.confirmed);
                        const total = b.eval(A);
                        const totalDisplay = allConfirmed
                          ? fmtValueWithUnit(total, b.unit)
                          : "?";
                        // Each cell becomes a 2-row grid column: value
                        // on top, label below — kept on the same lines
                        // across the whole row via the parent grid.
                        const cells = [];
                        factors.forEach((f, fi) => {
                          if (fi > 0) cells.push({ kind: "op", text: "×" });
                          cells.push({ kind: "factor", value: f.value, label: f.label, confirmed: f.confirmed });
                        });
                        cells.push({ kind: "op", text: "=" });
                        cells.push({ kind: "total", value: totalDisplay, label: b.label, confirmed: allConfirmed });
                        // The "Let's proceed" button only attaches to
                        // the FIRST baseline equation, and only when
                        // the whole NOW input has resolved and we're
                        // not yet past that gate.
                        const showProceed = !viewOnly
                          && !worldProceedClicked
                          && bi === 0
                          && allConfirmed;
                        return (
                          <div key={bi}>
                            <div style={{
                              fontFamily: "var(--mono)", fontSize: 10,
                              letterSpacing: "0.12em", textTransform: "uppercase",
                              color: "var(--muted-2)", fontWeight: 600,
                              marginBottom: 10,
                            }}>{b.label}</div>
                            <div style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 18, flexWrap: "wrap",
                            }}>
                              <div style={{
                                display: "grid",
                                gridTemplateColumns: `repeat(${cells.length}, max-content)`,
                                gridTemplateRows: "auto auto",
                                columnGap: 14, rowGap: 4,
                                alignItems: "baseline",
                                fontVariantNumeric: "tabular-nums",
                                overflowX: "auto",
                              }}>
                                {/* Row 1: values + operators */}
                                {cells.map((c, ci) => {
                                  if (c.kind === "op") {
                                    return (
                                      <div key={`v-${ci}`} style={{
                                        fontFamily: "var(--sans)", fontSize: 16,
                                        fontWeight: 400, color: "var(--muted)",
                                        lineHeight: 1.2,
                                      }}>{c.text}</div>
                                    );
                                  }
                                  const isTotal = c.kind === "total";
                                  const dim = !c.confirmed;
                                  return (
                                    <div key={`v-${ci}`} style={{
                                      fontFamily: "var(--mono)",
                                      fontSize: isTotal ? 18 : 16,
                                      fontWeight: isTotal ? 700 : 600,
                                      color: dim
                                        ? "var(--muted-2)"
                                        : (isTotal ? "var(--ink)" : "var(--ink-2)"),
                                      lineHeight: 1.2, whiteSpace: "nowrap",
                                      transition: "color 220ms ease",
                                    }}>{c.value}</div>
                                  );
                                })}
                                {/* Row 2: labels (blank under operators) */}
                                {cells.map((c, ci) => {
                                  if (c.kind === "op") return <div key={`l-${ci}`} />;
                                  return (
                                    <div key={`l-${ci}`} style={{
                                      fontFamily: "var(--sans)", fontSize: 10.5,
                                      color: "var(--muted-2)", lineHeight: 1.3,
                                      letterSpacing: "0.01em",
                                      whiteSpace: "nowrap",
                                    }}>{c.label}</div>
                                  );
                                })}
                              </div>
                              {showProceed && (
                                <button
                                  type="button"
                                  onClick={() => setWorldProceedClicked && setWorldProceedClicked(true)}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 8,
                                    fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600,
                                    letterSpacing: "0.02em",
                                    color: "#FFFFFF", background: "var(--green-deep)",
                                    border: "none", borderRadius: 999,
                                    padding: "9px 16px",
                                    cursor: "pointer",
                                    boxShadow: "0 6px 18px color-mix(in srgb, var(--green-deep) 28%, transparent)",
                                    transition: "transform 160ms ease, box-shadow 160ms ease",
                                    animation: "fadeIn 320ms var(--ease-expo)",
                                    whiteSpace: "nowrap",
                                    alignSelf: "center",
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                                >
                                  Let's proceed
                                  <IconArrowRight size={14} stroke={2.4} />
                                </button>
                              )}
                              {/* When the NOW editors are collapsed, an
                                  "Edit" link lets the consultant /
                                  buyer re-expand the rows mid-session
                                  without resetting commitmentsConfirmed
                                  or persistence. */}
                              {!viewOnly && worldProceedClicked && bi === 0 && (
                                <button
                                  type="button"
                                  onClick={() => setWorldProceedClicked && setWorldProceedClicked(false)}
                                  style={{
                                    background: "transparent", border: "none",
                                    padding: 0, cursor: "pointer",
                                    fontFamily: "var(--serif)", fontStyle: "italic",
                                    fontSize: 13, color: "var(--muted)",
                                    letterSpacing: "-0.005em",
                                    alignSelf: "center",
                                  }}
                                  title="Re-open the world-fact editors"
                                >
                                  <span style={{
                                    borderBottom: "1px solid var(--line-strong)",
                                    paddingBottom: 1,
                                  }}>Edit</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* AND — gated on the buyer having clicked "Let's
                proceed" after confirming every NOW input.
                Commitments are our promises, not facts the buyer can
                validate, so the per-row affordance is a soft
                acknowledgment ("Okay") that steps to the next one. */}
            {(viewOnly || commitmentsConfirmed || worldProceedClicked) && (() => {
              // All commitment rows are rendered up front — no
              // sequential reveal — so clicking "Okay" only changes
              // a row's state in place rather than pushing the rest
              // of the layout around.
              const visibleCommits = topCommitments;

              // Per-benefit breakdowns for scope-1 quantitative items:
              // each one's formula split into factors so the reader can
              // see how the dollar figure compounds from the inputs.
              // Cached per item via _grossSrc + splitMultiplicativeFactors.
              const itemFactorsCache = {};
              const factorsFor = (item) => {
                if (!item || !item._grossSrc) return [];
                if (itemFactorsCache[item.id]) return itemFactorsCache[item.id];
                const split = (typeof splitMultiplicativeFactors === "function")
                  ? splitMultiplicativeFactors(item._grossSrc) : [item._grossSrc];
                const ids = (props.assumptions || []).map(a => a.id);
                const factors = split.map(src => ({
                  src,
                  ids: extractAssumptionIds(src, ids),
                  eval: compileFormula(src, ids),
                }));
                itemFactorsCache[item.id] = factors;
                return factors;
              };
              const scope1Quant = adjustedItems.filter(it =>
                it.kind === "benefit"
                && (it.scope == null || it.scope === 1)
                && (it.benefitKind === "revenue_uplift" || it.benefitKind === "cost_saving")
              );
              const showBenefitBreakdowns = (viewOnly || commitmentsConfirmed)
                || commitmentConfirmedCount > 0;

              return (
            <div style={{ ...rowStyle,
                          animation: (viewOnly || commitmentsConfirmed) ? undefined : "fadeIn 360ms var(--ease-expo)" }}>
              <div style={opStyle(false)} aria-hidden>And</div>
              <p style={conditionProse}>we hit the following targets:</p>
              <div style={{
                display: "flex", flexDirection: "column", gap: 8,
                margin: "14px 0 0",
              }}>
                {visibleCommits.map((a) => {
                  const isConfirmed = !!(confirmedAssumptions && confirmedAssumptions[a.id]);
                  return (
                    <div key={a.id}>
                      <CommitmentTargetRow
                        a={a}
                        value={(A && A[a.id] != null) ? A[a.id] : a.value}
                        setAssumption={props.setAssumption}
                        viewOnly={viewOnly}
                        accentColor={isConfirmed || viewOnly || commitmentsConfirmed ? "var(--green-deep)" : "var(--muted)"}
                        confirmable={!viewOnly && !commitmentsConfirmed}
                        confirmed={isConfirmed}
                        confirmLabel="Okay"
                        onToggleConfirm={() =>
                          markAssumptionConfirmed(a.id, !isConfirmed)
                        }
                      />
                    </div>
                  );
                })}
              </div>

              {scope1Quant.length > 0 && (
                <div style={{
                  marginTop: 22, paddingTop: 18,
                  borderTop: "1px dashed var(--line)",
                  opacity: showBenefitBreakdowns ? 1 : 0.5,
                  transition: "opacity 240ms ease",
                }}>
                  <div style={{
                    fontFamily: "var(--serif)", fontStyle: "italic",
                    fontSize: 13.5, color: "var(--muted)",
                    lineHeight: 1.5, marginBottom: 14,
                  }}>
                    Which means each year:
                  </div>
                  {(() => {
                  // Partition by both time-shape and benefit kind so
                  // each homogeneous group gets the right subtotal
                  // framing. Recurring revenue uplifts collapse to a
                  // "+X% to recurring revenue" line (using the
                  // baseline revenue as the denominator). Recurring
                  // cost savings stay as $/yr absolute (we don't model
                  // a baseline cost to anchor a %). Lumps stay as $.
                  const recurringRev = scope1Quant.filter(it =>
                    !it.lump && it.benefitKind === "revenue_uplift");
                  const recurringCost = scope1Quant.filter(it =>
                    !it.lump && it.benefitKind === "cost_saving");
                  const lumps = scope1Quant.filter(it => it.lump);
                  const allConfirmedFor = (group) => group.every(it =>
                    factorsFor(it).map(formatFactor).every(f => f.confirmed)
                  );
                  const sumFor = (group) => group.reduce((s, it) => {
                    const series = model.perItem[it.id];
                    return s + (series && series.grossAnnual != null ? series.grossAnnual : 0);
                  }, 0);
                  const recurringRevResolved = allConfirmedFor(recurringRev);
                  const recurringCostResolved = allConfirmedFor(recurringCost);
                  const lumpsResolved = allConfirmedFor(lumps);
                  // Revenue baseline — first BASELINE entry with
                  // kind: "revenue" is the denominator for the %
                  // framing on recurring revenue uplift.
                  const baselineList = (typeof BASELINE !== "undefined" && Array.isArray(BASELINE))
                    ? BASELINE : [];
                  const revenueBaseline = baselineList.find(b => b.kind === "revenue");
                  const baselineRevenueValue = revenueBaseline
                    ? revenueBaseline.eval(A) : null;
                  const renderBenefitRow = (it) => {
                      // Sort factors so confirmed (world facts the
                      // buyer already accepted) come first, then
                      // commitments. Order within each group preserved.
                      const raw = factorsFor(it).map(formatFactor);
                      const confirmedFs = raw.filter(f => f.confirmed);
                      const commitmentFs = raw.filter(f => !f.confirmed);
                      const allConfirmed = commitmentFs.length === 0;
                      const series = model.perItem[it.id];
                      const annual = series && series.grossAnnual != null ? series.grossAnnual : 0;
                      // Derive the period suffix from `item.lump`:
                      // recurring items produce $X per year of the
                      // horizon; lump items are a single-event dollar
                      // value with no period.
                      const totalUnit = it.lump ? "$" : "$/yr";
                      const signedTotal = (raw, unit) => {
                        if (raw == null || !Number.isFinite(raw)) return "?";
                        const sign = raw > 0 ? "+" : (raw < 0 ? "−" : "");
                        const abs = Math.abs(raw);
                        return sign + fmtValueWithUnit(abs, unit);
                      };
                      const totalDisplay = allConfirmed
                        ? signedTotal(annual, totalUnit)
                        : "?";

                      // Compact view — one clean line per benefit:
                      // commitment factor (green) + item name + result.
                      // The multiplication chain lives behind the
                      // section-level "Show me how" toggle.
                      if (!andShowMath) {
                        return (
                          <React.Fragment key={it.id}>
                            <div style={{
                              display: "flex", alignItems: "baseline",
                              gap: 12, minWidth: 0,
                            }}>
                              <div style={{
                                display: "flex", alignItems: "baseline", gap: 6,
                                flexShrink: 0,
                              }}>
                                {commitmentFs.map((f, fi) => (
                                  <React.Fragment key={`u-${fi}`}>
                                    {fi > 0 && (
                                      <span style={{
                                        fontFamily: "var(--sans)", fontSize: 13,
                                        color: "var(--muted)",
                                      }}>×</span>
                                    )}
                                    <span style={{
                                      fontFamily: "var(--mono)", fontSize: 16,
                                      fontWeight: 600,
                                      color: COMMITMENT_COLOR,
                                      whiteSpace: "nowrap",
                                    }}>{f.value}</span>
                                  </React.Fragment>
                                ))}
                              </div>
                              <div style={{
                                fontFamily: "var(--serif)",
                                fontSize: 15, lineHeight: 1.35,
                                color: "var(--ink-2)",
                                letterSpacing: "-0.005em",
                                minWidth: 0,
                              }}>{it.name}</div>
                            </div>
                            <div style={{
                              justifySelf: "end",
                              fontFamily: "var(--mono)", fontSize: 18,
                              fontWeight: 700,
                              color: allConfirmed ? "var(--ink)" : "var(--muted-2)",
                              whiteSpace: "nowrap",
                              transition: "color 220ms ease",
                            }}>{totalDisplay}</div>
                          </React.Fragment>
                        );
                      }

                      // Expanded view — full multiplication chain with
                      // confirmed factors visible as context.
                      return (
                        <React.Fragment key={it.id}>
                          {/* Left: factors flow */}
                          <div style={{
                            display: "flex", flexWrap: "wrap",
                            alignItems: "baseline", gap: 8,
                            minWidth: 0,
                          }}>
                            {confirmedFs.map((f, fi) => (
                              <React.Fragment key={`c-${fi}`}>
                                {fi > 0 && (
                                  <span style={{
                                    color: "var(--muted-2)", fontSize: 12,
                                    fontFamily: "var(--mono)",
                                  }}>·</span>
                                )}
                                <span style={{
                                  fontFamily: "var(--mono)", fontSize: 13,
                                  color: "var(--muted-2)", fontWeight: 500,
                                  whiteSpace: "nowrap",
                                }}>{f.value}</span>
                              </React.Fragment>
                            ))}
                            {confirmedFs.length > 0 && commitmentFs.length > 0 && (
                              <span style={{
                                fontFamily: "var(--sans)", fontSize: 15,
                                color: "var(--muted)", margin: "0 2px",
                              }}>×</span>
                            )}
                            {commitmentFs.map((f, fi) => (
                              <React.Fragment key={`u-${fi}`}>
                                {fi > 0 && (
                                  <span style={{
                                    fontFamily: "var(--sans)", fontSize: 14,
                                    color: "var(--muted)",
                                  }}>×</span>
                                )}
                                <span style={{
                                  fontFamily: "var(--mono)", fontSize: 16,
                                  fontWeight: 600,
                                  color: COMMITMENT_COLOR,
                                  whiteSpace: "nowrap",
                                  transition: "color 220ms ease",
                                }}>{f.value}</span>
                              </React.Fragment>
                            ))}
                          </div>
                          {/* Right: total — right-aligned so the dollar
                              figures line up vertically across rows. */}
                          <div style={{
                            display: "flex", alignItems: "baseline", gap: 8,
                            justifySelf: "end",
                          }}>
                            <span style={{
                              fontFamily: "var(--sans)", fontSize: 15,
                              color: "var(--muted)",
                            }}>=</span>
                            <div style={{ textAlign: "right" }}>
                              <div style={{
                                fontFamily: "var(--mono)", fontSize: 18,
                                fontWeight: 700,
                                color: allConfirmed ? "var(--ink)" : "var(--muted-2)",
                                lineHeight: 1.2, whiteSpace: "nowrap",
                                transition: "color 220ms ease",
                              }}>{totalDisplay}</div>
                              <div style={{
                                fontFamily: "var(--sans)", fontSize: 10.5,
                                color: "var(--muted-2)", lineHeight: 1.3,
                                marginTop: 3,
                              }}>{it.name}</div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                  };

                  // Subtotal renderer — `headline` is the big bold
                  // primary line, `secondary` is an optional smaller
                  // line beneath it, `label` is the eyebrow underneath,
                  // and `change` is the diff semantic ("add" |
                  // "remove" | "modify") that picks the colour.
                  const renderSubtotal = (headline, secondary, label) => {
                    const unresolved = headline === "?";
                    return (
                    <>
                      <div />
                      <div style={{
                        borderTop: "1px solid var(--line-strong)",
                        paddingTop: 12, marginTop: 4,
                        display: "flex", flexDirection: "column",
                        alignItems: "flex-end",
                      }}>
                        <div style={{
                          fontFamily: "var(--mono)", fontSize: 22,
                          fontWeight: 700,
                          color: unresolved ? "var(--muted-2)" : COMMITMENT_COLOR,
                          lineHeight: 1.2, whiteSpace: "nowrap",
                          transition: "color 220ms ease",
                        }}>{headline}</div>
                        {secondary && (
                          <div style={{
                            fontFamily: "var(--mono)", fontSize: 13,
                            color: "var(--muted)", lineHeight: 1.3,
                            marginTop: 3, whiteSpace: "nowrap",
                          }}>{secondary}</div>
                        )}
                        <div style={{
                          fontFamily: "var(--mono)", fontSize: 10,
                          letterSpacing: "0.12em", textTransform: "uppercase",
                          color: "var(--muted-2)", fontWeight: 600,
                          marginTop: 4,
                        }}>{label}</div>
                      </div>
                    </>
                  );
                  };

                  // Format a signed percentage with one decimal,
                  // dropping the decimal when it's an integer.
                  const fmtSignedPct = (frac) => {
                    const v = frac * 100;
                    const sign = v > 0 ? "+" : (v < 0 ? "−" : "");
                    const abs = Math.abs(v);
                    const text = abs >= 10 || Number.isInteger(abs)
                      ? abs.toFixed(0)
                      : abs.toFixed(1);
                    return `${sign}${text}%`;
                  };
                  const fmtSignedMoney = (v) => {
                    const sign = v > 0 ? "+" : (v < 0 ? "−" : "");
                    return `${sign}${fmtMoneyExact(Math.abs(v))}`;
                  };

                  return (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) max-content",
                      columnGap: 24, rowGap: 18,
                      alignItems: "baseline",
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {/* In compact mode (default) the per-benefit
                          equations live behind the "Show me how" toggle
                          — the commitment rows above already say the
                          same thing, just without the dollar attribution.
                          We only render the subtotals here. The math
                          view shows the full per-benefit chains. */}

                      {/* --- Recurring revenue uplift -------------------- */}
                      {andShowMath && recurringRev.map(renderBenefitRow)}
                      {recurringRev.length > 0
                        && baselineRevenueValue && baselineRevenueValue > 0
                        && renderSubtotal(
                          recurringRevResolved
                            ? fmtSignedPct(sumFor(recurringRev) / baselineRevenueValue)
                            : "?",
                          recurringRevResolved
                            ? `${fmtSignedMoney(sumFor(recurringRev))}/yr`
                            : null,
                          "Change to your annual revenue"
                        )}
                      {/* --- Recurring cost savings ---------------------- */}
                      {andShowMath && recurringCost.map(renderBenefitRow)}
                      {recurringCost.length > 0
                        && renderSubtotal(
                          recurringCostResolved
                            ? `${fmtMoneyExact(sumFor(recurringCost))}/yr`
                            : "?",
                          null,
                          "Recurring cost savings"
                        )}
                      {/* --- Lump (one-off) items ------------------------ */}
                      {andShowMath && lumps.map(renderBenefitRow)}
                      {lumps.length > 0
                        && renderSubtotal(
                          lumpsResolved
                            ? fmtMoneyExact(sumFor(lumps))
                            : "?",
                          null,
                          "One-off benefit"
                        )}
                    </div>
                  );
                  })()}
                  {/* Audit-trail toggle — reveals each benefit's full
                      multiplication chain (the confirmed world-fact
                      factors that flow into the result). Hidden by
                      default so the non-financial reader sees the
                      conclusion before being asked to verify the math. */}
                  {scope1Quant.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAndShowMath(s => !s)}
                      style={{
                        marginTop: 20,
                        background: "transparent", border: "none",
                        padding: 0, cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 8,
                        fontFamily: "var(--serif)", fontStyle: "italic",
                        fontSize: 14, color: "var(--muted)",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      <span style={{
                        display: "inline-block",
                        transform: andShowMath ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 220ms var(--ease-quart)",
                        fontFamily: "var(--mono)", fontSize: 12,
                        lineHeight: 1,
                      }}>▸</span>
                      <span style={{
                        borderBottom: "1px solid var(--line-strong)",
                        paddingBottom: 1,
                      }}>
                        {andShowMath ? "Hide the math" : "Show the math"}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
              );
            })()}

            {/* THEN — non-italic + heavier, the conclusion of the chain.
                Only rendered once the user has clicked "I understand".
                Tighter bottom margin: this block leads directly into
                the Benefits / Costs / Total rows. */}
            {showOutcomeBlock && (
              <div style={{ ...rowStyle, marginBottom: isMobile ? 12 : 18 }}>
                <div style={opStyle(true)} aria-hidden>Then</div>
                <p style={{
                  ...conditionProse,
                  fontStyle: "normal", fontWeight: 500, color: "var(--ink)",
                }}>
                  Based on those assumptions, we expect:
                </p>
              </div>
            )}
          </div>
        );
      })()}
      {/* Outcome block — the entire Benefits / Costs / Total table. Gated
          behind the user confirming every commitment target above. Once
          unlocked it fades into place; the sticky flag means subsequent
          un-checks in the assumptions grid don't re-hide it. */}
      {showOutcomeBlock && (
      <div style={{
        animation: "fadeIn 600ms var(--ease-expo)",
      }}>
      {/* Focus behaviour: when exactly one of {Benefits, Costs} is open,
          mute the other two rows so attention sits on the opened section. */}
      {/* Benefits — the only thing the prospect sees up front */}
      <LandingRow isFirst
        muted={!open.has("ben") && open.has("cost")}
        elevated={modalOpen}
        dataKey="benefits"
        label="Benefits"
        valueNode={
          <BenefitsHeadlineValue
            includedDisp={benefitsTotalDisp}
            remainingDisp={bonusDisp}
          />
        }
        isOpen={open.has("ben")}
        onToggle={() => toggle("ben")}
      >
        {/* Break the benefits grid out of the 760px page column so the
            three-column table can use the viewport's full width. Only this
            block widens; ScopeScale + AddItem above/below stay narrow. */}
        {/* Viewport-relative breakout. Using negative margin (rather than
            `transform: translateX(-50%)`) avoids creating a new stacking
            context, so elevated elements inside the table can rise above
            the modal backdrop's z-index when the estimate editor opens. */}
        <div style={isMobile ? undefined : {
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
          display: "flex",
          justifyContent: "center",
        }}>
        <div style={isMobile ? undefined : {
          width: "min(1100px, calc(100vw - 48px))",
        }}>
          <BenefitsBreakdown
            items={allBenefits}
            scopeLevel={scopeLevel}
            activeKind={activeBenefitKind}
            focusedAssumptionId={focusedAssumptionId}
            revealedKinds={revealedKinds}
            onRevealKind={onRevealKind}
            headlineByKind={headlineByKind}
            model={model} A={A} assumptions={assumptions}
            setAssumption={props.setAssumption}
            viewOnly={viewOnly}
            horizon={horizon} isMobile={isMobile}
            openId={openItemId} setOpenId={setOpenItemId}
            hoveredId={hoveredItemId} setHoveredId={setHoveredItemId}
          />
        </div>
        </div>

        {(s2Items.length > 0 || s3Items.length > 0) && (
          <div style={{ marginTop: 20 }}>
            <ScopeScale level={scopeLevel} onSetLevel={onSetScopeLevel} />
          </div>
        )}

      </LandingRow>

      <LandingRow
        muted={open.has("ben") && !open.has("cost")}
        stickyTop
        dataKey="costs"
        label="Costs"
        value={costsDisp}
        valuePrefix="−"
        accent="var(--red-deep)"
        isOpen={open.has("cost")}
        onToggle={() => toggle("cost")}
      >
        <CostsBreakdown
          costs={costs} model={model} A={A} assumptions={props.assumptions}
          setAssumption={props.setAssumption}
          horizon={horizon} viewOnly={viewOnly} isMobile={isMobile}
          costSeries={costSeries} costYMax={costYMax}
          selectedItemId={selectedItemId} onSelectItem={onSelectItem}
          onAddItem={onAddItem}
          submitToClaudeCode={props.submitToClaudeCode}
          openId={openItemId} setOpenId={setOpenItemId}
          hoveredId={hoveredItemId} setHoveredId={setHoveredItemId}
        />
      </LandingRow>

      <NetBenefitRow
        npv={npvDisp}
        costsPV={costsDisp}
        bcr={props.summaryModel.bcr}
        irr={props.irrValue}
        bonusPV={bonusDisp}
        elevated={modalOpen}
        showCostsHint={!costsRowVisible}
      />

      {/* BUT — honest risk disclosure. Same operator-in-margin pattern as
          IF / AND / THEN. Risks are split into two locus-grouped
          sub-sections that get different treatment registers:
            • Commitment risks (we own) → signal / response / owner
            • World-condition risks (shared) → trigger / our response /
              your response / review moment.
          The split makes accountability explicit: the reader sees what
          the implementer commits to vs what both parties handle together
          when the world misbehaves. */}
      {(() => {
        const allRisks = (typeof window !== "undefined"
          && window.PROJECT_CONFIG
          && Array.isArray(window.PROJECT_CONFIG.risks))
          ? window.PROJECT_CONFIG.risks : [];
        if (allRisks.length === 0) return null;

        // Filter to risks relevant to the scope-1 case: those whose
        // threatened assumption is used by a scope-1 benefit or by any
        // cost (costs apply universally to the scope-1 net).
        const items = (window.PROJECT_CONFIG && window.PROJECT_CONFIG.items) || [];
        const scope1Assumptions = new Set();
        for (const it of items) {
          const inScope = it.kind === "cost" || it.scope === 1;
          if (!inScope) continue;
          (it.uses || []).forEach(u => scope1Assumptions.add(u));
        }
        const risks = allRisks.filter(r =>
          r.threatens && scope1Assumptions.has(r.threatens)
        );
        if (risks.length === 0) return null;

        const commitmentRisks = risks.filter(r => r.locus === "commitment");
        const worldRisks = risks.filter(r => r.locus !== "commitment");

        const butOpStyle = collapseMarginalia ? ({
          fontFamily: "var(--serif)",
          fontSize: 28, lineHeight: 1,
          fontWeight: 400, fontStyle: "italic",
          color: "var(--muted)", opacity: 0.55,
          letterSpacing: "-0.02em",
          marginBottom: 6,
        }) : ({
          position: "absolute",
          right: "100%",
          marginRight: 56,
          top: -4,
          fontFamily: "var(--serif)",
          fontSize: 64, lineHeight: 1,
          fontWeight: 400, fontStyle: "italic",
          color: "var(--muted)", opacity: 0.55,
          letterSpacing: "-0.03em",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        });
        const butConditionProse = {
          fontFamily: "var(--serif)", fontStyle: "italic",
          fontSize: 19, lineHeight: 1.55, color: "var(--ink-2)",
          margin: 0, letterSpacing: "-0.005em",
        };

        // Subsection labels rendered in the same left-margin marginalia
        // style as IF / AND / THEN / BUT — but smaller, so the hierarchy
        // reads clearly. Mobile collapses them inline above the group.
        const subsectionLabelStyle = collapseMarginalia ? ({
          fontFamily: "var(--serif)",
          fontSize: 18, lineHeight: 1.1,
          fontWeight: 400, fontStyle: "italic",
          color: "var(--muted)", opacity: 0.55,
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }) : ({
          position: "absolute",
          right: "100%",
          marginRight: 56,
          top: -2,
          fontFamily: "var(--serif)",
          fontSize: 26, lineHeight: 1.1,
          fontWeight: 400, fontStyle: "italic",
          color: "var(--muted)", opacity: 0.55,
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          textAlign: "right",
          pointerEvents: "none",
        });

        const renderRisk = (r, idx) => {
          const key = `${r.locus}:${r.threatens || idx}:${idx}`;
          return (
            <div key={key} style={{
              display: "grid",
              gridTemplateColumns: "30px 1fr",
              columnGap: 14,
              alignItems: "start",
              paddingBottom: 14,
              borderBottom: "1px solid var(--line)",
            }}>
              <div style={{
                fontFamily: "var(--serif)",
                fontSize: 22, fontWeight: 600,
                color: "var(--red-deep)",
                lineHeight: 1.4,
                textAlign: "right",
                paddingTop: 1,
                fontVariantNumeric: "tabular-nums",
              }}>
                {idx + 1}
              </div>
              <div style={{
                fontFamily: "var(--serif)", fontWeight: 500,
                fontSize: 17, color: "var(--ink)",
                letterSpacing: "-0.005em", lineHeight: 1.3,
                minWidth: 0,
              }}>
                {r.title}
              </div>
            </div>
          );
        };

        return (
          <div style={{
            marginTop: isMobile ? 56 : 96,
            opacity: modalOpen ? 0.25 : 1,
            filter: modalOpen ? "blur(3px)" : "none",
            transition: "opacity 360ms ease, filter 360ms ease",
            pointerEvents: modalOpen ? "none" : "auto",
          }}>
            <div style={{ position: "relative", marginBottom: 28 }}>
              <div style={butOpStyle} aria-hidden>Risks</div>
              <p style={butConditionProse}>
                here are the risks worth considering:
              </p>
            </div>

            {commitmentRisks.length > 0 && (
              <div style={{ position: "relative", marginBottom: 36 }}>
                <div style={subsectionLabelStyle} aria-hidden>Under our<br/>control</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {commitmentRisks.map((r, idx) => renderRisk(r, idx))}
                </div>
              </div>
            )}

            {worldRisks.length > 0 && (
              <div style={{ position: "relative" }}>
                <div style={subsectionLabelStyle} aria-hidden>Outside our<br/>control</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {worldRisks.map((r, idx) => renderRisk(r, commitmentRisks.length + idx))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      </div>
      )}

      <EstimateModal
        item={allBenefits.find(b => b.id === openItemId) || null}
        model={model} A={A} assumptions={assumptions}
        setAssumption={props.setAssumption}
        viewOnly={viewOnly} horizon={horizon}
        onClose={() => setOpenItemId(null)}
        onFocusAssumption={setFocusedAssumptionId}
        attribution={attribution}
      />
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
