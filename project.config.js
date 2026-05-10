// =============================================================================
// PROJECT CONFIG — placeholder template.
//
// This file is the single source of truth for one business case. Every value
// below is a placeholder — replace it with your project's specifics, or let
// Claude Code rewrite this file for you via the `business-case` skill.
//
// Shape:
//   meta             — page title, short name, description
//   horizon          — display + PV horizon (years)
//   defaultScenario  — id of the scenario shown on first load
//   scenarios        — { id: { label, desc, overrides, counterfactualShift, itemOverrides } }
//   categoryColors   — category id → CSS colour variable
//   assumptions      — list of editable variables (numbers + metadata)
//   items            — list of costs and benefits, with formula strings
//
// FORMULA STRINGS
// ---------------
// `gross` is a JavaScript expression as a string. It can reference:
//   - any assumption id defined below
//   - the standard math helpers: pow, min, max, abs, floor, ceil, round,
//                                 log, sqrt, exp, PI, E
//   - numeric literals
// The compiler is sandboxed: assignments, semicolons, brackets, function
// bodies, and unknown identifiers are rejected at load time.
//
// The result is a $/yr value for recurring items, or a one-off $ value for
// `lump: true` items.
// =============================================================================

window.PROJECT_CONFIG = {

  // -------------------------------------------------------------------------
  // META — replace these
  // -------------------------------------------------------------------------
  meta: {
    name:        "Your project name",
    shortName:   "Project",
    description: "One paragraph describing the decision being modelled and what is being chosen between.",
    eyebrow:     "Interactive Business Case",
  },

  // -------------------------------------------------------------------------
  // HORIZON — years over which the model evaluates costs and benefits
  // -------------------------------------------------------------------------
  horizon: 5,

  // -------------------------------------------------------------------------
  // SCENARIOS
  //   overrides            — assumption_id → number (replaces default value)
  //   counterfactualShift  — added to every item's `counterfactual` factor
  //   itemOverrides        — per-item parameter patches for this scenario
  // -------------------------------------------------------------------------
  defaultScenario: "central",
  scenarios: {
    central: {
      label: "Central case",
      desc:  "Best-estimate parameters",
      overrides: {},
      counterfactualShift: 0,
    },
    conservative: {
      label: "Conservative",
      desc:  "Steelman: tighter delivery, more would-have-happened-anyway",
      overrides: {
        // example: discount_rate: 10,
      },
      counterfactualShift: 0.15,
    },
    optimistic: {
      label: "Optimistic",
      desc:  "Upside: stronger delivery and fuller capture",
      overrides: {
        // example: discount_rate: 7,
      },
      counterfactualShift: -0.10,
    },
  },

  // -------------------------------------------------------------------------
  // CATEGORY COLOURS — pick from the existing palette
  //   benefits: --c-mint, --c-blue, --c-green, --c-purple, --c-mintlight
  //   costs:    --c-red, --c-yellow, --c-orange
  // -------------------------------------------------------------------------
  categoryColors: {
    benefit_a: "var(--c-mint)",
    benefit_b: "var(--c-blue)",
    cost_init: "var(--c-red)",
    cost_run:  "var(--c-yellow)",
  },

  // -------------------------------------------------------------------------
  // ASSUMPTIONS — editable inputs in the right rail
  //
  // Required fields: id, label, group, value, unit, description, rationale.
  // For phase-based delivery risk, use the conventional ids p1_prob..p4_prob
  // (values in 0..100). The engine will apply cumulative phase probability
  // to any item with `phase` > 0.
  // -------------------------------------------------------------------------
  assumptions: [
    // ----- Engagement -----
    { id: "initial_investment", label: "Initial investment", value: 100000, unit: "$", group: "Engagement",
      icon: "IconDollar", step: 5000, domain: "internal", source: "Replace with attribution",
      description: "One-off price paid in year 1 to deliver the work.",
      rationale: "Replace with the modelling justification for this number." },

    { id: "annual_run_cost", label: "Annual run cost", value: 20000, unit: "$/yr", group: "Engagement",
      icon: "IconClock", step: 1000, domain: "internal", source: "Replace with attribution",
      description: "Ongoing yearly cost after go-live (hosting, support, maintenance).",
      rationale: "Replace with the modelling justification." },

    // ----- Financial -----
    { id: "discount_rate", label: "Discount rate", value: 8, unit: "%", group: "Financial",
      icon: "IconPercent", step: 0.5, domain: "internal", source: "Replace with attribution",
      description: "Annual rate used to discount future cash flows back to present value.",
      rationale: "Replace with the modelling justification." },

    // ----- Operations -----
    { id: "annual_benefit", label: "Annual cash benefit", value: 80000, unit: "$/yr", group: "Operations",
      icon: "IconTrend", step: 5000, domain: "internal", source: "Replace with attribution",
      description: "Cash savings or revenue uplift the project is expected to generate each year, once live.",
      rationale: "Replace with the modelling justification.",
      sensitivityRange: { lo: 0.5, hi: 1.5 } },

    // ----- Delivery confidence -----
    { id: "p1_prob", label: "Phase 1 delivery", value: 80, unit: "%", group: "Delivery Confidence",
      icon: "IconShield", step: 5, domain: "internal", source: "Risk review",
      description: "Likelihood that Phase 1 delivers fully as scoped. Sets the baseline for everything downstream.",
      rationale: "Replace with the modelling justification." },

    { id: "p2_prob", label: "Phase 2 delivery", value: 60, unit: "%", group: "Delivery Confidence",
      icon: "IconShield", step: 5, domain: "internal", source: "Risk review",
      description: "Likelihood Phase 2 delivers and is adopted. Conditional on Phase 1.",
      rationale: "Replace with the modelling justification." },
  ],

  // -------------------------------------------------------------------------
  // ITEMS — costs and benefits.
  //
  // Each item:
  //   id, name, kind ("cost" | "benefit"), category (a key in categoryColors)
  //   lump:           true → one-off in startYear; false → annuity over horizon
  //   startYear:      1-indexed year the cashflow begins
  //   phase:          0..4. Costs use phase 0. Cumulative phase probability
  //                   is applied to benefits with phase > 0.
  //   gross:          formula string (see top of file)
  //   overlap:        0..1, fraction already counted by other initiatives
  //   counterfactual: 0..1, fraction captured without this work
  //   cashRealisation: 0..1, fraction realised as cash (vs soft / freed time)
  //   horizonOverride: optional assumption id capping annuity duration
  //   desc:           1-2 sentence drill-down narrative
  //   uses:           assumption ids that drive this formula (UI badges)
  // -------------------------------------------------------------------------
  items: [
    // ----- Costs -----
    { id: "cost_initial", name: "Initial investment", kind: "cost", category: "cost_init",
      lump: true, startYear: 1, phase: 0,
      gross: "initial_investment",
      overlap: 0, counterfactual: 0, cashRealisation: 1.0,
      desc: "One-off engagement fee paid in year 1.",
      uses: ["initial_investment"] },

    { id: "cost_runtime", name: "Annual run cost", kind: "cost", category: "cost_run",
      lump: false, startYear: 1, phase: 0,
      gross: "annual_run_cost",
      overlap: 0, counterfactual: 0, cashRealisation: 1.0,
      desc: "Ongoing yearly run cost across the horizon.",
      uses: ["annual_run_cost"] },

    // ----- Benefits -----
    { id: "benefit_primary", name: "Primary benefit", kind: "benefit", category: "benefit_a",
      lump: false, startYear: 2, phase: 1,
      gross: "annual_benefit",
      overlap: 0.0, counterfactual: 0.10, cashRealisation: 1.0,
      desc: "Replace with a description of the primary cash benefit.",
      uses: ["annual_benefit", "p1_prob"] },

    { id: "benefit_secondary", name: "Secondary benefit", kind: "benefit", category: "benefit_b",
      lump: false, startYear: 2, phase: 2,
      gross: "annual_benefit * 0.4",
      overlap: 0.10, counterfactual: 0.20, cashRealisation: 0.5,
      desc: "Replace with a description of the secondary benefit (e.g. freed staff time, optionality, or partial uplift).",
      uses: ["annual_benefit", "p2_prob"] },
  ],

};
