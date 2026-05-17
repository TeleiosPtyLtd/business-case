// Smallest viable CBAgent business case — 1 cost, 1 benefit, 1 baseline, 1 risk.
// Copy this over project.config.js as a starting point and grow from there.

window.PROJECT_CONFIG = {
  meta: {
    name: "Adopt a CRM for our sales team",
    shortName: "CRM adoption",
    description:
      "We're considering rolling out a CRM to our 4-person sales team. The " +
      "counterfactual is the current spreadsheet-based process. Audience is " +
      "the founder. Horizon is 3 years because the CRM subscription is annual " +
      "and we want to see year-2 and year-3 effects after onboarding completes.",
  },

  horizon: 3,

  baseline: [
    {
      label: "Your annual revenue today",
      formula: "deals_per_year * average_deal_value",
      unit: "$/yr",
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
    { id: "deals_per_year", label: "Deals closed per year",
      value: 60, unit: "/yr", step: 5, group: "Sales shape", icon: "IconBuilding",
      source: "FY24 sales log.",
      description: "Number of deals your team closes in a year.",
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
      source: "Vendor case studies (3-6 pp typical in year 1).",
      description: "Extra win rate from better follow-up and pipeline discipline. " +
                   "Vendor case studies show 3–6 pp in year 1; 4 is the conservative midpoint.",
      sensitivityRange: { lo: 0.5, hi: 1.5 } },

    // Financial
    { id: "discount_rate", label: "Discount rate",
      value: 0, unit: "%", step: 0.5, group: "Financial", icon: "IconPercent",
      source: "Default 0% — undiscounted by design.",
      description: "Annual discount rate for present value. Start at 0% if you " +
                   "want the result to read undiscounted.",
      sensitivityRange: { lo: 0.75, hi: 1.5 } },
  ],

  items: [
    // Cost
    { id: "cost_crm_subscription", name: "Annual CRM subscription", kind: "cost",
      lump: false, startYear: 1,
      gross: "4 * 50 * 12",
      desc: "Recurring CRM seat licence at $50/user/month for the 4-person sales team.",
      uses: [] },

    // Benefit
    { id: "benefit_winrate_lift", name: "Winning more deals",
      kind: "benefit", scope: 1, benefitKind: "revenue_uplift",
      lump: false, startYear: 1,
      gross: "deals_per_year * average_deal_value * (win_rate_lift_pp / 100)",
      desc: "Better follow-up and disciplined pipeline let the team close deals " +
            "they would have lost to delay or forgotten follow-ups.",
      uses: ["deals_per_year", "average_deal_value", "win_rate_lift_pp"] },
  ],
};
