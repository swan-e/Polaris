import { sheets as makeSheets } from "@googleapis/sheets";
import type { sheets_v4 } from "@googleapis/sheets";
import { ENV } from "./config";

/**
 * Reuses Nova's existing OAuth — no new credentials, no new auth layer.
 * profiles.ts already exports loadProfile() + getGoogleAuth(), the same helpers
 * gmail.ts / calendar.ts / finance.ts use.
 *
 * This file assumes the module lives at  src/job-apply/  and profiles.ts at
 * src/lib/profiles.ts. If you place it elsewhere, fix this one import path.
 */
import { loadProfile, getGoogleAuth } from "../lib/profiles";

let _sheets: sheets_v4.Sheets | null = null;

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (_sheets) return _sheets;
  // Empty GOOGLE_PROFILE → loadProfile() uses your profiles.json defaultProfile.
  const profile = loadProfile(ENV.googleProfile || undefined);
  const auth = getGoogleAuth(profile);
  _sheets = makeSheets({ version: "v4", auth });
  return _sheets;
}
