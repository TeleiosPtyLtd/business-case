# CBAgent — Interactive Business Case template

> **Looking for the Claude Code skill?** It lives in a separate repo:
> **[TeleiosPtyLtd/business-case-skill](https://github.com/TeleiosPtyLtd/business-case-skill)**.
> That's what you install into Claude Code. This repo is the *template* the
> skill clones from — you usually don't need to touch it directly.

## What is this?

CBAgent helps you build a **business case** — a one-page answer to the
question *"is this idea worth doing, and how confident are we?"* — by
chatting with Claude Code.

You describe an idea in plain English (a new hire, a piece of software, a
process change, a marketing push, anything where money goes out and value
comes back). Claude does the maths, fills in a template, and you get an
interactive page in your browser that shows:

- **The bottom line** — does this project make money, lose money, or break
  even, and roughly by how much.
- **Where the value comes from** — a stacked picture of costs vs. benefits,
  so you can see what's actually moving the needle.
- **What happens if you're wrong** — slide any number up or down and watch
  the bottom line move. Great for "what if growth is half what we think?".
- **Three scenarios side by side** — Conservative, Central, Optimistic — so
  you're not pretending you know the future with one number.
- **A shareable link** — password-protected, sendable to a stakeholder, and
  they can play with the assumptions too.

You don't need to know what NPV, BCR or IRR mean. The tool labels them and
explains what's good and what's bad. (For the curious: NPV = "net value in
today's dollars", BCR = "benefits per dollar spent", IRR = "the return rate
this project effectively earns".)

## How to use it (the normal path)

1. **Install the skill** from
   [TeleiosPtyLtd/business-case-skill](https://github.com/TeleiosPtyLtd/business-case-skill)
   into Claude Code:
   ```
   /plugin install business-case@teleios
   ```
2. **Talk to Claude Code** about a decision you want to model. Be concrete
   — costs, timelines, what you expect to get out of it.
3. **Claude clones this template** into a new folder for your project and
   writes the `project.config.js` file with your numbers.
4. **Open `index.html`** in any browser. That's it — you'll see the
   interactive model.
5. **Click "Share"**, set a password, and you'll get a link to send to
   stakeholders. The link is password-protected and lets them poke at the
   assumptions themselves.

You don't need to install Node, run a build, or set up a server. It's a
plain HTML file.

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

The only file you (or Claude) edits is `project.config.js`. Everything else
is the rendering engine and the UI.

## Sharing — how the link works

When you click "Share", the app sends a snapshot of your model and your
chosen password to the Teleios backend at `models.teleios.au`. The backend
saves the snapshot, hashes the password securely, and gives you back a URL
like:

```
https://models.teleios.au/view/abc123
```

Send that URL and the password to whoever you want to look at it. They can
change the assumptions and see how the answer shifts, but they can't add
new costs or benefits or overwrite your version.

If you'd rather run your own sharing backend, point `share.config.js` at
your own deployment of
[`business-case-server`](https://github.com/TeleiosPtyLtd/business-case-server).

## Running it without Claude Code

You don't have to use Claude to use the template. You can hand-edit
`project.config.js` (copy from `examples/minimal.config.js` to get
started), then open `index.html`. If your browser complains about loading
files directly, run a tiny static server in the folder:

```sh
python3 -m http.server 8000     # then open http://localhost:8000
# or
npx serve .
```

## What it doesn't do

This is a tool for *making a decision*, not for *closing the books*. It
deliberately leaves out:

- Tax effects (deductions, GST, etc.)
- Depreciation and amortisation schedules
- Inflation adjustments (real vs nominal dollars)
- Working capital changes
- The capex/opex distinction
- Monte Carlo / probabilistic simulations

If your CFO needs any of those, take the numbers this tool gives you and
hand them off to a proper Excel model for the final pass. CBAgent is for
the conversation *before* that — figuring out whether the project is
worth modelling in detail at all.
