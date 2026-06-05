// Configure where the Share button uploads to, and where sign-in happens.
//
// The studio always publishes to the hosted Teleios backend — you author
// locally (live-server) but the case lives on the platform. There is no
// local backend in the normal flow, so the endpoint is production even on
// localhost. Override per-clone if you point at a different deployment:
//
//   window.CBAGENT_SHARE_ENDPOINT = "https://your-host.example.com/api/share";

window.CBAGENT_SHARE_ENDPOINT =
  window.CBAGENT_SHARE_ENDPOINT || "https://models.teleios.au/api/share";

// Sign-in is handled by the platform identity host. The studio never runs
// Clerk.js itself — production Clerk can't run on a localhost origin, so
// instead the Share modal opens a popup to this host (which runs Clerk on
// a real teleios.au domain) and receives a token back. Same handshake the
// `teleios` CLI uses. See oauth-callback.html.
window.CBAGENT_AUTH_URL =
  window.CBAGENT_AUTH_URL || "https://auth.teleios.au";
