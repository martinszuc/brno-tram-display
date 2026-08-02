import fetch from "node-fetch";
import { NAMEDAY_URL, TIMEZONE } from "../config/constants.js";

let cached = null;
let cachedDate = null;

function getPragueDateStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

function cleanName(raw) {
  if (!raw || raw === "n/a") return null;
  const names = String(raw).split(/[/,]+/).map(s => s.trim()).filter(Boolean);
  return names.length ? names.join(" / ") : null;
}

export async function getNameday() {
  const today = getPragueDateStr();
  if (cached !== null && cachedDate === today) return cached;

  try {
    const res = await fetch(NAMEDAY_URL);
    if (!res.ok) throw new Error(`nameday ${res.status}`);
    const json = await res.json();
    const sk = cleanName(json?.data?.sk);
    const cz = cleanName(json?.data?.cz);
    if (!sk && !cz) throw new Error("unexpected nameday response shape");
    cached = { sk, cz };
    cachedDate = today;
    console.log(`[nameday] ${today}: sk=${sk ?? "-"} cz=${cz ?? "-"}`);
    return cached;
  } catch (err) {
    console.warn("[nameday] fetch failed:", err.message);
    return cached;
  }
}
