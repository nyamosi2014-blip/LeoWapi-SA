/**
 * Market profile. Every country-specific rule reads from here instead of
 * being written into components. Cities and areas themselves live in the
 * database (`cities`, `areas`); this file only says which are launched.
 */
export type MarketConfig = {
  country: string;
  brand: string;
  locale: string;
  currency: { code: string; symbol: string };
  timeZone: string;
  phone: { countryCode: string; nationalDigits: number };
  launchCities: string[];
  providers: {
    maps: "google" | "none";
    email: "resend" | "none";
    rideHailing: Array<"uber" | "bolt">;
  };
  features: {
    ticketing: boolean;
    payments: boolean;
    tripSharing: boolean;
    publicRatings: boolean;
    safetyScores: boolean;
  };
  /** Request rules carried over from the Tanzania prototype (rqValidate). */
  requests: { maxDaysAhead: number; minGuests: number; maxGuests: number; maxNoteLength: number };
  /** An area page is listed only when it has this many verified venues. */
  minVerifiedVenuesPerArea: number;
  /**
   * Budget bands per person, in whole rand. Starting values only: they replace the
   * prototype's TSh bands and should be tuned once real venue prices are collected.
   */
  budgetBands: Array<{ id: string; label: string; min: number; max: number | null }>;
};

export const market: MarketConfig = {
  country: "ZA",
  brand: "LeoWapi SA",
  locale: "en-ZA",
  currency: { code: "ZAR", symbol: "R" },
  timeZone: "Africa/Johannesburg",
  phone: { countryCode: "+27", nationalDigits: 9 },
  launchCities: ["johannesburg", "pretoria"],
  providers: { maps: "google", email: "resend", rideHailing: ["uber", "bolt"] },
  features: {
    ticketing: false,
    payments: false,
    tripSharing: false,
    // Approved 28 Oct 2026: no public ratings until a moderated review system exists,
    // and no safety scores. Only sourced, verified safety facts are shown.
    publicRatings: false,
    safetyScores: false,
  },
  requests: { maxDaysAhead: 183, minGuests: 1, maxGuests: 30, maxNoteLength: 300 },
  minVerifiedVenuesPerArea: 3,
  budgetBands: [
    { id: "easy", label: "Under R200", min: 0, max: 200 },
    { id: "middle", label: "R200–R500", min: 200, max: 500 },
    { id: "premium", label: "R500–R1 000", min: 500, max: 1000 },
    { id: "luxury", label: "R1 000+", min: 1000, max: null },
  ],
};
