/**
 * Brno tram display - uses KORDIS GTFS + Brno vehicle positions.
 * No API key required. Free, unlimited data sources.
 */

import { configure } from "./src/adapters/kordis.js";

const GTFS_REFRESH_INTERVAL_MS = parseInt(
  process.env.GTFS_REFRESH_INTERVAL_MS || "86400000",
  10
);
const DEPARTURES_WINDOW_MINUTES = parseInt(
  process.env.DEPARTURES_WINDOW_MINUTES || "90",
  10
);

configure({
  gtfsRefreshIntervalMs: GTFS_REFRESH_INTERVAL_MS,
  windowMinutes: DEPARTURES_WINDOW_MINUTES,
});

console.log(
  "brno-tram-display starting (KORDIS GTFS + Brno vehicle positions, no API key)"
);
