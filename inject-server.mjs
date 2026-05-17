// CBAgent local static server with live-reload.
// ---------------------------------------------------------------------------
// Serves the files in the current working directory over HTTP so the editor
// can load index.html, project.config.js, and the JSX modules. Pair with a
// Claude Code session running the `cbagent` MCP channel server — the browser
// talks to Claude over that channel (localhost:8788), not through this
// process.
//
//   node inject-server.mjs
//
// Then open http://localhost:8771.
//
// File changes under the project root trigger a browser reload via SSE.
// HTML responses get a tiny client snippet injected before </body>.
// ---------------------------------------------------------------------------

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8771);

const MIME = {
  ".html": "text/html",
  ".js":   "text/javascript",
  ".mjs":  "text/javascript",
  ".jsx":  "text/babel",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// Live reload: fs.watch → SSE → injected client snippet.
// ---------------------------------------------------------------------------

const reloadBus = new EventEmitter();
reloadBus.setMaxListeners(50);

const IGNORED_PREFIXES = ["node_modules", ".git", ".DS_Store"];
let debounceTimer = null;
try {
  fs.watch(ROOT, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const norm = filename.replace(/\\/g, "/");
    if (IGNORED_PREFIXES.some(p => norm.startsWith(p))) return;
    if (norm.endsWith("~") || norm.endsWith(".swp")) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[reload] ${norm}`);
      reloadBus.emit("reload", norm);
    }, 80);
  });
} catch (e) {
  console.warn("fs.watch unavailable — live reload disabled:", e.message);
}

function serveReloadSSE(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  res.write("retry: 1000\n\n");
  const ping = setInterval(() => res.write(":\n\n"), 15000);
  const onReload = (file) => {
    res.write(`event: reload\ndata: ${JSON.stringify({ file })}\n\n`);
  };
  reloadBus.on("reload", onReload);
  req.on("close", () => {
    clearInterval(ping);
    reloadBus.off("reload", onReload);
  });
}

const RELOAD_SNIPPET = `<script>(() => {
  try {
    const es = new EventSource("/__livereload");
    es.addEventListener("reload", () => location.reload());
  } catch (e) { /* ignore */ }
})();</script>`;

function serveHtml(p, res) {
  const html = fs.readFileSync(p, "utf8");
  const out = html.includes("</body>")
    ? html.replace("</body>", `${RELOAD_SNIPPET}</body>`)
    : html + RELOAD_SNIPPET;
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "no-cache");
  res.end(out);
}

function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let p = path.normalize(path.join(ROOT, url));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end("forbidden"); }
  try {
    let stat = fs.statSync(p);
    if (stat.isDirectory()) {
      p = path.join(p, "index.html");
      stat = fs.statSync(p);
    }
    if (!stat.isFile()) throw new Error("not a file");
    const ext = path.extname(p).toLowerCase();
    if (ext === ".html") return serveHtml(p, res);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(p).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, platform: process.platform }));
  }
  if (req.method === "GET" && req.url === "/__livereload") {
    return serveReloadSSE(req, res);
  }
  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res);
  }
  res.statusCode = 405;
  res.end("method not allowed");
});

server.listen(PORT, () => {
  console.log(`CBAgent static server on http://localhost:${PORT}`);
  console.log(`Root: ${ROOT}`);
  console.log(`Live reload: watching ${ROOT}`);
});
