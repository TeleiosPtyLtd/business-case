# Reschematic — Interactive Business Case template

Public template for generating interactive financial business cases through a
conversation with Claude Code. You describe a project; Claude clones this
template into your workspace and writes `project.config.js`; the UI renders
NPV / BCR / IRR, charts, value waterfall, timeline, data tables, sensitivity,
Excel exports — and lets you share a password-protected viewer.

## Workflow

```
1.  Talk to Claude Code about a decision you want to model.
2.  The business-case skill clones this repo into ./<slug>/.
3.  Claude writes  ./<slug>/project.config.js.
4.  Open the page (locally) and explore.
5.  Click "Share" → set a password → upload to your hosted backend.
6.  Send the URL + password to a stakeholder.
```

The skill lives globally at `~/.claude/skills/business-case/` and points at
this repo's URL. It clones a fresh copy per business case so each one is its
own self-contained directory.

## Layout

```
reschematic/
├── index.html               # Editor entry — loads project.config.js
├── project.config.js        # ← All project-specific data lives here. Edit this.
├── share.config.js          # Configures where the Share button uploads to
├── src/
│   ├── icons.jsx            # Icon set + Reschematic logo
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
├── server/
│   ├── server.js            # Express backend: rate-limited, scrypt-hashed,
│   │                        # share TTL, snapshot validation
│   ├── view.html            # Read-only viewer page served at /view/:id
│   ├── package.json
│   └── data/                # Stored snapshots (one JSON per share, gitignored)
├── Dockerfile               # Deployable as-is (Fly.io / Render / VPS)
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

## Running locally

```sh
cd server
npm install
npm start         # http://localhost:8787
```

That serves the editor at `/`, the share endpoint at `/api/share`, and the
viewer at `/view/:id`. Share works end-to-end on `localhost`.

If you don't need Share you can also just open `index.html` directly — the
editor works without the backend.

## Sharing to a hosted backend

1. **Deploy the backend.** Easiest paths:

   ```sh
   docker build -t reschematic .
   docker run -p 8787:8787 -v $PWD/data:/app/server/data reschematic
   ```

   Or `flyctl launch` from this directory (the Dockerfile is picked up
   automatically). Or push to Render and let it use the Dockerfile.

2. **Point the editor at it.** Edit `share.config.js` in your local clone:

   ```js
   window.RESCHEMATIC_SHARE_ENDPOINT = "https://reschematic.example.com/api/share";
   ```

3. **Click Share.** The model snapshot uploads, the password is scrypt-hashed
   server-side, and you get back a URL like
   `https://reschematic.example.com/view/{id}` that prompts for the password.

### Backend env vars

| var              | default       | what it controls                          |
|------------------|---------------|-------------------------------------------|
| `PORT`           | `8787`        | HTTP port                                 |
| `SHARE_TTL_DAYS` | `90`          | when shares are GC'd on next read         |
| `MAX_BODY_BYTES` | `2097152`     | max upload size (2 MB)                    |

Rate limits: 30 uploads / 100 password attempts per IP per window. Tweak in
`server/server.js` if you need different ceilings.

## Schema reference

See `~/.claude/skills/business-case/SKILL.md` for the full schema reference
and authoring guidelines (used by Claude when generating configs).

## Known limits

This is decision-support, not an audit-grade financial model. The engine
**doesn't** model: tax shields, depreciation/amortisation schedules,
inflation (real vs nominal), working capital, capex/opex distinction, or
Monte Carlo simulation. If your CFO needs any of those, drop the output of
this tool into Excel for the final pass.
