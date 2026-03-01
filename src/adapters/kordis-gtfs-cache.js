/**
 * kordis-gtfs-cache.js
 * Downloads KORDIS GTFS zip, parses relevant txt files into in-memory lookup structures.
 * Re-downloads if older than configured refresh interval (default 24h).
 */

import AdmZip from "adm-zip";
import fetch from "node-fetch";

const GTFS_URL = "https://kordis-jmk.cz/gtfs/gtfs.zip";
const ONE_DAY_MS = 86400000;
const GTFS_ROUTE_TYPE_TRAM = "0";

// kordis uses U prefix for stop_id (e.g. U123) per their gtfs convention
const STOP_ID_PREFIX = "U";
const LINE_ID_PREFIX = "L";

let cache = null;
let lastFetchTime = 0;
let refreshIntervalMs = ONE_DAY_MS;

/**
 * Parse CSV text into array of row objects (first row = headers).
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

/**
 * Parse a single CSV line handling quoted fields.
 */
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === "," && !inQuotes) || (c === "\n" && !inQuotes)) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Download GTFS zip and return buffer.
 */
async function downloadGtfsZip() {
  const res = await fetch(GTFS_URL);
  if (!res.ok) {
    throw new Error(
      `gtfs download failed: ${res.status} ${res.statusText} for ${GTFS_URL}`
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract and parse a single file from zip. Tries root and gtfs/ subfolder.
 */
function extractAndParse(zip, filename) {
  let entry = zip.getEntry(filename);
  if (!entry) entry = zip.getEntry(`gtfs/${filename}`);
  if (!entry || entry.isDirectory) {
    throw new Error(`gtfs zip missing or invalid: ${filename} not found`);
  }
  const text = entry.getData().toString("utf8");
  return parseCsv(text);
}

/**
 * Build in-memory lookup structures from parsed GTFS data.
 */
function buildLookups(stops, routes, trips, stopTimes, calendar) {
  const activeServiceIds = new Set();
  const now = new Date();
  const today = formatDateForCalendar(now);

  for (const row of calendar) {
    const start = row.start_date || row.startdate;
    const end = row.end_date || row.enddate;
    if (!start || !end) continue;
    if (today >= start && today <= end) {
      const dow = now.getDay();
      const dayMap = {
        0: "sunday",
        1: "monday",
        2: "tuesday",
        3: "wednesday",
        4: "thursday",
        5: "friday",
        6: "saturday",
      };
      const dayCol = dayMap[dow];
      if (row[dayCol] === "1") {
        activeServiceIds.add(row.service_id || row.serviceid);
      }
    }
  }
  // if no calendar or no active services, include all trips (fallback for feeds without calendar)
  let serviceFilter = (sid) => activeServiceIds.has(sid);
  if (activeServiceIds.size === 0) {
    serviceFilter = () => true;
  }

  const stopsMap = new Map();
  for (const row of stops) {
    const id = row.stop_id || row.stopid;
    if (!id) continue;
    stopsMap.set(id, {
      name: row.stop_name || row.stopname || "",
      lat: parseFloat(row.stop_lat || row.stoplat) || 0,
      lon: parseFloat(row.stop_lon || row.stoplon) || 0,
    });
  }

  const routesMap = new Map();
  for (const row of routes) {
    const id = row.route_id || row.routeid;
    if (!id) continue;
    routesMap.set(id, {
      routeShortName: row.route_short_name || row.routeshortname || "",
      routeType: row.route_type || row.routetype || "",
    });
  }

  const tripsMap = new Map();
  for (const row of trips) {
    const id = row.trip_id || row.tripid;
    if (!id) continue;
    if (!serviceFilter(row.service_id || row.serviceid)) continue;
    const routeId = row.route_id || row.routeid;
    const route = routesMap.get(routeId);
    if (!route || String(route.routeType) !== GTFS_ROUTE_TYPE_TRAM) continue;
    tripsMap.set(id, {
      routeId,
      headsign: row.trip_headsign || row.tripheadsign || "",
      routeShortName: route.routeShortName,
    });
  }

  const stopTimesByStop = new Map();
  for (const row of stopTimes) {
    const stopId = row.stop_id || row.stopid;
    const tripId = row.trip_id || row.tripid;
    const depTime = row.departure_time || row.departuretime;
    if (!stopId || !tripId || !depTime) continue;
    const trip = tripsMap.get(tripId);
    if (!trip) continue;
    const arr = stopTimesByStop.get(stopId) || [];
    arr.push({
      tripId,
      departureTime: depTime,
      routeShortName: trip.routeShortName,
      headsign: trip.headsign,
    });
    stopTimesByStop.set(stopId, arr);
  }

  for (const arr of stopTimesByStop.values()) {
    arr.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }

  return { stopsMap, stopTimesByStop };
}

function formatDateForCalendar(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * Get current time in Europe/Prague timezone.
 */
function nowInPrague() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Prague" })
  );
}

/**
 * Parse GTFS time (HH:MM:SS or H:MM:SS) to minutes since midnight.
 * Handles overflow: 24:15:00 = 25*60+15 = next day early am.
 */
function gtfsTimeToMinutesSinceMidnight(gtfsTime) {
  const parts = gtfsTime.trim().split(":");
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  // gtfs allows 24:xx:xx for next-day early am (e.g. 24:15 = 00:15 next day)
  return h * 60 + m + s / 60;
}

/**
 * Get minutes since midnight for a given date in Prague timezone.
 */
function minutesSinceMidnightPrague(d) {
  const str = d.toLocaleTimeString("en-GB", { timeZone: "Europe/Prague" });
  const [h, m, s] = str.split(":").map(Number);
  return h * 60 + m + s / 60;
}

/**
 * Ensure cache is loaded and fresh. Throws on download/parse failure.
 */
async function ensureCache() {
  const now = Date.now();
  if (cache && now - lastFetchTime < refreshIntervalMs) {
    return cache;
  }
  const buf = await downloadGtfsZip();
  const zip = new AdmZip(buf);
  const stops = extractAndParse(zip, "stops.txt");
  const routes = extractAndParse(zip, "routes.txt");
  const trips = extractAndParse(zip, "trips.txt");
  const stopTimes = extractAndParse(zip, "stop_times.txt");
  let calendar = [];
  try {
    calendar = extractAndParse(zip, "calendar.txt");
  } catch (e) {
    // calendar_dates.txt fallback not implemented; calendar.txt is standard
  }
  cache = buildLookups(stops, routes, trips, stopTimes, calendar);
  lastFetchTime = now;
  return cache;
}

/**
 * Get upcoming trips for a stop within the next windowMinutes.
 * Returns array of { tripId, scheduledDeparture, routeShortName, headsign }.
 */
export async function getUpcomingTripsForStop(stopId, windowMinutes) {
  const { stopTimesByStop } = await ensureCache();
  const trips = stopTimesByStop.get(stopId);
  if (!trips || trips.length === 0) return [];

  const pragueNow = nowInPrague();
  const nowMinutes = minutesSinceMidnightPrague(pragueNow);
  const windowEnd = nowMinutes + windowMinutes;

  const result = [];
  const dayMinutes = 24 * 60;

  for (const t of trips) {
    let depMinutes = gtfsTimeToMinutesSinceMidnight(t.departureTime);
    if (depMinutes < nowMinutes - 60) depMinutes += dayMinutes;
    if (depMinutes >= nowMinutes && depMinutes <= windowEnd) {
      const depDate = new Date(pragueNow);
      const totalMins = Math.floor(depMinutes);
      depDate.setHours(
        Math.floor(totalMins / 60),
        totalMins % 60,
        Math.round((depMinutes % 1) * 60),
        0
      );
      result.push({
        tripId: t.tripId,
        scheduledDeparture: depDate,
        routeShortName: t.routeShortName,
        headsign: t.headsign,
      });
    }
  }
  return result;
}

/**
 * Normalize string for search: lowercase, replace common Czech accents with ascii.
 */
function normalizeForSearch(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Find stops by name (case-insensitive partial match, accent-insensitive).
 */
export async function findStopsByName(name) {
  const { stopsMap } = await ensureCache();
  const query = normalizeForSearch(name);
  if (!query) return [];
  const results = [];
  for (const [id, stop] of stopsMap) {
    if (normalizeForSearch(stop.name).includes(query)) {
      results.push({ id, ...stop });
    }
  }
  return results;
}

/**
 * Set refresh interval (ms). Used by config.
 */
export function setRefreshIntervalMs(ms) {
  refreshIntervalMs = ms;
}

export { STOP_ID_PREFIX, LINE_ID_PREFIX, GTFS_URL };
