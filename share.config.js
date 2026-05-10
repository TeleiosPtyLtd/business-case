// Configure where the Share button uploads to.
//
// Default: the Teleios hosted backend at models.teleios.au.
// Override per-clone if you want to point at a different deployment:
//
//   window.RESCHEMATIC_SHARE_ENDPOINT = "https://your-host.example.com/api/share";

window.RESCHEMATIC_SHARE_ENDPOINT =
  window.RESCHEMATIC_SHARE_ENDPOINT || "https://models.teleios.au/api/share";
