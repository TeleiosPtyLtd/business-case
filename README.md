# CBAgent — Interactive Business Case template

Public template for generating interactive financial business cases through a
conversation with Claude Code. You describe a project; Claude clones this
template into your workspace and writes `project.config.js`; the UI renders
NPV / BCR / IRR, charts, value waterfall, timeline, data tables, sensitivity,
Excel exports — and lets you share a password-protected viewer.

The hosted Share backend lives separately at
[`TeleiosPtyLtd/business-case-server`](https://github.com/TeleiosPtyLtd/business-case-server),
deployed at `models.teleios.au`. This template repo only contains the editor;
running the editor doesn't need a server.

## Workflow

```
1.  Talk to Claude Code about a decision you want to model.
2.  The business-case skill clones this repo into ./<slug>/.
3.  Claude writes  ./<slug>/project.config.js.
4.  Open  index.html  in a browser and explore.
5.  Click "Share" → set a password → uploads to models.teleios.au.
6.  Send the URL + password to a stakeholder.
```

The skill lives globally at `~/.claude/skills/business-case/` and points at
this repo's URL. It clones a fresh copy per business case so each one is its
own self-contained directory.

## Layout

```
business-case/
├── index.html               # Editor entry — loads project.config.js
├── project.config.js        # ← All project-specific data lives here. Edit this.
├── share.config.js          # Where the Share button uploads to (default: models.teleios.au)
├── src/
│   ├── icons.jsx            # Icon set + CBAgent logo
│   └── charts.jsx           # Static chart helpers
├── src2/
│   ├── model.jsx            # Engine: sandboxed formula compiler, validator,
│   │                        # waterfall, PV math, IRR, sensitivity
│   ├── ui.jsx               # Shared atoms (Card, Modal, NumberInput, …)
│   ├── estimates.jsx        # Editable estimates rail
│   ├── items.jsx            # Cost/benefit rows + value waterfall + cost schedule
│   ├── tabs.jsx             # Edit Model / Timeline / Data Tables / Summary
│   ├── charts2.jsx          # Hover-aware stacked bar chart
│   ├── export.jsx           # Excel-compatible CSV exports
│   ├── share.jsx            # Share modal — uploads snapshot to backend
│   └── app.jsx              # App entry — wires everything together
├── examples/
│   └── minimal.config.js    # Smallest viable starter (1 cost + 1 benefit)
└── .gitignore
```

## Engine guarantees

The engine in `src2/model.jsx` is generic. Every project-specific value
lives in `project.config.js`. The engine handles:

- **Sandboxed formulas** — `gross` strings are tokenised; only known
  assumption ids, math helpers, numbers, and `+ - * / ( ) , .` are allowed.
  Assignments, semicolons, brackets, and unknown identifiers are rejected.
- **Config validation** — runs on load. A banner surfaces errors (probabilities
  out of range, unknown categories, missing assumption refs, duplicate ids,
  …) and warnings (missing `description`/`rationale`, etc.).
- **Per-item scenario overrides** — `scenarios.<id>.itemOverrides[item_id]`
  patches `overlap`, `counterfactual`, `cashRealisation`, `phase`, etc. for
  a specific scenario.
- **Sensitivity ranges** — each assumption can declare `sensitivityRange:
  { lo, hi }` (multipliers); falls back to ±25%.
- **Robust IRR** — wider bisection bounds (-95% to 1000%); refuses to return
  a result if the cash flow has multiple sign changes (multi-modal IRR).
- **Read-only viewer mode** — when loaded from a shared snapshot, Share /
  Add Cost / Add Benefit / Remove are hidden; estimates remain editable for
  what-if exploration.

## Running the editor

Open `index.html` directly in any browser — no build step, no server. JSX is
transpiled in-browser via Babel-standalone (fine for prototypes; this isn't a
production build).

For a slightly nicer experience (and to avoid `file://` quirks), serve it
with any static server:

```sh
python3 -m http.server 8000     # http://localhost:8000
# or
npx serve .
```

## Sharing

The Share button POSTs the live model snapshot (assumptions, items, current
overrides, scenario, includeSoft toggle) and a chosen password to the
configured backend. By default that's `https://models.teleios.au/api/share`
— set in `share.config.js`. Override per clone if you're running your own
deployment of `business-case-server` somewhere else.

The backend salt-hashes the password (`scrypt`), stores the snapshot, and
returns a URL of the form `https://models.teleios.au/view/{id}` that prompts
for the password and renders the same UI in read-only-but-explorable mode.

## Schema reference

See `~/.claude/skills/business-case/SKILL.md` for the full schema reference
and authoring guidelines (used by Claude when generating configs).

## Known limits

This is decision-support, not an audit-grade financial model. The engine
**doesn't** model: tax shields, depreciation/amortisation schedules,
inflation (real vs nominal), working capital, capex/opex distinction, or
Monte Carlo simulation. If your CFO needs any of those, drop the output of
this tool into Excel for the final pass.
