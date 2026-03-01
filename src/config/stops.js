/**
 * Stop configuration. Uses GTFS stop_id format from KORDIS.
 * KORDIS uses U prefix for stop IDs (e.g. U123) per their GTFS convention.
 */

export const GTFS_URL =
  "https://kordis-jmk.cz/gtfs/gtfs.zip";
export const VEHICLE_POSITIONS_URL =
  "https://gis.brno.cz/ags1/rest/services/Hosted/ODAE_public_transit_positional_feature_service/FeatureServer/0";

export const STOPS = [
  {
    stopId: "U1146Z2",
    name: "Hlavní nádraží",
  },
];
