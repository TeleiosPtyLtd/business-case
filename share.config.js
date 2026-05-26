// Configure where the Share button uploads to.
//
// Default: the Teleios hosted backend at models.teleios.au.
// Override per-clone if you want to point at a different deployment:
//
//   window.CBAGENT_SHARE_ENDPOINT = "https://your-host.example.com/api/share";

// Auto-detect local dev vs. production based on the page's origin. Local
// hosts use the dev backend + Clerk's dev instance (which permits localhost);
// everything else uses the Teleios production backend + the production
// Clerk instance at clerk.teleios.au. Override either by setting the
// matching window.* property before this script runs.
(function () {
  var loc = typeof location !== "undefined" ? location : null;
  var isLocal = loc && (loc.hostname === "localhost" || loc.hostname === "127.0.0.1");

  window.CBAGENT_SHARE_ENDPOINT = window.CBAGENT_SHARE_ENDPOINT
    || (isLocal ? "http://localhost:8787/api/share"
                : "https://models.teleios.au/api/share");

  // Publishable key is safe to ship to the browser — it encodes only
  // the Frontend API hostname. The secret key never leaves the server.
  window.CBAGENT_CLERK_PUBLISHABLE_KEY = window.CBAGENT_CLERK_PUBLISHABLE_KEY
    || (isLocal ? "pk_test_bWludC1sYWItNjEuY2xlcmsuYWNjb3VudHMuZGV2JA"
                : "pk_live_Y2xlcmsudGVsZWlvcy5hdSQ");
})();
