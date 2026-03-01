/**
 * kordis.js
 * Main adapter replacing transitland. Uses KORDIS GTFS + Brno vehicle positions.
 * Implements fetchDepartures(stopId, _, options) and searchStops(name).
 */

import {
  getUpcomingTripsForStop,
  findStopsByName,
  setRefreshIntervalMs,
} from "./kordis-gtfs-cache.js";
import { getDelaysByLine } from "./kordis-realtime.js";

const DEFAULT_WINDOW_MINUTES = 90;
let configuredWindowMinutes = DEFAULT_WINDOW_MINUTES;

/**
 * Merge scheduled trips with realtime delays.
 * Returns Departure[] with: time, isRealtime, delaySeconds, routeShortName, headsign, routeType, rtStatus.
 */
function mergeWithRealtime(trips, delaysByLine) {
  const departures = [];
  for (const t of trips) {
    const lineKey = String(t.routeShortName || "").replace(/^L/i, "") || t.routeShortName;
    const delayMinutes = delaysByLine.get(lineKey);
    const hasRealtime = delayMinutes != null && !Number.isNaN(delayMinutes);
    const delaySeconds = hasRealtime ? delayMinutes * 60 : 0;
    const time = new Date(t.scheduledDeparture);
    if (hasRealtime) {
      time.setMinutes(time.getMinutes() + delayMinutes);
    }
    departures.push({
      time,
      isRealtime: hasRealtime,
      delaySeconds,
      routeShortName: t.routeShortName || "",
      headsign: t.headsign || "",
      routeType: "0",
      rtStatus: hasRealtime ? "updated" : "scheduled",
    });
  }
  return departures;
}

/**
 * Fetch departures for a stop. Same interface as transitland adapter.
 */
export async function fetchDepartures(stopId, _query, options = {}) {
  const windowMinutes = options.windowMinutes ?? configuredWindowMinutes;
  const trips = await getUpcomingTripsForStop(stopId, windowMinutes);
  let delaysByLine = new Map();
  try {
    delaysByLine = await getDelaysByLine();
  } catch (err) {
    console.warn("kordis realtime fetch failed, using schedule only:", err.message);
  }
  return mergeWithRealtime(trips, delaysByLine);
}

/**
 * Search stops by name. Same interface as transitland adapter.
 */
export async function searchStops(name) {
  return findStopsByName(name);
}

/**
 * Configure the adapter (e.g. refresh intervals from env).
 */
export function configure(config = {}) {
  if (config.gtfsRefreshIntervalMs != null) {
    setRefreshIntervalMs(config.gtfsRefreshIntervalMs);
  }
  if (config.windowMinutes != null) {
    configuredWindowMinutes = config.windowMinutes;
  }
}
