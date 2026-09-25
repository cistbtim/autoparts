// Notices when a newer build has been deployed while this tab is still open
// (running old, already-cached JS) and reloads it automatically — otherwise
// a user can sit on a stale version indefinitely since Vite's hashed bundle
// filenames give the browser no reason to ever re-fetch anything.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function startVersionCheck() {
  if (import.meta.env.DEV) return; // no version.json to compare against locally

  const check = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = await res.json();
      if (buildId && buildId !== __BUILD_ID__) window.location.reload();
    } catch {
      // Offline, or the request was blocked — just try again next interval.
    }
  };

  setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}
