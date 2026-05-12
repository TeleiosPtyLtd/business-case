// =============================================================================
// MODEL ENGINE — generic, project-agnostic.
// All project-specific data lives in project.config.js (PROJECT_CONFIG).
// This file compiles formulas, runs the waterfall + PV math, and validates
// the config.
// =============================================================================

const __CFG = window.PROJECT_CONFIG || {};

const HORIZON = __CFG.horizon || 7;
const YEARS   = HORIZON;

// =========================================================================
// FORMULA COMPILER (sandboxed)
//
// `gross` strings are JS expressions, but we don't trust the source — a
// shared snapshot might have been tampered with. So we tokenise the formula
// and reject anything that isn't:
//   - a known assumption id
//   - a whitelisted math helper (pow, min, max, abs, log, sqrt, exp, ...)
//   - a numeric literal
//   - one of: + - * / ( ) , .  (whitespace allowed)
//
// That blocks `;`, `=`, `{}`, `[]`, function bodies, property access,
// template literals — anything that could execute beyond pure arithmetic.
// =========================================================================
const __MATH_BINDINGS = {
  pow:   Math.pow,  min: Math.min, max:  Math.max, abs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  log:   Math.log,  sqrt: Math.sqrt, exp:  Math.exp,
  PI:    Math.PI,   E:    Math.E,
};
const __MATH_KEYS = Object.keys(__MATH_BINDINGS);

const __ALLOWED_CHAR_RE = /^[\s+\-*/().,\d_a-zA-Z]+$/;
const __IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;

function validateFormula(expr, allowedIds) {
  if (typeof expr === "number") return null;
  if (expr == null || expr === "") return null;
  if (typeof expr !== "string") return `formula must be a string or number, got ${typeof expr}`;
  if (!__ALLOWED_CHAR_RE.test(expr)) {
    return `disallowed character — only digits, identifiers, and + - * / ( ) , . _ are permitted`;
  }
  const idents = expr.match(__IDENT_RE) || [];
  const allowed = new Set([...allowedIds, ...__MATH_KEYS]);
  for (const id of idents) {
    if (!allowed.has(id)) return `unknown identifier: '${id}'`;
  }
  return null;
}

// Returns the de-duped list of assumption ids referenced by a formula
// string. Math helpers (pow, min, etc.) and unknown identifiers are
// filtered out. Used to derive `item.uses` from a formula and to
// highlight which estimates drive a selected item.
function extractAssumptionIds(expr, allowedIds) {
  if (expr == null || typeof expr !== "string") return [];
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  const idents = expr.match(__IDENT_RE) || [];
  const used = new Set();
  for (const id of idents) if (allowed.has(id)) used.add(id);
  return [...used];
}

function compileFormula(expr, assumptionIds) {
  if (typeof expr === "function") return expr;
  if (typeof expr === "number")   return () => expr;
  if (expr == null || expr === "") return () => 0;

  const err = validateFormula(expr, assumptionIds);
  if (err) {
    console.error("Formula validation:", expr, "→", err);
    const fn = () => 0;
    fn.__error = err;
    return fn;
  }

  const params = [...assumptionIds, ...__MATH_KEYS];
  const body = `"use strict"; return (${expr});`;
  let fn;
  try {
    fn = new Function(...params, body);
  } catch (e) {
    console.error("Formula compile error:", expr, e);
    const f = () => 0;
    f.__error = e.message;
    return f;
  }
  const mathVals = Object.values(__MATH_BINDINGS);
  return (A) => {
    const args = assumptionIds.map(id => A[id] ?? 0);
    try { return fn(...args, ...mathVals); }
    catch (e) { console.error("Formula runtime error:", expr, e); return 0; }
  };
}

// =========================================================================
// CONFIG VALIDATOR
// Returns { errors: string[], warnings: string[] }. UI renders a banner
// when either array is non-empty.
// =========================================================================
function validateConfig(cfg) {
  const errors = [], warnings = [];
  if (!cfg || typeof cfg !== "object") {
    errors.push("PROJECT_CONFIG missing");
    return { errors, warnings };
  }

  const assumptions = cfg.assumptions || [];
  const items       = cfg.items || [];
  const cats        = cfg.categoryColors || {};

  // Assumptions
  const seenAss = new Set();
  for (const a of assumptions) {
    if (!a.id) { errors.push(`assumption missing id`); continue; }
    if (seenAss.has(a.id)) errors.push(`duplicate assumption id: ${a.id}`);
    seenAss.add(a.id);
    if (typeof a.value !== "number" || !Number.isFinite(a.value)) {
      errors.push(`assumption ${a.id}: value must be a finite number`);
    }
    if (a.id.endsWith("_prob") && (a.value < 0 || a.value > 100)) {
      errors.push(`assumption ${a.id}: probability must be in 0..100, got ${a.value}`);
    }
    if (!a.description) warnings.push(`assumption ${a.id}: missing description`);
    if (!a.rationale)   warnings.push(`assumption ${a.id}: missing rationale`);
  }

  // Items
  const ids = [...seenAss];
  const seenItem = new Set();
  let nCost = 0, nBenefit = 0;
  for (const it of items) {
    if (!it.id) { errors.push(`item missing id`); continue; }
    if (seenItem.has(it.id)) errors.push(`duplicate item id: ${it.id}`);
    seenItem.add(it.id);
    if (it.kind !== "cost" && it.kind !== "benefit") {
      errors.push(`item ${it.id}: kind must be 'cost' or 'benefit'`);
    } else if (it.kind === "cost") nCost++; else nBenefit++;

    if (it.category && !(it.category in cats)) {
      errors.push(`item ${it.id}: category '${it.category}' has no entry in categoryColors`);
    }
    for (const f of ["overlap", "counterfactual", "cashRealisation"]) {
      const v = it[f];
      if (v != null && (v < 0 || v > 1)) {
        errors.push(`item ${it.id}: ${f} must be 0..1, got ${v}`);
      }
    }
    if (it.phase != null && (it.phase < 0 || it.phase > 4 || !Number.isInteger(it.phase))) {
      errors.push(`item ${it.id}: phase must be an integer 0..4`);
    }
    if (it.startYear != null && (it.startYear < 1 || it.startYear > HORIZON)) {
      warnings.push(`item ${it.id}: startYear ${it.startYear} is outside 1..${HORIZON}`);
    }
    const fErr = validateFormula(it.gross, ids);
    if (fErr) errors.push(`item ${it.id}: formula — ${fErr}`);

    if (it.horizonOverride && !seenAss.has(it.horizonOverride)) {
      errors.push(`item ${it.id}: horizonOverride '${it.horizonOverride}' not found`);
    }
  }
  if (items.length === 0) errors.push("no items defined");
  else {
    if (nCost === 0) warnings.push("no costs defined");
    if (nBenefit === 0) warnings.push("no benefits defined");
  }

  // Scenarios
  for (const [sid, s] of Object.entries(cfg.scenarios || {})) {
    for (const ovId of Object.keys(s.overrides || {})) {
      if (!seenAss.has(ovId)) errors.push(`scenario '${sid}': overrides unknown assumption '${ovId}'`);
    }
    for (const [iid, patch] of Object.entries(s.itemOverrides || {})) {
      if (!seenItem.has(iid)) errors.push(`scenario '${sid}': itemOverrides unknown item '${iid}'`);
      for (const f of ["overlap", "counterfactual", "cashRealisation"]) {
        const v = patch && patch[f];
        if (v != null && (v < 0 || v > 1)) {
          errors.push(`scenario '${sid}' itemOverrides.${iid}.${f}: must be 0..1, got ${v}`);
        }
      }
    }
  }

  return { errors, warnings };
}

// =========================================================================
// LOAD ASSUMPTIONS, ITEMS, SCENARIOS FROM CONFIG
// =========================================================================
const DEFAULT_ASSUMPTIONS = (__CFG.assumptions || []).map(a => ({ ...a }));
const __ASSUMPTION_IDS = DEFAULT_ASSUMPTIONS.map(a => a.id);
const __CAT_COLORS = __CFG.categoryColors || {};

const CONFIG_VALIDATION = validateConfig(__CFG);

const DEFAULT_ITEMS = (__CFG.items || []).map(it => {
  // Preserve the formula source so items survive a localStorage / snapshot
  // round-trip (functions don't serialise) and so we can derive `uses` later.
  const _src = (typeof it.gross === "string" || typeof it.gross === "number")
    ? String(it.gross)
    : (it._grossSrc || null);
  return {
    ...it,
    color:  __CAT_COLORS[it.category] || it.color || "var(--muted-2)",
    _grossSrc: _src,
    gross:  compileFormula(typeof it.gross === "function" ? it.gross : _src, __ASSUMPTION_IDS),
  };
});

const SCENARIO_OVERRIDES = {};
const SCENARIO_COUNTERFACTUAL_SHIFT = {};
const SCENARIO_ITEM_OVERRIDES = {};
const SCENARIO_LABELS = {};
for (const [id, s] of Object.entries(__CFG.scenarios || {})) {
  SCENARIO_OVERRIDES[id]            = s.overrides || {};
  SCENARIO_COUNTERFACTUAL_SHIFT[id] = s.counterfactualShift || 0;
  SCENARIO_ITEM_OVERRIDES[id]       = s.itemOverrides || {};
  SCENARIO_LABELS[id]               = { label: s.label, desc: s.desc };
}

const PROJECT_META = __CFG.meta || {};
const DEFAULT_SCENARIO = __CFG.defaultScenario || Object.keys(SCENARIO_LABELS)[0] || "central";
const READ_ONLY = !!__CFG.__readOnly;

// =========================================================================
// COMPUTE — applies the waterfall and produces year-by-year cash & soft series
// =========================================================================
function cumulativePhaseProb(phase, A) {
  if (!phase) return 1.0;                          // costs / phase-0 always realise
  const probs = [A.p1_prob, A.p2_prob, A.p3_prob, A.p4_prob].map(v => (v || 0) / 100);
  let cum = 1;
  for (let i = 0; i < phase; i++) cum *= probs[i] ?? 1;
  return cum;
}

function computeItemSeries(item, A) {
  const r = (A.discount_rate || 0) / 100;
  const phaseFactor   = cumulativePhaseProb(item.phase, A);
  const overlapFactor = 1 - (item.overlap || 0);
  const counterFactor = 1 - (item.counterfactual || 0);
  const totalFactor   = phaseFactor * overlapFactor * counterFactor;

  const start = item.startYear || 1;
  const yearArr = Array(HORIZON).fill(0);

  const grossAnnual = item.gross(A);
  if (item.lump) {
    if (start - 1 < HORIZON) yearArr[start - 1] = grossAnnual;
  } else {
    let endYear = HORIZON;
    if (item.horizonOverride) {
      const yrs = A[item.horizonOverride] || HORIZON;
      endYear = Math.min(HORIZON, start - 1 + yrs);
    }
    for (let y = start - 1; y < endYear; y++) yearArr[y] = grossAnnual;
  }

  let grossPV = 0;
  for (let y = 0; y < HORIZON; y++) grossPV += yearArr[y] / Math.pow(1 + r, y);

  const adjusted = yearArr.map(v => v * totalFactor);
  const cash = adjusted.map(v => v * (item.cashRealisation ?? 1));
  const soft = adjusted.map(v => v * (1 - (item.cashRealisation ?? 1)));

  const overlapPV = grossPV * overlapFactor;
  const phasePV   = overlapPV * phaseFactor;
  const netPV     = phasePV * counterFactor;
  const cashPV    = netPV * (item.cashRealisation ?? 1);
  const softPV    = netPV * (1 - (item.cashRealisation ?? 1));

  return {
    cash, soft,
    grossAnnual, totalFactor, phaseFactor, overlapFactor, counterFactor,
    grossPV, overlapPV, phasePV, netPV, cashPV, softPV,
  };
}

function computeModel(items, A, opts = { includeSoft: false }) {
  const perItem = {};
  const yearTotals = { cost: Array(HORIZON).fill(0), benefit: Array(HORIZON).fill(0) };
  let totalCostsPV = 0, totalCashBenefitsPV = 0, totalSoftBenefitsPV = 0;

  for (const it of items) {
    const series = computeItemSeries(it, A);
    perItem[it.id] = series;

    const yearly = it.kind === "benefit"
      ? series.cash.map((c, i) => c + (opts.includeSoft ? series.soft[i] : 0))
      : series.cash;

    for (let y = 0; y < HORIZON; y++) {
      if (it.kind === "cost") yearTotals.cost[y] += yearly[y];
      else yearTotals.benefit[y] += yearly[y];
    }

    if (it.kind === "cost") totalCostsPV += series.cashPV;
    else { totalCashBenefitsPV += series.cashPV; totalSoftBenefitsPV += series.softPV; }
  }

  const totalBenefitsPV = totalCashBenefitsPV + (opts.includeSoft ? totalSoftBenefitsPV : 0);
  const npv = totalBenefitsPV - totalCostsPV;
  const bcr = totalCostsPV > 0 ? totalBenefitsPV / totalCostsPV : 0;

  return {
    perItem, yearTotals, npv, bcr,
    totalCostsPV, totalCashBenefitsPV, totalSoftBenefitsPV, totalBenefitsPV,
  };
}

// IRR via bisection. Wider bounds than before (-95% to 1000%) and a guard
// against multi-sign-change cash flows (which can have multiple IRR roots).
function computeIRR(items, A, includeSoft = false) {
  const net = Array(HORIZON).fill(0);
  for (const it of items) {
    const s = computeItemSeries(it, A);
    const series = it.kind === "benefit"
      ? s.cash.map((c, i) => c + (includeSoft ? s.soft[i] : 0))
      : s.cash;
    for (let y = 0; y < HORIZON; y++) {
      net[y] += (it.kind === "benefit" ? 1 : -1) * series[y];
    }
  }
  // Multi-sign-change → IRR is non-unique. Refuse rather than silently pick one.
  let signFlips = 0, prev = 0;
  for (const v of net) {
    if (v === 0) continue;
    const cur = v > 0 ? 1 : -1;
    if (prev !== 0 && cur !== prev) signFlips++;
    prev = cur;
  }
  if (signFlips > 1) return null;

  const npvAt = (rate) => net.reduce((s, c, y) => s + c / Math.pow(1 + rate, y), 0);
  let lo = -0.95, hi = 10.0;
  if (!Number.isFinite(npvAt(lo)) || !Number.isFinite(npvAt(hi))) return null;
  if (npvAt(lo) * npvAt(hi) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const v = npvAt(mid);
    if (Math.abs(v) < 1) return mid;
    if (npvAt(lo) * v < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

function itemConfidence(item, A) {
  return cumulativePhaseProb(item.phase, A) * (1 - (item.counterfactual || 0));
}

// Sensitivity: per-assumption ±25% by default; respect optional
// sensitivityRange = { lo, hi } where lo/hi are multipliers on the base value.
function computeSensitivity(items, A, baseAssumptions, defaultDelta = 0.25) {
  const base = computeModel(items, A);
  const baseNPV = base.npv;
  const out = [];
  for (const a of baseAssumptions) {
    if (typeof a.value !== "number") continue;
    const r = a.sensitivityRange;
    const loMul = r && Number.isFinite(r.lo) ? r.lo : 1 - defaultDelta;
    const hiMul = r && Number.isFinite(r.hi) ? r.hi : 1 + defaultDelta;
    const lo = { ...A, [a.id]: a.value * loMul };
    const hi = { ...A, [a.id]: a.value * hiMul };
    const npvLo = computeModel(items, lo).npv;
    const npvHi = computeModel(items, hi).npv;
    out.push({
      id: a.id, label: a.label,
      base: baseNPV, lo: npvLo, hi: npvHi,
      range: Math.abs(npvHi - npvLo),
      loMul, hiMul,
    });
  }
  out.sort((x, y) => y.range - x.range);
  return out;
}

// =========================================================================
// FORMAT HELPERS
// =========================================================================
const fmtMoney = (v, opts = {}) => {
  const sign = v < 0 ? "-" : "";
  const x = Math.abs(v);
  if (x >= 1_000_000) return `${sign}$${(x/1_000_000).toFixed(opts.precise ? 2 : 1)}M`;
  if (x >= 1_000)     return `${sign}$${(x/1_000).toFixed(opts.precise ? 1 : 0)}k`;
  return `${sign}$${Math.round(x).toLocaleString()}`;
};
const fmtMoneyExact = (v) => `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v)).toLocaleString()}`;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;

Object.assign(window, {
  HORIZON, YEARS,
  DEFAULT_ASSUMPTIONS, DEFAULT_ITEMS,
  SCENARIO_OVERRIDES, SCENARIO_COUNTERFACTUAL_SHIFT, SCENARIO_ITEM_OVERRIDES, SCENARIO_LABELS,
  PROJECT_META, DEFAULT_SCENARIO, READ_ONLY,
  CONFIG_VALIDATION,
  computeModel, computeItemSeries, computeIRR, cumulativePhaseProb,
  itemConfidence, computeSensitivity,
  validateFormula, validateConfig, extractAssumptionIds, compileFormula,
  fmtMoney, fmtMoneyExact, fmtPct,
});
