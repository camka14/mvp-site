export const E2E_EVENT_IDS = {
  createFlow: "event_create_e2e",
  googleMaps: "event_maps_e2e",
  leaguePlayoffMobile: "event_league_mobile_e2e",
  rentalPurchase: "rental_purchase_e2e",
} as const;

export const E2E_EVENT_PREFIXES = [
  "event_create_",
  "event_maps_",
  "event_league_mobile_",
  "rental_purchase_",
] as const;
