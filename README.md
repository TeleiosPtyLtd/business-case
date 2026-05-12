# CBAgent — Interactive Business Case template

> **Looking for the Claude Code skill?** It lives in a separate repo:
> **[TeleiosPtyLtd/business-case-skill](https://github.com/TeleiosPtyLtd/business-case-skill)**.
> That's what you install into Claude Code. This repo is the *template* the
> skill clones from — you usually don't need to touch it directly.

## Make value visible

Quit thinking in hourly costs. Start thinking in value.

If you can put numbers on **how your project will make the business more
revenue, save costs, reduce risk, or improve outcomes**, decision-makers
can evaluate it on the *value it creates* instead of the *cost it takes
to implement*. CBAgent helps you put those numbers together — by chatting
with Claude Code about your idea — and gives you back an interactive page
you can share with stakeholders.

You don't need to know what NPV, BCR or IRR mean. The tool labels them
and shows what's good and what's bad. (Quick translations for the
curious: NPV = "net value in today's dollars", BCR = "benefits per dollar
spent", IRR = "the return rate this project effectively earns".)

## How it works

### 1. Install the Cost Benefit Agent skill

One-time setup. Paste these two commands into Claude Code:

```
/plugin marketplace add TeleiosPtyLtd/business-case-skill
/plugin install business-case@teleios
```

### 2. Ask Claude Code to build your business case

```
build a business case for <your decision here>
```

Tell it as much relevant context as you can — who's paying, who captures
the value, what happens if you *don't* do the project (the
counterfactual), the time horizon, any internal numbers you already have.
The more context, the sharper the model.

### 3. Tweak the assumptions

Your browser opens with an interactive model. Every estimate is a live
input — costs and benefits recalculate as you nudge values. You can:

- Edit any number and watch the bottom line move.
- Add or remove individual costs and benefits.
- Switch between **Conservative / Central / Optimistic** scenarios.
- Use **Sort by impact** to see which estimates move NPV the most — so
  you know which numbers are worth arguing about and which aren't.

### 4. Share or export

- **Share** uploads a password-protected snapshot. You get a link like
  `https://models.teleios.au/view/abc123`. Send the link + password to a
  stakeholder and they can explore the model themselves (change
  assumptions, see what shifts) — without being able to overwrite yours.
- **Export** gives you an Excel-compatible CSV (for further modelling)
  or a print-ready PDF executive proposal (same design as on screen).

## What's in this repo

```
business-case/
├── index.html               Open this in a browser. That's the app.
├── project.config.js        Your project's numbers live here. Claude writes it.
├── share.config.js          Where the Share button uploads to (default: models.teleios.au)
├── src/                     Icons + simple chart helpers
├── src2/                    The actual app — model engine, UI, sharing, export
└── examples/
    └── minimal.config.js    A tiny example to copy from (1 cost + 1 benefit)
```

The only file you (or Claude) ever edits is `project.config.js`.
Everything else is the rendering engine and the UI.

## Running it without Claude Code

You don't have to use Claude to use the template. You can hand-edit
`project.config.js` (copy from `examples/minimal.config.js` to get
started), then open `index.html` in any browser. No build step, no Node,
no server. If your browser is fussy about loading local files, run a
tiny static server in the folder:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
# or
npx serve .
```

## Self-hosting the Share backend

By default, **Share** uploads to the Teleios-hosted backend at
`models.teleios.au`. If you'd rather run your own, deploy
[`business-case-server`](https://github.com/TeleiosPtyLtd/business-case-server)
and point `share.config.js` at it:

```js
window.CBAGENT_SHARE_ENDPOINT = "https://your-host.example.com/api/share";
```

## What this tool deliberately doesn't do

CBAgent is for *making a decision*, not for *closing the books*. It
doesn't model:

- Tax effects (deductions, GST, etc.)
- Depreciation and amortisation schedules
- Inflation adjustments (real vs nominal dollars)
- Working capital changes
- The capex/opex distinction
- Monte Carlo / probabilistic simulations

If your CFO needs any of those, take the numbers from this tool and hand
them off to a proper Excel model for the final pass. CBAgent is for the
conversation *before* that — figuring out whether the project is worth
modelling in detail at all.

## About Teleios

Built by [Teleios](https://teleios.au) — an on-demand R&D partner taking
on hard technical problems in AI, healthcare, defence, and gov-tech, and
delivering deployment-ready solutions in weeks instead of months. If you
build things that should exist but don't, get in touch.
