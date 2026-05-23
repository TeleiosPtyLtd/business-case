// =============================================================================
// PROJECT CONFIG — placeholder template.
//
// This file is the single source of truth for one business case. Every value
// below is a placeholder — replace it with your project's specifics, or let
// Claude Code rewrite this file for you via the `business-case` skill.
//
// Shape:
//   meta             — page title, short name, description
//   horizon          — analysis window, in years
//   baseline         — implied current-state expressions (drives the NOW section)
//   risks            — bare-titles disclosure (locus + threatens an assumption id)
//   assumptions      — every numeric input; commitments vs. world facts
//   items            — costs and benefits, each a formula over assumptions
//
// FORMULA STRINGS
// ---------------
// `gross` and `baseline[].formula` are JavaScript expressions as strings.
// They can reference:
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
  meta: {
    name: "Your project name",
    shortName: "Your project",
    description:
      "Replace with one paragraph that frames the decision: the counterfactual " +
      "(what happens if we don't do this — the cheapest credible alternative), " +
      "the audience (who reads this page), the time horizon (and why), who pays " +
      "vs. who captures the benefit, and what saying 'yes' actually unlocks.",
  },

  // Time model. All flow assumptions below are expressed in the chosen
  // granularity (here, per year). Pick `day` / `week` / `month` /
  // `quarter` / `year` to match how the buyer thinks about the decision.
  granularity: "year",
  horizon: 3,

  // Implied current-state expressions, rendered under NOW once the buyer has
  // confirmed the world-fact assumptions. `kind: "revenue"` makes this entry
  // the denominator for the "% change to your annual revenue" subtotal in AND.
  baseline: [
    {
      label: "Your annual revenue today",
      formula: "annual_customers * average_order_value",
      unit: "$/yr",
      kind: "revenue",
    },
  ],

  // Three to five plain-language statements of what could go wrong. Locus is
  // either "commitment" (the implementer is accountable) or "world" (the world
  // or the buyer could introduce it). `threatens` points at the assumption id
  // the risk would falsify; the page filters risks to those relevant to scope-1.
  risks: [
    {
      title: "Replace with one specific thing that could go wrong, in plain language.",
      locus: "commitment",
      threatens: "commitment_assumption_id",
    },
  ],

  // ---------------------------------------------------------------------------
  // Assumptions
  // ---------------------------------------------------------------------------
  // `controllable: true`  → commitment (target the intervention moves)
  // `controllable: false` → world fact (the buyer confirms; the intervention
  //                          doesn't change it)
  //
  // Every assumption needs: source, description, sensitivityRange (multipliers
  // on `value`).
  // ---------------------------------------------------------------------------
  assumptions: [
    // ---- World facts (buyer confirms these in NOW) --------------------------
    { id: "annual_customers", label: "Customers per year",
      value: 100, unit: "/yr", step: 10, group: "Business shape", icon: "IconUsers",
      source: "Replace with your source.",
      description: "Number of distinct customers your business serves in a year.",
      sensitivityRange: { lo: 0.5, hi: 2.0 } },

    { id: "average_order_value", label: "Average order value",
      value: 1000, unit: "$", step: 100, group: "Business shape", icon: "IconDollar",
      source: "Replace with your source.",
      description: "Typical revenue per customer engagement.",
      sensitivityRange: { lo: 0.6, hi: 1.8 } },

    // ---- Commitments (the intervention moves these — AND step) --------------
    { id: "commitment_assumption_id", label: "Commitment example",
      value: 10, unit: "%", step: 1, group: "Intervention", icon: "IconTrend",
      controllable: true,
      source: "Replace with your source.",
      description: "Replace with the target outcome the intervention promises to deliver.",
      sensitivityRange: { lo: 0.3, hi: 2.0 } },

    // ---- Cost assumptions (the buyer pays these — drive the cost items) -----
    { id: "implementation_cost", label: "One-off setup cost",
      value: 15000, unit: "$", step: 1000, group: "Investment", icon: "IconDollar",
      controllable: true,
      source: "Replace with your quote.",
      description: "One-off spend to stand the intervention up — implementation, hardware, onboarding, training.",
      sensitivityRange: { lo: 0.7, hi: 1.5 } },

    { id: "annual_running_cost", label: "Annual running cost",
      value: 2000, unit: "$/yr", step: 500, group: "Investment", icon: "IconDollar",
      controllable: true,
      source: "Replace with your quote.",
      description: "Recurring spend each year to keep the intervention live — licensing, support, hosting, maintenance.",
      sensitivityRange: { lo: 0.7, hi: 1.5 } },

  ],

  // ---------------------------------------------------------------------------
  // Items — costs and benefits
  // ---------------------------------------------------------------------------
  // `gross` evaluates to a $/yr value (or a one-off $ when `lump: true`).
  //
  // Benefits:
  //   • scope: 1 — primary, directly attributable, easily measurable
  //   • scope: 2 — adjacent, secondary
  //   • scope: 3 — downstream, strategic
  //   • benefitKind: "revenue_uplift" | "cost_saving" | "qualitative"
  //     Qualitative items use gross: "0".
  //
  // Costs have no scope. Use `lump: true` for one-off costs.
  // ---------------------------------------------------------------------------
  items: [
    // Costs — one upfront, one ongoing. The shapes complement: the lump
    // creates the year-1 trough on the cashflow chart, the recurring item
    // sets a steady drag on each subsequent year. Replace the names and
    // value-chain descriptions with your specifics; the assumption values
    // above carry the actual dollars.
    { id: "cost_setup", name: "Replace with one-off setup spend", kind: "cost",
      lump: true, startPeriod: 1,
      gross: "implementation_cost",
      desc: "Replace with the 1–2 sentence value chain: what the upfront spend buys (kit, integration, training) and when it lands.",
      uses: ["implementation_cost"] },

    { id: "cost_running", name: "Replace with each year's running cost", kind: "cost",
      lump: false, startPeriod: 1,
      gross: "annual_running_cost",
      desc: "Replace with the 1–2 sentence value chain: what each year's ongoing spend covers (licensing, support, hosting, maintenance).",
      uses: ["annual_running_cost"] },

    // Benefits
    { id: "benefit_primary", name: "Replace with what the buyer gains",
      kind: "benefit", scope: 1, benefitKind: "revenue_uplift",
      lump: false, startPeriod: 1,
      gross: "annual_customers * average_order_value * (commitment_assumption_id / 100)",
      desc: "Replace with the value chain: project action → world change → $ → who captures.",
      uses: ["annual_customers", "average_order_value", "commitment_assumption_id"] },
  ],
};
