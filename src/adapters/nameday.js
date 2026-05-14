import fetch from "node-fetch";
import { NAMEDAY_URL, TIMEZONE } from "../config/constants.js";

let cached = null;
let cachedDate = null;

function getPragueDate() {
  return new Date().toLocaleDateString("sv", { timeZone: TIMEZONE }); // "2026-05-15"
}

export async function getNamedaySk() {
  const today = getPragueDate();
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
