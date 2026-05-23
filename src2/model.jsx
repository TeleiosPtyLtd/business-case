// =============================================================================
// MODEL ENGINE — generic, project-agnostic.
// All project-specific data lives in project.config.js (PROJECT_CONFIG).
// This file compiles formulas, runs the math, and validates the config.
//
// Time model. The case has a `granularity` (day/week/month/quarter/year) and
// an integer `horizon` count of those periods. Every cashflow, every formula,
// every assumption is expressed in that unit — there's no annualisation step
// and no discounting. The headline is net cumulative ($) over the horizon
// plus the payback period (first time cumulative net crosses zero).
// =============================================================================

const __CFG = window.PROJECT_CONFIG || {};

const GRANULARITY = String(__CFG.granularity || "year").toLowerCase();
const HORIZON     = Math.max(1, Math.round(Number(__CFG.horizon) || 1));

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

    // Accept either the new `startPeriod` (1-indexed in the case's granularity)
    // or the legacy `startYear` (1-indexed years). When a snapshot from before
    // Wave 4 is loaded with granularity="year", they're equivalent. Anything
    // else falls back to period 1.
    const startP = Number(it.startPeriod ?? it.startYear ?? 1);
    if (!Number.isFinite(startP) || startP < 1) {
      errors.push(`item ${it.id}: startPeriod must be a positive integer, got ${it.startPeriod ?? it.startYear}`);
    } else if (startP > HORIZON) {
      warnings.push(`item ${it.id}: startPeriod ${startP} is past the horizon (${HORIZON}) — item never fires`);
    }
    if (it.endPeriod != null) {
      const endP = Number(it.endPeriod);
      if (!Number.isFinite(endP) || endP < startP) {
        errors.push(`item ${it.id}: endPeriod must be >= startPeriod`);
      } else if (endP > HORIZON) {
        warnings.push(`item ${it.id}: endPeriod ${endP} exceeds horizon ${HORIZON} — will be clamped`);
      }
    }
    const fErr = validateFormula(it.gross, ids);
    if (fErr) errors.push(`item ${it.id}: formula — ${fErr}`);

    // Pre-Wave-4 fields that no longer mean anything — warn loudly so the
    // author migrates the snapshot.
    if (it.rampMonths != null) {
      warnings.push(`item ${it.id}: rampMonths is no longer supported — use startPeriod to defer the item instead`);
    }
    if (it.horizonOverride != null) {
      warnings.push(`item ${it.id}: horizonOverride is no longer supported — use endPeriod (1-indexed period) instead`);
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
// COMPUTE — nominal cashflows in the case's granularity. No discounting,
// no NPV/IRR, no risk waterfall, no cash/soft split. Each item's value
// is what its `gross` formula produces per-period; lumps fire once at
// startPeriod, recurrings run startPeriod..endPeriod (or horizon).
// =========================================================================

// computeItemSeries — runs the per-period gross formula and lays it
// across the horizon. Returns:
//   series  — length HORIZON, signed by-kind by the caller
//   total   — sum of series (helper)
//   gross   — the raw per-period value from the formula (for popovers/audit)
function computeItemSeries(item, A) {
  const series = Array(HORIZON).fill(0);
  const startP = Math.max(1, Math.round(Number(item.startPeriod ?? item.startYear ?? 1)));
  const endRaw = Number(item.endPeriod);
  const endP   = Math.min(HORIZON, Number.isFinite(endRaw) ? Math.max(startP, endRaw) : HORIZON);
  const gross  = Number(item.gross(A)) || 0;

  if (item.lump) {
    if (startP >= 1 && startP <= HORIZON) series[startP - 1] = gross;
  } else {
    for (let p = startP - 1; p < endP; p++) series[p] = gross;
  }

  let total = 0;
  for (let p = 0; p < HORIZON; p++) total += series[p];

  return { series, total, gross };
}

function computeModel(items, A) {
  const perItem = {};
  const periodTotals = { cost: Array(HORIZON).fill(0), benefit: Array(HORIZON).fill(0) };
  let totalCosts = 0, totalBenefits = 0;

  for (const it of items) {
    const s = computeItemSeries(it, A);
    perItem[it.id] = s;
    for (let p = 0; p < HORIZON; p++) {
      if (it.kind === "cost") periodTotals.cost[p]    += s.series[p];
      else                    periodTotals.benefit[p] += s.series[p];
    }
    if (it.kind === "cost") totalCosts    += s.total;
    else                    totalBenefits += s.total;
  }

  const net = totalBenefits - totalCosts;
  return {
    perItem, periodTotals,
    totalCosts, totalBenefits, net,
  };
}

// Payback — the cash-tight-customer's first question.
// Works on nominal net cashflow (benefit − cost) period-by-period.
// Returns:
//   periodly         — net per period, length HORIZON, signed
//   cumulative       — running sum of periodly, length HORIZON
//   trough           — { value, periodIdx } most-negative cumulative point
//   paybackPeriod    — continuous period position where cumulative first
//                      crosses zero from below AFTER the trough.
//                      1.0 = end of period 1; 2.72 = 72% through period 3.
//                      Null if it never recovers; 0 if positive from start.
//   endingValue      — cumulative at horizon (== net)
function computePayback(items, A) {
  const periodly = Array(HORIZON).fill(0);
  for (const it of items) {
    const s = computeItemSeries(it, A);
    const sign = it.kind === "benefit" ? 1 : -1;
    for (let p = 0; p < HORIZON; p++) periodly[p] += sign * s.series[p];
  }
  const cumulative = [];
  let acc = 0;
  for (let p = 0; p < HORIZON; p++) { acc += periodly[p]; cumulative.push(acc); }

  let troughVal = 0, troughIdx = 0;
  for (let p = 0; p < HORIZON; p++) {
    if (cumulative[p] < troughVal) { troughVal = cumulative[p]; troughIdx = p; }
  }

  let paybackPeriod = null;
  if (troughVal >= 0) {
    paybackPeriod = 0;
  } else {
    for (let p = troughIdx; p < HORIZON; p++) {
      if (cumulative[p] >= 0) {
        const prev = p > 0 ? cumulative[p - 1] : 0;
        if (prev < 0 && periodly[p] > 0) {
          paybackPeriod = p + (-prev) / periodly[p];
        } else {
          paybackPeriod = p + 1;
        }
        break;
      }
    }
  }

  return {
    periodly,
    cumulative,
    paybackPeriod,
    trough: { value: troughVal, periodIdx: troughIdx },
    endingValue: cumulative[HORIZON - 1] || 0,
    granularity: GRANULARITY,
    horizon: HORIZON,
  };
}

// Sensitivity: per-assumption ±25% by default; respect optional
// sensitivityRange = { lo, hi } where lo/hi are multipliers on the base value.
// Anchors on net cumulative (totalBenefits − totalCosts).
function computeSensitivity(items, A, baseAssumptions, optsOrDelta) {
  const opts = typeof optsOrDelta === "number"
    ? { defaultDelta: optsOrDelta }
    : (optsOrDelta || {});
  const defaultDelta = opts.defaultDelta != null ? opts.defaultDelta : 0.25;
  const baseNet = computeModel(items, A).net;
  const out = [];
  for (const a of baseAssumptions) {
    if (typeof a.value !== "number") continue;
    const r = a.sensitivityRange;
    const loMul = r && Number.isFinite(r.lo) ? r.lo : 1 - defaultDelta;
    const hiMul = r && Number.isFinite(r.hi) ? r.hi : 1 + defaultDelta;
    const lo = { ...A, [a.id]: a.value * loMul };
    const hi = { ...A, [a.id]: a.value * hiMul };
    const netLo = computeModel(items, lo).net;
    const netHi = computeModel(items, hi).net;
    out.push({
      id: a.id, label: a.label,
      base: baseNet, lo: netLo, hi: netHi,
      range: Math.abs(netHi - netLo),
      loMul, hiMul,
    });
  }
  out.sort((x, y) => y.range - x.range);
  return out;
}

// =========================================================================
// FORMAT HELPERS
// =========================================================================

// Period-unit naming. Driven by the case's granularity so headlines,
// chart labels, and payback prose all read in the unit the buyer chose.
const __GRAN_LABELS = {
  day:     { one: "day",     many: "days",     short: "D" },
  week:    { one: "week",    many: "weeks",    short: "W" },
  month:   { one: "month",   many: "months",   short: "M" },
  quarter: { one: "quarter", many: "quarters", short: "Q" },
  year:    { one: "year",    many: "years",    short: "Y" },
};
function periodUnit(granularity) {
  return __GRAN_LABELS[String(granularity || "").toLowerCase()]
    || { one: "period", many: "periods", short: "P" };
}
// Pretty label for the timeline span — "18 months", "12 quarters", etc.
function timelineLabel(horizon, granularity) {
  const u = periodUnit(granularity);
  return `${horizon} ${horizon === 1 ? u.one : u.many}`;
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
  GRANULARITY, HORIZON,
  periodUnit, timelineLabel,
  DEFAULT_ASSUMPTIONS, DEFAULT_ITEMS, BASELINE,
  PROJECT_META, READ_ONLY,
  CONFIG_VALIDATION,
  computeModel, computeItemSeries, computePayback,
  computeSensitivity, splitMultiplicativeFactors,
  validateFormula, validateConfig, extractAssumptionIds, compileFormula,
  fmtMoney, fmtMoneyExact, fmtPct, niceRound,
});

// Default the visual rounding layer on — App can flip the flag via the
// header checkbox; fmtMoney consults this at render time.
if (typeof window !== "undefined" && window.CBAGENT_ROUNDING === undefined) {
  window.CBAGENT_ROUNDING = true;
}
