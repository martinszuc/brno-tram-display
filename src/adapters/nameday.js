import fetch from "node-fetch";
import { NAMEDAY_URL, TIMEZONE } from "../config/constants.js";

let cached = null;
let cachedDate = null;

function getPragueDateStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

export async function getNamedaySk() {
  const today = getPragueDateStr();
  if (cached !== null && cachedDate === today) return cached;

  try {
    const res = await fetch(NAMEDAY_URL);
    if (!res.ok) throw new Error(`nameday ${res.status}`);
    const json = await res.json();
    const raw = json?.data?.sk ?? null;
    if (!raw) throw new Error("unexpected nameday response shape");
    const names = String(raw).split(/[/,]+/).map(s => s.trim()).filter(Boolean);
    cached = names.join(" / ");
    cachedDate = today;
    console.log(`[nameday] ${today}: ${name}`);
    return cached;
  } catch (err) {
    console.warn("[nameday] fetch failed:", err.message);
    return cached;
  }
}
