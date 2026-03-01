# Brno Tram Display

Displays tram departures for Brno using free, unlimited official KORDIS and Brno data sources. No API keys. No rate limits.

## Data Sources

- **Static schedules**: [KORDIS GTFS](https://kordis-jmk.cz/gtfs/gtfs.zip) — full GTFS zip, re-fetched every 24h
- **Live vehicle positions**: [Brno ArcGIS FeatureServer](https://gis.brno.cz/ags1/rest/services/Hosted/ODAE_public_transit_positional_feature_service/FeatureServer/0) — updates every 10s, CC BY 4.0

## Setup

1. Clone and install: `npm install`
2. No API key needed — all data sources are public and free
3. Configure stops in `src/config/stops.js` using GTFS `stop_id` from KORDIS
4. To find stop IDs: download the [GTFS zip](https://kordis-jmk.cz/gtfs/gtfs.zip), extract `stops.txt`, and look up your stop. KORDIS uses `U` prefix for stop IDs (e.g. `U123`)
5. Copy `.env.example` to `.env` and adjust if needed

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| POLL_INTERVAL_MS | 30000 | How often to poll departures |
| DEPARTURES_PER_STOP | 10 | Max departures per stop |
| DISPLAY_MODE | default | Display mode |
| PORT | 3000 | Server port |
| GTFS_REFRESH_INTERVAL_MS | 86400000 | GTFS cache refresh (24h) |
| DEPARTURES_WINDOW_MINUTES | 90 | Departure lookup window |

## Run

```bash
npm start
```
