// =============================================================================
// MODEL ENGINE — generic, project-agnostic.
// All project-specific data lives in project.config.js (PROJECT_CONFIG).
// This file compiles formulas, runs the waterfall + PV math, and validates
// the config.
// =============================================================================

const __CFG = window.PROJECT_CONFIG || {};

const HORIZON = __CFG.horizon || 7;
const YEARS   = HORIZON;

// Sub-yearly time resolution. periodsPerYear=1 is the legacy yearly engine.
// Set to 4 for quarters, 12 for months. The headline display (year-X totals,
// And/Then breakdowns) keeps rolling up to YEARS — only the cumulative
// cashflow chart and the ramp interpolation actually use period resolution.
const PERIODS_PER_YEAR = Math.max(1, Math.round(Number(__CFG.periodsPerYear) || 1));
const PERIODS          = HORIZON * PERIODS_PER_YEAR;
const MONTHS_PER_PERIOD = 12 / PERIODS_PER_YEAR;

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

    if (it.rampMonths != null) {
      if (typeof it.rampMonths !== "number" || !Number.isFinite(it.rampMonths) || it.rampMonths < 0) {
        errors.push(`item ${it.id}: rampMonths must be a non-negative number, got ${it.rampMonths}`);
      } else if (it.lump && it.rampMonths > 0) {
        warnings.push(`item ${it.id}: rampMonths is ignored on lump items (one-off events have no ramp)`);
      } else if (it.rampMonths > HORIZON * 12) {
        warnings.push(`item ${it.id}: rampMonths ${it.rampMonths} exceeds the case horizon (${HORIZON * 12} months) — the item never reaches full strength`);
      }
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

// Fraction of full-strength value an item earns over an arbitrary window
// [a, a + windowMonths) of the ramp curve. ramp(t) = min(t / R, 1).
// Returns the AVERAGE ramp value over the window — used by the engine
// to scale each period's gross value.
function rampFraction(R, monthsSinceStart, windowMonths = 12) {
  if (!R || R <= 0) return 1;
  const a = monthsSinceStart;
  const b = a + windowMonths;
  if (a >= R) return 1;
  if (b <= R) return (a + b) / 2 / R;
  const partial = (R * R - a * a) / (2 * R);
  const full    = b - R;
  return (partial + full) / windowMonths;
}

// computeItemSeries — runs the formula and turns it into a cashflow
// series at PERIOD resolution. The legacy `cash` array (yearly rollup,
// length HORIZON) is preserved so existing UI that sums year-totals,
// renders year-stacked bars, or sorts items by total absolute cash all
// keep working unchanged. `cashPeriods` (length PERIODS) is the new
// fine-grained series used by the cumulative cashflow chart and any
// future period-aware view.
function computeItemSeries(item, A) {
  const rAnnual = (A.discount_rate || 0) / 100;
  // Per-period discount factor — geometric so that (1 + rPeriod)^PPY = 1 + rAnnual.
  const rPeriod = Math.pow(1 + rAnnual, 1 / PERIODS_PER_YEAR) - 1;

  const start = item.startYear || 1;
  const startPeriod = (start - 1) * PERIODS_PER_YEAR; // 0-indexed start period

  const periodArr = Array(PERIODS).fill(0);

  const grossAnnual = item.gross(A);
  const grossPerPeriod = grossAnnual / PERIODS_PER_YEAR;

  if (item.lump) {
    // Lump sums are one-off events at the start of startYear — placed at
    // the first period of that year, no ramp.
    if (startPeriod < PERIODS) periodArr[startPeriod] = grossAnnual;
  } else {
    let endYear = HORIZON;
    if (item.horizonOverride) {
      const yrs = A[item.horizonOverride] || HORIZON;
      endYear = Math.min(HORIZON, start - 1 + yrs);
    }
    const endPeriod = endYear * PERIODS_PER_YEAR;
    const rampMonths = Number(item.rampMonths) || 0;
    for (let p = startPeriod; p < endPeriod; p++) {
      const monthsSinceStart = (p - startPeriod) * MONTHS_PER_PERIOD;
      periodArr[p] = grossPerPeriod
        * rampFraction(rampMonths, monthsSinceStart, MONTHS_PER_PERIOD);
    }
  }

  // PV across periods.
  let grossPV = 0;
  for (let p = 0; p < PERIODS; p++) grossPV += periodArr[p] / Math.pow(1 + rPeriod, p);

  // Roll period series up to yearly so the rest of the UI keeps working.
  const yearArr = Array(HORIZON).fill(0);
  for (let p = 0; p < PERIODS; p++) {
    yearArr[Math.floor(p / PERIODS_PER_YEAR)] += periodArr[p];
  }

  return {
    cash:        yearArr,    // yearly rollup, length HORIZON
    cashPeriods: periodArr,  // period-resolution, length PERIODS
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

// Payback — the cash-tight-customer's first question.
//
// Works on *nominal* net cashflow (benefit − cost, no discounting) at
// PERIOD resolution so the chart shows the ramp curve smoothly and the
// payback point lands where the eye sees it cross zero. Yearly rollups
// are kept for back-compat with any consumer that still reads .yearly /
// .cumulative as length-HORIZON arrays.
//
// Returns:
//   yearly             — net per year, length HORIZON, signed (rollup)
//   cumulative         — running sum of yearly, length HORIZON
//   periodly           — net per period, length PERIODS, signed
//   cumulativePeriods  — running sum of periodly, length PERIODS
//   trough             — { value, yearIdx, periodIdx } most-negative point
//                        on the period cumulative
//   paybackYear        — continuous year-position where cumulative crosses
//                        zero from below AFTER the trough. 1.0 = end of
//                        year 1; 2.72 = 72% through year 3. Null if never
//                        recovers; zero if positive from the start.
//   paybackPeriod      — continuous period-position of the same crossing
//   endingValue        — cumulative final value
function computePayback(items, A) {
  const periodly = Array(PERIODS).fill(0);
  for (const it of items) {
    const s = computeItemSeries(it, A);
    const sign = it.kind === "benefit" ? 1 : -1;
    for (let p = 0; p < PERIODS; p++) periodly[p] += sign * s.cashPeriods[p];
  }
  const cumulativePeriods = [];
  let acc = 0;
  for (let p = 0; p < PERIODS; p++) { acc += periodly[p]; cumulativePeriods.push(acc); }

  let troughVal = 0, troughPeriodIdx = 0;
  for (let p = 0; p < PERIODS; p++) {
    if (cumulativePeriods[p] < troughVal) {
      troughVal = cumulativePeriods[p];
      troughPeriodIdx = p;
    }
  }
  const troughYearIdx = Math.floor(troughPeriodIdx / PERIODS_PER_YEAR);

  let paybackPeriod = null;
  if (troughVal >= 0) {
    paybackPeriod = 0;
  } else {
    for (let p = troughPeriodIdx; p < PERIODS; p++) {
      if (cumulativePeriods[p] >= 0) {
        const prev = p > 0 ? cumulativePeriods[p - 1] : 0;
        if (prev < 0 && periodly[p] > 0) {
          paybackPeriod = p + (-prev) / periodly[p];
        } else {
          paybackPeriod = p + 1;
        }
        break;
      }
    }
  }
  const paybackYear = paybackPeriod == null ? null : paybackPeriod / PERIODS_PER_YEAR;

  // Yearly rollups for back-compat with non-period-aware consumers.
  const yearly = Array(HORIZON).fill(0);
  for (let p = 0; p < PERIODS; p++) {
    yearly[Math.floor(p / PERIODS_PER_YEAR)] += periodly[p];
  }
  const cumulative = [];
  let yAcc = 0;
  for (let y = 0; y < HORIZON; y++) { yAcc += yearly[y]; cumulative.push(yAcc); }

  return {
    yearly,
    cumulative,
    periodly,
    cumulativePeriods,
    paybackYear,
    paybackPeriod,
    trough: {
      value: troughVal,
      yearIdx:   troughYearIdx,
      periodIdx: troughPeriodIdx,
    },
    endingValue: cumulativePeriods[PERIODS - 1] || 0,
    periodsPerYear: PERIODS_PER_YEAR,
    horizonYears:   HORIZON,
  };
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

// Period-unit naming. Driven by the case's periodsPerYear so headlines,
// chart labels, and payback prose all read in the same cadence the
// engine is computing on.
//   1 → year      4 → quarter      12 → month      other → period
function periodUnit(periodsPerYear) {
  const ppy = Math.max(1, Math.round(periodsPerYear || 1));
  if (ppy === 1)  return { one: "year",    many: "years",    short: "Y" };
  if (ppy === 4)  return { one: "quarter", many: "quarters", short: "Q" };
  if (ppy === 12) return { one: "month",   many: "months",   short: "M" };
  if (ppy === 2)  return { one: "half",    many: "halves",   short: "H" };
  return { one: "period", many: "periods", short: "P" };
}
// Pretty label for the timeline span — "3 years", "12 quarters", etc.
// Uses periodsPerYear when >1 so quarter/month cases read in their
// native cadence; falls back to years otherwise.
function timelineLabel(horizonYears, periodsPerYear) {
  const ppy = Math.max(1, Math.round(periodsPerYear || 1));
  if (ppy === 1) return `${horizonYears} ${horizonYears === 1 ? "year" : "years"}`;
  const n = horizonYears * ppy;
  const u = periodUnit(ppy);
  return `${n} ${n === 1 ? u.one : u.many}`;
}
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
  HORIZON, YEARS, PERIODS_PER_YEAR, PERIODS, MONTHS_PER_PERIOD,
  periodUnit, timelineLabel,
  DEFAULT_ASSUMPTIONS, DEFAULT_ITEMS, BASELINE,
  PROJECT_META, READ_ONLY,
  CONFIG_VALIDATION,
  computeModel, computeItemSeries, computeIRR, computePayback,
  computeSensitivity, splitMultiplicativeFactors,
  validateFormula, validateConfig, extractAssumptionIds, compileFormula,
  fmtMoney, fmtMoneyExact, fmtPct, niceRound,
});

// Default the visual rounding layer on — App can flip the flag via the
// header checkbox; fmtMoney consults this at render time.
if (typeof window !== "undefined" && window.CBAGENT_ROUNDING === undefined) {
  window.CBAGENT_ROUNDING = true;
}
