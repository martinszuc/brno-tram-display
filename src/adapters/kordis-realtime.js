/**
 * kordis-realtime.js
 * Fetches live vehicle positions from Brno ArcGIS FeatureServer.
 * Filters isinactive=false and vtype=1 (trams only). Caches response 10s.
 */

import fetch from "node-fetch";

const VEHICLE_POSITIONS_URL =
  "https://gis.brno.cz/ags1/rest/services/Hosted/ODAE_public_transit_positional_feature_service/FeatureServer/0/query";
const CACHE_TTL_MS = 10000;
const VTYPE_TRAM = 1;

let cachedDelays = null;
let cacheTime = 0;

/**
 * Build query URL for ArcGIS FeatureServer.
 */
function buildQueryUrl() {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "lineid,linename,delay,laststopid,finalstopid,vtype",
    f: "json",
    returnGeometry: "false",
  });
  return `${VEHICLE_POSITIONS_URL}?${params}`;
}

/**
 * Fetch vehicle positions and return Map of lineKey -> delayMinutes.
 * lineKey is normalized for lookup: routeShortName "1" maps to "1", api may return 1 or "L1".
 */
async function fetchVehiclePositions() {
  const url = buildQueryUrl();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `vehicle positions fetch failed: ${res.status} ${res.statusText}`
    );
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`vehicle positions api error: ${json.error.message || JSON.stringify(json.error)}`);
  }
  const features = json.features || [];
  const delays = new Map();
  for (const f of features) {
    const attrs = f.attributes || {};
    if (attrs.isinactive === true || attrs.isinactive === "true" || attrs.isinactive === 1) continue; // filter inactive if api returns it
    if (Number(attrs.vtype) !== VTYPE_TRAM) continue;
    const lineid = attrs.lineid;
    const delay = parseFloat(attrs.delay);
    if (lineid == null || Number.isNaN(delay)) continue;
    const key = String(lineid).replace(/^L/i, "") || String(lineid);
    if (!delays.has(key) || delay > (delays.get(key) ?? 0)) {
      delays.set(key, Math.round(delay));
    }
  }
  return delays;
}

/**
 * Get delays by line. Returns Map<lineKey, delayMinutes>.
 * Caches for CACHE_TTL_MS to avoid hammering when multiple stops poll.
 */
export async function getDelaysByLine() {
  const now = Date.now();
  if (cachedDelays !== null && now - cacheTime < CACHE_TTL_MS) {
    return cachedDelays;
  }
  try {
    cachedDelays = await fetchVehiclePositions();
    cacheTime = now;
    return cachedDelays;
  } catch (err) {
    if (cachedDelays !== null) {
      return cachedDelays;
    }
    throw err;
  }
}

export { VEHICLE_POSITIONS_URL, CACHE_TTL_MS };
