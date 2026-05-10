// Configure where the Share button uploads to.
//
// Default: relative `/api/share`, which works when the page is served by the
// bundled Express server (`cd server && npm start`).
//
// To deploy the share backend separately (Fly.io, Render, a VPS, etc.) and
// keep editing the config locally, set this to your hosted backend URL:
//
//   window.RESCHEMATIC_SHARE_ENDPOINT = "https://reschematic.example.com/api/share";

window.RESCHEMATIC_SHARE_ENDPOINT = window.RESCHEMATIC_SHARE_ENDPOINT || "/api/share";
