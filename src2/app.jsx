// App entry — wires assumptions, items, scenario, and tabs.
// PROJECT_META and SCENARIO_LABELS come from src2/project.config.js via model.jsx.

const App = () => {
  const [theme, setTheme] = React.useState("light");
  React.useEffect(() => { document.body.dataset.theme = theme; }, [theme]);

  const __snap = window.PROJECT_CONFIG || {};
  const [scenario, setScenario] = React.useState(DEFAULT_SCENARIO);
  const [scenarioOpen, setScenarioOpen] = React.useState(false);
  const [items, setItems] = React.useState(DEFAULT_ITEMS);
  const [includeSoft, setIncludeSoft] = React.useState(!!__snap.__includeSoft);
  const [tab, setTab] = React.useState("edit");
  const [addKind, setAddKind] = React.useState(null);
  const [shareOpen, setShareOpen] = React.useState(false);

  // Apply scenario overrides on top of defaults
  const assumptions = React.useMemo(() => {
    const overrides = SCENARIO_OVERRIDES[scenario] || {};
    return DEFAULT_ASSUMPTIONS.map(a =>
      a.id in overrides ? { ...a, value: overrides[a.id] } : a
    );
  }, [scenario]);

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

  // Local "what-if" overrides on top of scenario assumptions
  const [overrides, setOverrides] = React.useState(__snap.__overrides || {});
  const setAssumption = (id, value) => setOverrides(prev => ({ ...prev, [id]: value }));
  const A_eff = React.useMemo(() => ({ ...A, ...overrides }), [A, overrides]);
  const assumptionsEff = React.useMemo(
    () => assumptions.map(a => a.id in overrides ? { ...a, value: overrides[a.id], modified: true } : a),
    [assumptions, overrides]
  );
  // Reset overrides when scenario changes
  React.useEffect(() => { setOverrides({}); }, [scenario]);

  const model = React.useMemo(
    () => computeModel(adjustedItems, A_eff, { includeSoft }),
    [adjustedItems, A_eff, includeSoft]
  );
  const irrValue = React.useMemo(
    () => computeIRR(adjustedItems, A_eff, includeSoft),
    [adjustedItems, A_eff, includeSoft]
  );

  const onAddItem = (template) => setItems(prev => [...prev, { ...template, removable: true }]);
  const onRemoveItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const project = { name: PROJECT_META.shortName };
  const sLabel = SCENARIO_LABELS[scenario];

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{
        borderBottom: "1px solid var(--line)",
        background: "color-mix(in srgb, var(--bg) 85%, transparent)",
        backdropFilter: "saturate(140%) blur(8px)",
        position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px" }}>
          <Logo size={20} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <Pill2 onClick={() => exportAll({
              items: adjustedItems, assumptions: assumptionsEff, model, A: A_eff, irrValue,
              scenario: sLabel.label, includeSoft, projectName: PROJECT_META.shortName,
            })}>
              <IconDownload size={13} /> Export
            </Pill2>
            {!READ_ONLY && <Pill2 onClick={() => setShareOpen(true)}>Share</Pill2>}
            {READ_ONLY && (
              <span style={{
                fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)",
                padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 999,
                background: "var(--surface-2)",
              }}>shared snapshot · explore only</span>
            )}
            {!READ_ONLY && <Pill2 primary>Sign in</Pill2>}
          </div>
        </div>
      </header>

      <ValidationBanner />

      <div style={{
        padding: "28px 28px 80px",
        display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px",
        gap: 20, alignItems: "start",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* Top: project meta + summary */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20 }}>
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
              <SummaryRow label="Net Present Value (NPV)" tooltip helper={`${HORIZON}-year horizon, ${A_eff.discount_rate}% discount`}
                value={<span style={{ color: model.npv >= 0 ? "var(--green-deep)" : "var(--red-deep)" }}>{fmtMoney(model.npv, { precise: true })}</span>} />
              <SummaryRow label="Benefit Cost Ratio (BCR)" tooltip helper="benefits ÷ costs"
                value={<span style={{ color: model.bcr >= 1 ? "var(--green-deep)" : "var(--red-deep)" }}>{model.bcr.toFixed(2)}</span>} />
              <SummaryRow label="Internal Rate of Return" helper="annualised"
                value={<span>{irrValue == null ? "—" : fmtPct(irrValue)}</span>} />
              <div style={{
                padding: "14px 24px", borderTop: "1px solid var(--line)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 13.5 }}>Include soft value</div>
                  <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }}>
                    Freed time, optionality, capability reuse
                  </div>
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

          {tab === "edit"     && <EditModelPanel    items={adjustedItems} model={model} A={A_eff} includeSoft={includeSoft} onAddItem={(k) => setAddKind(k)} onRemoveItem={onRemoveItem} readOnly={READ_ONLY} />}
          {tab === "timeline" && <TimelinePanel     items={adjustedItems} model={model} A={A_eff} includeSoft={includeSoft} />}
          {tab === "data"     && <DataTablesPanel   items={adjustedItems} model={model} assumptions={assumptionsEff} includeSoft={includeSoft} />}
          {tab === "summary"  && <SummaryPanel      items={adjustedItems} model={model} A={A_eff} irrValue={irrValue} project={project} assumptions={assumptionsEff} includeSoft={includeSoft} scenario={sLabel.label} />}
        </div>

        <div style={{ position: "sticky", top: 76 }}>
          <EstimatesRail
            assumptions={assumptionsEff}
            setAssumption={setAssumption}
            items={adjustedItems}
            scenario={scenario}
          />
        </div>
      </div>

      {addKind && (
        <AddItemModal kind={addKind} onClose={() => setAddKind(null)}
          onAdd={onAddItem} existingIds={items.map(i => i.id)} />
      )}

      {shareOpen && (
        <ShareModal
          snapshot={buildSnapshot({
            scenario, items: adjustedItems,
            assumptionsEff, overrides, includeSoft,
          })}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
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
        {tooltip && <IconHelp size={13} style={{ color: "var(--muted-2)" }} />}
      </div>
      {helper && <div style={{ color: "var(--muted-2)", fontSize: 11, marginTop: 2, fontFamily: "var(--mono)" }}>{helper}</div>}
    </div>
    <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 500, lineHeight: 1, whiteSpace: "nowrap" }}>{value}</div>
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
