import fetch from "node-fetch";
import { NAMEDAY_URL, TIMEZONE } from "../config/constants.js";

let cached = null;
let cachedDate = null;

// Key by UTC date — the API's /today endpoint is UTC-based, so this prevents
// caching the wrong name when Prague midnight fires before UTC midnight.
function getUtcDateStr() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function getNamedaySk() {
  const today = getUtcDateStr();
  if (cached !== null && cachedDate === today) return cached;

  try {
    const res = await fetch(NAMEDAY_URL);
    if (!res.ok) throw new Error(`nameday ${res.status}`);
    const json = await res.json();
    const name = json?.data?.sk ?? null;
    if (!name) throw new Error("unexpected nameday response shape");
    cached = name;
    cachedDate = today;
    console.log(`[nameday] ${today}: ${name}`);
    return cached;
  } catch (err) {
    console.warn("[nameday] fetch failed:", err.message);
    return cached;
  }
}
