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

  return { errors, warnings };
}

// =========================================================================
// LOAD ASSUMPTIONS AND ITEMS FROM CONFIG
// =========================================================================
const DEFAULT_ASSUMPTIONS = (__CFG.assumptions || []).map(a => ({ ...a }));
const __ASSUMPTION_IDS = DEFAULT_ASSUMPTIONS.map(a => a.id);

const CONFIG_VALIDATION = validateConfig(__CFG);

const DEFAULT_ITEMS = (__CFG.items || []).map(it => {
  // Preserve the formula source so items survive a localStorage / snapshot
  // round-trip (functions don't serialise) and so we can derive `uses` later.
  const _src = (typeof it.gross === "string" || typeof it.gross === "number")
    ? String(it.gross)
    : (it._grossSrc || null);
  const defaultColor = it.kind === "cost" ? "var(--c-orange)" : "var(--ink-2)";
  return {
    ...it,
    color:  it.color || defaultColor,
    _grossSrc: _src,
    gross:  compileFormula(typeof it.gross === "function" ? it.gross : _src, __ASSUMPTION_IDS),
  };
});

// Split a formula string on top-level `*` operators (ignoring `*` inside
// parens). Used to render baseline expressions as a × chain so the user
// can see each factor evaluated separately.
function splitMultiplicativeFactors(formula) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(formula || "")) {
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth--; cur += ch; }
    else if (ch === "*" && depth === 0) {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = "";
    } else {
      cur += ch;
    }
  }
  const last = cur.trim();
  if (last) out.push(last);
  return out;
}

const BASELINE = (__CFG.baseline || []).map(b => {
  const src = String(b.formula || "0");
  const factors = splitMultiplicativeFactors(src).map(f => ({
    src: f,
    ids: extractAssumptionIds(f, __ASSUMPTION_IDS),
    eval: compileFormula(f, __ASSUMPTION_IDS),
  }));
  return {
    label: b.label || "",
    unit: b.unit || "",
    kind: b.kind || null,
    src,
    eval: compileFormula(src, __ASSUMPTION_IDS),
    factors,
  };
});

const PROJECT_META = __CFG.meta || {};
const READ_ONLY = !!__CFG.__readOnly;

// =========================================================================
// COMPUTE — gross → year array → PV. No risk-adjustment waterfall, no
// cash/soft split: each item's value is what its `gross` formula produces.
// =========================================================================
function computeItemSeries(item, A) {
  const r = (A.discount_rate || 0) / 100;

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

  return {
    cash: yearArr,
    grossAnnual,
    grossPV,
    cashPV: grossPV,
  };
}

function computeModel(items, A) {
  const perItem = {};
  const yearTotals = { cost: Array(HORIZON).fill(0), benefit: Array(HORIZON).fill(0) };
  let totalCostsPV = 0, totalBenefitsPV = 0;

  for (const it of items) {
    const series = computeItemSeries(it, A);
    perItem[it.id] = series;

    for (let y = 0; y < HORIZON; y++) {
      if (it.kind === "cost") yearTotals.cost[y] += series.cash[y];
      else yearTotals.benefit[y] += series.cash[y];
    }

    if (it.kind === "cost") totalCostsPV += series.cashPV;
    else totalBenefitsPV += series.cashPV;
  }

  const npv = totalBenefitsPV - totalCostsPV;
  const bcr = totalCostsPV > 0 ? totalBenefitsPV / totalCostsPV : 0;

  return {
    perItem, yearTotals, npv, bcr,
    totalCostsPV, totalBenefitsPV,
  };
}

// IRR via bisection. Multi-sign-change cash flows have non-unique IRR,
// so we refuse rather than silently pick one root.
function computeIRR(items, A) {
  const net = Array(HORIZON).fill(0);
  for (const it of items) {
    const s = computeItemSeries(it, A);
    for (let y = 0; y < HORIZON; y++) {
      net[y] += (it.kind === "benefit" ? 1 : -1) * s.cash[y];
    }
  }
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

// Sensitivity: per-assumption ±25% by default; respect optional
// sensitivityRange = { lo, hi } where lo/hi are multipliers on the base value.
// Fourth arg accepts either a number (legacy: defaultDelta) or an options
// object { defaultDelta }.
function computeSensitivity(items, A, baseAssumptions, optsOrDelta) {
  const opts = typeof optsOrDelta === "number"
    ? { defaultDelta: optsOrDelta }
    : (optsOrDelta || {});
  const defaultDelta = opts.defaultDelta != null ? opts.defaultDelta : 0.25;
  const baseNPV = computeModel(items, A).npv;
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
// 1-2-2.5-5-10 ("nice number") rounding for human-readable headlines.
// Snaps to {1, 2, 2.5, 5} × 10^k. Calculations stay in actuals — this is
// only used to massage displayed figures.
const niceRound = (v) => {
  if (!Number.isFinite(v) || v === 0) return v;
  const sign = v < 0 ? -1 : 1;
  const x = Math.abs(v);
  const k = Math.floor(Math.log10(x));
  const base = Math.pow(10, k);
  const leading = x / base; // in [1, 10)
  const steps = [1, 2, 2.5, 5, 10];
  let best = steps[0];
  let bestDist = Math.abs(leading - steps[0]);
  for (let i = 1; i < steps.length; i++) {
    const d = Math.abs(leading - steps[i]);
    if (d < bestDist) { best = steps[i]; bestDist = d; }
  }
  return sign * best * base;
};

const fmtMoney = (v, opts = {}) => {
  if (!opts.exact && typeof window !== "undefined" && window.CBAGENT_ROUNDING) {
    v = niceRound(v);
  }
  const sign = v < 0 ? "-" : "";
  const x = Math.abs(v);
  // Headline numbers: integer M/k buckets — no trailing decimal noise.
  if (x >= 1_000_000) return `${sign}$${Math.round(x/1_000_000)}M`;
  if (x >= 1_000)     return `${sign}$${Math.round(x/1_000)}k`;
  return `${sign}$${Math.round(x).toLocaleString()}`;
};
const fmtMoneyExact = (v) => `${v < 0 ? "-" : ""}$${Math.round(Math.abs(v)).toLocaleString()}`;
const fmtPct = (v) => `${(v * 100).toFixed(1)}%`;

Object.assign(window, {
  HORIZON, YEARS,
  DEFAULT_ASSUMPTIONS, DEFAULT_ITEMS, BASELINE,
  PROJECT_META, READ_ONLY,
  CONFIG_VALIDATION,
  computeModel, computeItemSeries, computeIRR,
  computeSensitivity, splitMultiplicativeFactors,
  validateFormula, validateConfig, extractAssumptionIds, compileFormula,
  fmtMoney, fmtMoneyExact, fmtPct, niceRound,
});

// Default the visual rounding layer on — App can flip the flag via the
// header checkbox; fmtMoney consults this at render time.
if (typeof window !== "undefined" && window.CBAGENT_ROUNDING === undefined) {
  window.CBAGENT_ROUNDING = true;
}
