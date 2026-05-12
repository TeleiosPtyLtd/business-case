// App entry — wires assumptions, items, scenario, and tabs.
// PROJECT_META and SCENARIO_LABELS come from src2/project.config.js via model.jsx.

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

  const [scenario, setScenario] = React.useState(() => __persisted?.scenario || DEFAULT_SCENARIO);
  const [scenarioOpen, setScenarioOpen] = React.useState(false);
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
  const [includeSoft, setIncludeSoft] = React.useState(() =>
    __persisted ? !!__persisted.includeSoft : !!__snap.__includeSoft
  );
  const [tab, setTab] = React.useState(() => __persisted?.tab || "edit");
  const [addKind, setAddKind] = React.useState(null);
  const [editingItem, setEditingItem] = React.useState(null);
  const [editingAssumption, setEditingAssumption] = React.useState(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [share, setShare] = React.useState(() => __persisted?.share || null);
  const [selectedItemId, setSelectedItemId] = React.useState(() => __persisted?.selectedItemId || null);
  const [hoveredItemId, setHoveredItemId] = React.useState(null); // transient — not persisted
  const [sortBySensitivity, setSortBySensitivity] = React.useState(() => !!__persisted?.sortBySensitivity);
  const [saveState, setSaveState] = React.useState("idle"); // idle | saving | saved
  const [estimatesOpen, setEstimatesOpen] = React.useState(false); // mobile collapsible
  const [resetOpen, setResetOpen] = React.useState(false);
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  // On mobile we present the model as view-only, regardless of READ_ONLY.
  const viewOnly = READ_ONLY || isMobile;

  // Apply scenario overrides on top of defaults + custom assumptions.
  // customAssumptions may *shadow* an entry in DEFAULT_ASSUMPTIONS by id
  // (used to edit metadata of a default assumption); ids not in defaults
  // are appended as truly new assumptions.
  const assumptions = React.useMemo(() => {
    const sOverrides = SCENARIO_OVERRIDES[scenario] || {};
    const customById = new Map(customAssumptions.map(a => [a.id, a]));
    const defaultIds = new Set(DEFAULT_ASSUMPTIONS.map(a => a.id));
    const base = DEFAULT_ASSUMPTIONS.map(a => customById.get(a.id) || a);
    const appended = customAssumptions.filter(a => !defaultIds.has(a.id));
    const merged = [...base, ...appended];
    return merged.map(a =>
      a.id in sOverrides ? { ...a, value: sOverrides[a.id] } : a
    );
  }, [scenario, customAssumptions]);

  // Apply scenario adjustments: global counterfactual shift + per-item overrides.
  const adjustedItems = React.useMemo(() => {
    const shift = SCENARIO_COUNTERFACTUAL_SHIFT[scenario] || 0;
    const itemOv = SCENARIO_ITEM_OVERRIDES[scenario] || {};
    return items.map(it => {
      const patch = itemOv[it.id] || {};
      const cf = (patch.counterfactual ?? it.counterfactual) + shift;
      return {
        ...it,
        ...patch,
        counterfactual: Math.max(0, Math.min(1, cf)),
      };
    });
  }, [items, scenario]);

  const A = React.useMemo(() => {
    const o = {};
    for (const a of assumptions) o[a.id] = a.value;
    return o;
  }, [assumptions]);

  // Local "what-if" overrides on top of scenario assumptions.
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
  // Reset overrides + selection when scenario changes (but skip on initial mount
  // so we don't wipe out hydrated state).
  const __mounted = React.useRef(false);
  React.useEffect(() => {
    if (!__mounted.current) { __mounted.current = true; return; }
    setOverrides({});
    setSelectedItemId(null);
  }, [scenario]);

  const model = React.useMemo(
    () => computeModel(adjustedItems, A_eff, { includeSoft }),
    [adjustedItems, A_eff, includeSoft]
  );
  const irrValue = React.useMemo(
    () => computeIRR(adjustedItems, A_eff, includeSoft),
    [adjustedItems, A_eff, includeSoft]
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
          overrides, scenario, includeSoft, theme, tab, selectedItemId,
          customAssumptions, share, sortBySensitivity,
        }));
        setSaveState("saved");
      } catch (e) { setSaveState("idle"); /* quota or disabled — silent */ }
    }, 200);
    return () => clearTimeout(handle);
  }, [items, overrides, scenario, includeSoft, theme, tab, selectedItemId, customAssumptions, share, sortBySensitivity]);
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
  const sLabel = SCENARIO_LABELS[scenario];

  return (
    <>
    <div className="no-print" style={{ minHeight: "100vh" }}>
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
          <Logo size={isMobile ? 18 : 20} />
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10 }}>
            <SaveIndicator state={saveState} />
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
                      title="CSV (Excel)"
                      sub="Cash flows, waterfall, assumptions"
                      onClick={() => {
                        exportAll({
                          items: adjustedItems, assumptions: assumptionsEff, model, A: A_eff, irrValue,
                          scenario: sLabel.label, includeSoft, projectName: PROJECT_META.shortName,
                        });
                        setExportMenuOpen(false);
                      }}
                    />
                    <ExportMenuItem
                      title="PDF"
                      sub="Executive proposal · print dialog"
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

      <div style={{
        padding: isMobile ? "16px 14px 100px" : "28px 28px 80px",
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 320px",
        gap: isMobile ? 14 : 20, alignItems: "start",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, minWidth: 0 }}>
          {/* Top: project meta + summary */}
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1fr)",
            gap: isMobile ? 14 : 20,
          }}>
            <Card2 padding={28} style={{ borderRadius: 20 }}>
              <Eyebrow2>Interactive Business Case</Eyebrow2>
              <h1 style={{
                fontFamily: "var(--serif)", fontWeight: 500,
                fontSize: 28, lineHeight: 1.15, letterSpacing: "-0.015em",
                margin: "10px 0 8px",
              }}>{PROJECT_META.name}</h1>
              <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 16px", lineHeight: 1.55 }}>
                {PROJECT_META.description}
              </p>
              <div style={{ position: "relative" }}>
                <button onClick={() => setScenarioOpen(o => !o)} style={{
                  width: "100%", border: "1px solid var(--line-strong)", borderRadius: 10,
                  padding: "10px 14px", background: "var(--surface-2)", textAlign: "left",
                  display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 999,
                      background: scenario === "conservative" ? "var(--c-orange)"
                                : scenario === "optimistic" ? "var(--green)" : "var(--ink)",
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{sLabel.label}</span>
                    <span style={{
                      fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)",
                      padding: "2px 8px", background: "var(--surface)",
                      border: "1px solid var(--line)", borderRadius: 999,
                    }}>{sLabel.desc}</span>
                  </div>
                  <IconChevDown size={14} style={{ color: "var(--muted)" }} />
                </button>
                {scenarioOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                    border: "1px solid var(--line)", borderRadius: 12,
                    background: "var(--surface)", boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
                    zIndex: 30, overflow: "hidden",
                  }}>
                    {Object.entries(SCENARIO_LABELS).map(([k, v]) => (
                      <button key={k} onClick={() => { setScenario(k); setScenarioOpen(false); }} style={{
                        width: "100%", border: "none", borderBottom: "1px solid var(--line)",
                        padding: "10px 14px", background: scenario === k ? "var(--bg-soft)" : "transparent",
                        textAlign: "left", cursor: "pointer",
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{v.label}</div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{v.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card2>

            <Card2 padding={0} style={{ borderRadius: 20, overflow: "hidden" }}>
              <div style={{ padding: "22px 24px 8px" }}>
                <Eyebrow2>Summary</Eyebrow2>
                <p style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0 0" }}>
                  {sLabel.label} · {includeSoft ? "cash + soft value" : "cash value only"}.
                </p>
              </div>
              <SummaryRow label="Net Present Value (NPV)" tooltip="npv" helper={`${HORIZON}-year horizon, ${A_eff.discount_rate}% discount`}
                value={<span style={{ color: model.npv >= 0 ? "var(--green-deep)" : "var(--red-deep)" }}>{fmtMoney(model.npv, { precise: true })}</span>} />
              <SummaryRow label="Benefit Cost Ratio (BCR)" tooltip="bcr"
                value={<span style={{ color: model.bcr >= 1 ? "var(--green-deep)" : "var(--red-deep)" }}>{model.bcr.toFixed(2)}</span>} />
              <SummaryRow label="Internal Rate of Return" tooltip="irr"
                value={<span>{irrValue == null ? "—" : fmtPct(irrValue)}</span>} />
              <div style={{
                padding: "14px 24px", borderTop: "1px solid var(--line)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13.5 }}>Include soft value</span>
                  <HelpTip topic="soft" />
                </div>
                <Toggle2 on={includeSoft} onChange={setIncludeSoft} />
              </div>
            </Card2>
          </div>

          {/* Tabs */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
            background: "var(--surface-2)", border: "1px solid var(--line)",
            borderRadius: 999, padding: 4,
          }}>
            {[["edit", "Edit Model"], ["timeline", "Timeline"], ["data", "Data Tables"], ["summary", "Summary"]].map(([k, v]) => {
              const active = tab === k;
              return (
                <button key={k} onClick={() => setTab(k)} style={{
                  border: "none", padding: "9px 16px",
                  background: active ? "var(--surface)" : "transparent",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  color: active ? "var(--ink)" : "var(--muted)",
                  fontSize: 13, fontWeight: 500, borderRadius: 999, cursor: "pointer",
                }}>{v}</button>
              );
            })}
          </div>

          {tab === "edit"     && <EditModelPanel    items={adjustedItems} model={model} A={A_eff} includeSoft={includeSoft} onAddItem={(k) => setAddKind(k)} onRemoveItem={onRemoveItem} onEditItem={setEditingItem} readOnly={viewOnly} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onHoverItem={setHoveredItemId} isMobile={isMobile} />}
          {tab === "timeline" && <TimelinePanel     items={adjustedItems} model={model} A={A_eff} includeSoft={includeSoft} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onHoverItem={setHoveredItemId} />}
          {tab === "data"     && <DataTablesPanel   items={adjustedItems} model={model} assumptions={assumptionsEff} includeSoft={includeSoft} selectedItemId={selectedItemId} onSelectItem={setSelectedItemId} onHoverItem={setHoveredItemId} />}
          {tab === "summary"  && <SummaryPanel      items={adjustedItems} model={model} A={A_eff} irrValue={irrValue} project={project} assumptions={assumptionsEff} includeSoft={includeSoft} scenario={sLabel.label} />}
        </div>

        {/* Estimates: side rail on desktop, collapsible block at the bottom on mobile. */}
        {!isMobile && (
          <div style={{ position: "sticky", top: 76 }}>
            <EstimatesRail
              assumptions={assumptionsEff}
              setAssumption={setAssumption}
              items={adjustedItems}
              scenario={scenario}
              highlightedIds={highlightedIds}
              hoveredIds={hoveredIds}
              selectedItemLabel={selectedItem?.name || null}
              selectedItemColor={selectedItem?.color || null}
              hoveredItemColor={hoveredItem?.color || null}
              onClearSelection={() => setSelectedItemId(null)}
              onEditAssumption={viewOnly ? null : setEditingAssumption}
              readOnly={viewOnly}
              sortBySensitivity={sortBySensitivity}
              onToggleSort={() => setSortBySensitivity(s => !s)}
              includeSoft={includeSoft}
            />
          </div>
        )}
        {isMobile && (
          <div>
            <button onClick={() => setEstimatesOpen(o => !o)} style={{
              width: "100%", border: "1px solid var(--line)", background: "var(--surface)",
              padding: "12px 14px", borderRadius: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 13, fontWeight: 500,
            }}>
              <span>Assumptions{highlightedIds.length ? ` · ${highlightedIds.length} relevant` : ` · ${assumptionsEff.length}`}</span>
              {estimatesOpen ? <IconChevUp size={14} /> : <IconChevDown size={14} />}
            </button>
            {estimatesOpen && (
              <div style={{ marginTop: 10 }}>
                <EstimatesRail
                  assumptions={assumptionsEff}
                  setAssumption={setAssumption}
                  items={adjustedItems}
                  scenario={scenario}
                  highlightedIds={highlightedIds}
                  selectedItemLabel={selectedItem?.name || null}
                  selectedItemColor={selectedItem?.color || null}
                  onClearSelection={() => setSelectedItemId(null)}
                  onEditAssumption={null}
                  readOnly={true}
                  sortBySensitivity={sortBySensitivity}
                  onToggleSort={() => setSortBySensitivity(s => !s)}
                  includeSoft={includeSoft}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {addKind && (
        <AddItemWizard
          kind={addKind}
          onClose={() => setAddKind(null)}
          onAdd={onAddItem}
          existingIds={items.map(i => i.id)}
          assumptions={assumptionsEff}
          categoryColors={(window.PROJECT_CONFIG && window.PROJECT_CONFIG.categoryColors) || {}}
        />
      )}
      {editingItem && (
        <AddItemWizard
          kind={editingItem.kind}
          editingItem={editingItem}
          onClose={() => setEditingItem(null)}
          onAdd={onAddItem}
          existingIds={items.map(i => i.id).filter(id => id !== editingItem.id)}
          assumptions={assumptionsEff}
          categoryColors={(window.PROJECT_CONFIG && window.PROJECT_CONFIG.categoryColors) || {}}
        />
      )}
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
            scenario, items: adjustedItems,
            assumptionsEff, overrides, includeSoft,
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
            <li>Selected scenario, soft-value toggle, theme, sort preference, selected item</li>
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
    </div>
    <PrintReport
      project={{
        name: PROJECT_META.name || PROJECT_META.shortName || "Business Case",
        shortName: PROJECT_META.shortName,
        description: PROJECT_META.description,
      }}
      scenario={scenario}
      scenarioLabel={sLabel.label}
      scenarioDesc={sLabel.desc}
      model={model}
      items={adjustedItems}
      assumptions={assumptionsEff}
      A={A_eff}
      irrValue={irrValue}
      includeSoft={includeSoft}
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
