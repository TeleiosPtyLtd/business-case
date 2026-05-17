#!/usr/bin/env node
// CBAgent channel — two-way bridge between the dashboard and a running
// Claude Code session.
//
//   Browser  → POST /              (new chat or follow-up message)
//   Server   → notifications/claude/channel  (inbound to Claude Code)
//   Claude   → reply tool with { chat_id, text }
//   Server   → SSE /events broadcast → browser EventSource shows the reply
//
// Run via Claude Code (Claude Code spawns this over stdio):
//
//   claude --dangerously-load-development-channels server:cbagent
// ---------------------------------------------------------------------------

import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema, CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const log = (...args) => process.stderr.write(args.join(" ") + "\n");

// ---------- SSE broadcast --------------------------------------------------
// Each EventSource subscriber registers a function; the server calls all
// when Claude replies through the `reply` tool.
const sseClients = new Set();
function broadcast(event, data) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const send of sseClients) {
    try { send(chunk); } catch {}
  }
}

// ---------- MCP server -----------------------------------------------------
const mcp = new Server(
  { name: "cbagent", version: "0.2.0" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions:
      "Events from the CBAgent dashboard arrive as " +
      "<channel source=\"cbagent\" chat_id=\"...\" kind=\"...\"> where `kind` " +
      "is \"benefit\", \"cost\", or omitted for follow-up messages. " +
      "Reply with the `reply` tool, passing the chat_id from the tag and " +
      "your message text. Keep replies tight — they're shown inline in the " +
      "dashboard chat panel. After the user has answered your questions, " +
      "edit project.config.js to add the new item and confirm with one short " +
      "reply.",
  }
);

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "reply",
    description: "Send a message back to the CBAgent dashboard chat that initiated this event.",
    inputSchema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "The chat_id from the inbound <channel> tag" },
        text:    { type: "string", description: "Your message to the user" },
      },
      required: ["chat_id", "text"],
    },
  }],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "reply") {
    const { chat_id, text } = req.params.arguments;
    broadcast("reply", { chat_id: String(chat_id), text: String(text) });
    log(`[cbagent-channel] reply → chat ${chat_id} (${String(text).length} chars)`);
    return { content: [{ type: "text", text: "sent" }] };
  }
  throw new Error(`unknown tool: ${req.params.name}`);
});

await mcp.connect(new StdioServerTransport());
log("[cbagent-channel] connected to Claude Code via stdio");

// ---------- HTTP listener --------------------------------------------------
const PORT = Number(process.env.CBAGENT_CHANNEL_PORT || 8788);
const HOST = "127.0.0.1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", c => raw += c);
  req.on("end", () => resolve(raw));
  req.on("error", reject);
});

let nextChatId = 1;

const server = http.createServer(async (req, res) => {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ ok: true, channel: "cbagent" }));
  }

  // Server-Sent Events stream for Claude's replies.
  if (req.method === "GET" && req.url === "/events") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(": connected\n\n");
    // Heartbeat every 25s so proxies don't kill the connection.
    const beat = setInterval(() => {
      try { res.write(": ping\n\n"); } catch {}
    }, 25000);
    const send = (chunk) => res.write(chunk);
    sseClients.add(send);
    req.on("close", () => { clearInterval(beat); sseClients.delete(send); });
    return;
  }

  // Inbound user message — either a new chat or a follow-up.
  if (req.method === "POST") {
    try {
      const raw = await readBody(req);
      let payload = {};
      try { payload = JSON.parse(raw || "{}"); } catch { payload = { prompt: raw }; }
      const { prompt, kind, chat_id: existing } = payload;
      if (!prompt || typeof prompt !== "string") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: "missing 'prompt' (string)" }));
      }
      const chat_id = existing && typeof existing === "string"
        ? existing
        : `c${nextChatId++}`;
      const meta = { chat_id };
      if (kind) meta.kind = String(kind);
      await mcp.notification({
        method: "notifications/claude/channel",
        params: { content: prompt, meta },
      });
      log(`[cbagent-channel] inbound chat=${chat_id} kind=${kind || "(none)"} (${prompt.length} chars)`);
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, chat_id }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  res.statusCode = 405;
  res.end("method not allowed");
});

server.listen(PORT, HOST, () => {
  log(`[cbagent-channel] HTTP listener on http://${HOST}:${PORT}`);
});
