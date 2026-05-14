/**
 * Data assembly for the web display. Fetches departures and weather in parallel.
 */

import { fetchDepartures } from "../adapters/kordis.js";
import { getWeatherBrno } from "../adapters/openmeteo.js";
import { getNamedaySk } from "../adapters/nameday.js";
import { applyFilters } from "./terminal.js";
import { WEB_MAX_DISPLAY_ROWS } from "../config/constants.js";
const DEBUG = !!process.env.DEBUG;

function dbg(...args) {
  if (DEBUG) console.debug("[web-data]", ...args);
}

export async function getAllDepartures(stops, windowMinutes) {
  const results = await Promise.all(
    stops.map(async (stop) => {
      try {
        let deps = await fetchDepartures(stop.stopId, null, { windowMinutes });
        dbg(`stop ${stop.stopId} (${stop.name}): ${deps.length} raw departures`);
        deps = applyFilters(deps, stop);
        dbg(`stop ${stop.stopId} (${stop.name}): ${deps.length} after filters`);
        if (DEBUG) {
          for (const d of deps) {
            console.debug(
              `[web-data]   line=${d.routeShortName} tripId=${d.tripId ?? "?"} time=${d.time.toISOString()} headsign="${d.headsign}" rt=${d.isRealtime}`
            );
          }
        }
        return deps.map((d) => ({
          ...d,
          stopName: stop.name,
          stopLogo: stop.logo ?? null,
          minMinutes: stop.lineMinMinutes?.[d.routeShortName] ?? stop.minMinutes ?? 1,
          stopSpecific: (stop.lines?.length > 0),
        }));
      } catch (err) {
        console.warn(`[web-data] fetchDepartures failed for ${stop.stopId}:`, err.message);
        return [];
      }
    })
  );

  const flat = results.flat().sort((a, b) => a.time - b.time);

  // Pass 1: deduplicate by tripId — same trip can appear from two stops (e.g. both platforms);
  // prefer the entry from a line-specific stop so branded logos (Albert, Lidl) are preserved
  const seen = new Map();
  for (const d of flat) {
    const existing = seen.get(d.tripId);
    if (!existing || (!existing.stopSpecific && d.stopSpecific)) {
      seen.set(d.tripId, d);
    }
  }
  const byTripId = [...seen.values()].sort((a, b) => a.time - b.time);

  // Pass 2: deduplicate by (line + stopName + departure minute) — catches the case where
  // the same line has different tripIds at two platforms of the same stop (e.g. Z1 vs Z2
  // are opposite-direction platforms). Again prefer the line-specific stop entry.
  const seen2 = new Map();
  for (const d of byTripId) {
    const minute = Math.floor(d.time.getTime() / 60000);
    const key = `${d.routeShortName}|${d.stopName}|${minute}`;
    const existing = seen2.get(key);
    if (!existing || (!existing.stopSpecific && d.stopSpecific)) {
      seen2.set(key, d);
    }
  }
  const deduped = [...seen2.values()].sort((a, b) => a.time - b.time);

  const filtered = deduped.filter((d) => (d.time - new Date()) >= (d.minMinutes ?? 1) * 60000);
  const final = filtered.slice(0, WEB_MAX_DISPLAY_ROWS);

  if (DEBUG) {
    console.debug(`[web-data] merged total=${flat.length} after tripId dedup=${byTripId.length} after stop dedup=${deduped.length} after >1min filter=${filtered.length} after slice=${final.length}`);
    for (const d of final) {
      console.debug(
        `[web-data]   line=${d.routeShortName} stop=${d.stopName} tripId=${d.tripId ?? "?"} time=${d.time.toISOString()} rt=${d.isRealtime}`
      );
    }
  }

  return final;
}

export async function getWeather() {
  return getWeatherBrno();
}

export async function getNameday() {
  return getNamedaySk();
}
