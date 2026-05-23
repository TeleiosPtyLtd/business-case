// Smallest viable CBAgent business case — 1 cost, 1 benefit, 1 baseline, 1 risk.
// Copy this over project.config.js as a starting point and grow from there.

window.PROJECT_CONFIG = {
  meta: {
    name: "Adopt a CRM for our sales team",
    shortName: "CRM adoption",
    description:
      "We're considering rolling out a CRM to our 4-person sales team. The " +
      "counterfactual is the current spreadsheet-based process. Audience is " +
      "the founder. Modelled monthly over 18 months — covers the onboarding " +
      "ramp and the year of steady-state value the subscription buys.",
  },

  // Time model — every flow assumption below is expressed PER MONTH.
  granularity: "month",
  horizon: 18,

  baseline: [
    {
      label: "Your monthly revenue today",
      formula: "deals_per_period * average_deal_value",
      unit: "$/mo",
      kind: "revenue",
    },
  ],

  risks: [
    {
      title: "The team falls back to the spreadsheet after the first quarter",
      locus: "commitment",
      threatens: "win_rate_lift_pp",
    },
  ],

  assumptions: [
    // World facts (the buyer confirms these in NOW)
    { id: "deals_per_period", label: "Deals closed per month",
      value: 5, unit: "/mo", step: 0.5, group: "Sales shape", icon: "IconBuilding",
      source: "FY24 sales log — 60 deals/yr divided by 12.",
      description: "Typical number of deals your team closes in a month.",
      sensitivityRange: { lo: 0.7, hi: 1.5 } },

    { id: "average_deal_value", label: "Average deal size",
      value: 8000, unit: "$", step: 500, group: "Sales shape", icon: "IconDollar",
      source: "FY24 invoice average.",
      description: "Typical revenue per closed deal.",
      sensitivityRange: { lo: 0.7, hi: 1.5 } },

    // Commitment (the AND step)
    { id: "win_rate_lift_pp", label: "Win-rate increase",
      value: 4, unit: "pp", step: 0.5, group: "Sales lift", icon: "IconTrend",
      controllable: true,
      source: "Vendor case studies (3-6 pp typical once team is bedded in).",
      description: "Extra win rate from better follow-up and pipeline discipline. " +
                   "Vendor case studies show 3–6 pp; 4 is the conservative midpoint.",
      sensitivityRange: { lo: 0.5, hi: 1.5 } },
  ],

  items: [
    // Cost — recurring monthly subscription, kicks in immediately.
    { id: "cost_crm_subscription", name: "Monthly CRM subscription", kind: "cost",
      lump: false, startPeriod: 1,
      gross: "4 * 50",
      desc: "Recurring CRM seat licence at $50/user/month for the 4-person sales team.",
      uses: [] },

    // Benefit — deferred 3 months while the team learns the tool.
    { id: "benefit_winrate_lift", name: "Winning more deals",
      kind: "benefit", scope: 1, benefitKind: "revenue_uplift",
      lump: false, startPeriod: 4,
      gross: "deals_per_period * average_deal_value * (win_rate_lift_pp / 100)",
      desc: "Better follow-up and disciplined pipeline let the team close deals " +
            "they would have lost to delay or forgotten follow-ups. Deferred " +
            "three months to let the team learn the tool.",
      uses: ["deals_per_period", "average_deal_value", "win_rate_lift_pp"] },
  ],
};
