/**
 * Brno tram display — entry point.
 * Fetches departures for configured stops on a polling loop and renders to terminal.
 * Uses KORDIS GTFS + Brno ArcGIS vehicle positions — no API key required.
 */

import { fetchDepartures, configure } from "./src/adapters/kordis.js";
import { STOPS } from "./src/config/stops.js";

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "30000", 10);
const DEPARTURES_PER_STOP = parseInt(process.env.DEPARTURES_PER_STOP || "10", 10);
const DEPARTURES_WINDOW_MINUTES = parseInt(process.env.DEPARTURES_WINDOW_MINUTES || "90", 10);
const GTFS_REFRESH_INTERVAL_MS = parseInt(process.env.GTFS_REFRESH_INTERVAL_MS || "86400000", 10);

// ansi colours — keep it readable on dark terminal backgrounds
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";

configure({
    gtfsRefreshIntervalMs: GTFS_REFRESH_INTERVAL_MS,
    windowMinutes: DEPARTURES_WINDOW_MINUTES,
});

/**
 * Format a Date as HH:MM in Europe/Prague timezone.
 */
function formatTime(date) {
    return date.toLocaleTimeString("cs-CZ", {
        timeZone: "Europe/Prague",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

/**
 * Format delay as a human-readable string with colour coding.
 */
function formatDelay(delaySeconds, isRealtime) {
    if (!isRealtime) return `${DIM}[scheduled]${RESET}`;
    const mins = Math.round(delaySeconds / 60);
    if (mins === 0) return `${GREEN}on time${RESET}`;
    if (mins > 0) return `${YELLOW}+${mins} min${RESET}`;
    return `${GREEN}${mins} min early${RESET}`;
}

/**
 * Render all stops and their departures to stdout.
 */
function renderDepartures(stopResults) {
    // clear screen each cycle so it reads like a real display board
    process.stdout.write("\x1b[2J\x1b[H");

    const now = new Date();
    console.log(
        `${BOLD}${CYAN}Brno Tram Display${RESET}  ${DIM}updated ${formatTime(now)}${RESET}\n`
    );

    for (const { stop, departures, error } of stopResults) {
        console.log(`${BOLD}${stop.name}${RESET}  ${DIM}(${stop.stopId})${RESET}`);
        console.log("─".repeat(60));

        if (error) {
            console.log(`  ${RED}error fetching departures: ${error}${RESET}`);
        } else if (departures.length === 0) {
            console.log(`  ${DIM}no departures in the next ${DEPARTURES_WINDOW_MINUTES} minutes${RESET}`);
        } else {
            for (const dep of departures.slice(0, DEPARTURES_PER_STOP)) {
                const line = `${BOLD}${dep.routeShortName.padEnd(4)}${RESET}`;
                const dest = dep.headsign.padEnd(30);
                const time = formatTime(dep.time);
                const delay = formatDelay(dep.delaySeconds, dep.isRealtime);
                console.log(`  ${line} ${dest} ${CYAN}${time}${RESET}  ${delay}`);
            }
        }
        console.log();
    }
}

/**
 * Fetch departures for all configured stops in parallel.
 */
async function fetchAllStops() {
    return Promise.all(
        STOPS.map(async (stop) => {
            try {
                const departures = await fetchDepartures(stop.stopId, null, {
                    windowMinutes: DEPARTURES_WINDOW_MINUTES,
                });
                // sort by real ETA ascending
                departures.sort((a, b) => a.time - b.time);
                return { stop, departures, error: null };
            } catch (err) {
                console.error(`error fetching stop ${stop.stopId}:`, err.message);
                return { stop, departures: [], error: err.message };
            }
        })
    );
}

/**
 * One poll cycle: fetch and render.
 */
async function tick() {
    const results = await fetchAllStops();
    renderDepartures(results);
}

async function main() {
    console.log(
        `brno-tram-display starting — polling every ${POLL_INTERVAL_MS / 1000}s` +
        ` for ${STOPS.length} stop(s)\n`
    );
    console.log("downloading GTFS data (first run may take a few seconds)…\n");

    // run immediately, then on interval
    await tick();
    setInterval(tick, POLL_INTERVAL_MS);
}

main().catch((err) => {
    console.error("fatal error:", err);
    process.exit(1);
});