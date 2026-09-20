import type { SizeBand } from "./data";

export const BAND_STORAGE_KEY = "smbe.size-band";
export const DEFAULT_BAND: SizeBand = "FROM_5_TO_19";

export function loadBand(): SizeBand {
  if (typeof window === "undefined") return DEFAULT_BAND;
  try {
    const raw = window.sessionStorage.getItem(BAND_STORAGE_KEY);
    if (
      raw === "UNDER_5" ||
      raw === "FROM_5_TO_19" ||
      raw === "FROM_20_TO_49" ||
      raw === "FROM_50"
    ) {
      return raw;
    }
  } catch {
    // ignore quota / privacy mode
  }
  return DEFAULT_BAND;
}

export function saveBand(band: SizeBand): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BAND_STORAGE_KEY, band);
  } catch {
    // ignore
  }
}
