// Smallest viable Reschematic business case — 1 cost, 1 benefit, 1 scenario.
// Copy this over project.config.js as a starting point and grow from there.

window.PROJECT_CONFIG = {
  meta: {
    name:        "Replace with your project name",
    shortName:   "Project",
    description: "One paragraph describing the decision being modelled and what the user is choosing between.",
    eyebrow:     "Interactive Business Case",
  },

  horizon: 5,

  defaultScenario: "central",
  scenarios: {
    central: { label: "Central case", desc: "Best-estimate parameters", overrides: {}, counterfactualShift: 0 },
  },

  categoryColors: {
    ops:      "var(--c-mint)",
    cost_pri: "var(--c-red)",
    cost_run: "var(--c-yellow)",
  },

  assumptions: [
    { id: "engagement_fee", label: "Engagement fee", value: 100000, unit: "$", group: "Engagement",
      icon: "IconDollar", step: 5000, domain: "internal", source: "Internal estimate",
      description: "One-off price paid in year 1 to deliver the work.",
      rationale: "Fixed-price proposal." },
    { id: "annual_run_cost", label: "Annual run cost", value: 20000, unit: "$/yr", group: "Engagement",
      icon: "IconClock", step: 1000, domain: "internal", source: "Internal estimate",
      description: "Ongoing yearly cost after go-live (hosting, support).",
      rationale: "Allowance for cloud + light support." },
    { id: "discount_rate", label: "Discount rate", value: 8, unit: "%", group: "Financial",
      icon: "IconPercent", step: 0.5, domain: "internal", source: "Standard WACC",
      description: "Annual rate used to discount future cash flows back to present value.",
      rationale: "Mid-range corporate WACC." },
    { id: "annual_savings", label: "Estimated annual savings", value: 80000, unit: "$/yr", group: "Operations",
      icon: "IconTrend", step: 5000, domain: "internal", source: "Workshop estimate",
      description: "Cash savings the project is expected to generate each year, once live.",
      rationale: "First-pass estimate from stakeholder workshop." },
  ],

  items: [
    { id: "fee", name: "Engagement fee", kind: "cost", category: "cost_pri",
      lump: true, startYear: 1, phase: 0,
      gross: "engagement_fee",
      overlap: 0, counterfactual: 0, cashRealisation: 1.0,
      desc: "One-off engagement fee paid in year 1.",
      uses: ["engagement_fee"] },

    { id: "run", name: "Annual run cost", kind: "cost", category: "cost_run",
      lump: false, startYear: 1, phase: 0,
      gross: "annual_run_cost",
      overlap: 0, counterfactual: 0, cashRealisation: 1.0,
      desc: "Ongoing yearly run cost across the horizon.",
      uses: ["annual_run_cost"] },

    { id: "savings", name: "Operational savings", kind: "benefit", category: "ops",
      lump: false, startYear: 2, phase: 1,
      gross: "annual_savings",
      overlap: 0, counterfactual: 0.10, cashRealisation: 1.0,
      desc: "Annual cash savings unlocked by the project.",
      uses: ["annual_savings"] },
  ],
};
