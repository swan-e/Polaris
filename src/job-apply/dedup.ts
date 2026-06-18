import type { RawJob } from "./types";
import { getSheetsClient } from "./auth";
import { ENV } from "./config";

/**
 * Existing tracker columns (A–H):
 *   A Job(role)  B Company  C Status  D Submission Platform
 *   E Location   F Completion Date  G Website  H Notes
 *
 * We dedup new candidates against rows already present, matching on either:
 *   - normalized company + role, or
 *   - the posting URL appearing in the Website column.
 */
export async function dedupAgainstSheet(jobs: RawJob[]): Promise<RawJob[]> {
  if (!ENV.sheetId) {
    console.warn("[dedup] JOB_SPREADSHEET_ID not set — skipping sheet dedup");
    return jobs;
  }

  const sheets = await getSheetsClient();
  // If no tab is configured, an unqualified A:H range reads the first sheet.
  const range = ENV.sheetTab ? `'${ENV.sheetTab}'!A:H` : "A:H";
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: ENV.sheetId, range });
  const rows = res.data.values ?? [];

  const seenPair = new Set<string>();
  const seenUrl = new Set<string>();
  for (const r of rows) {
    const role = (r[0] ?? "").toString();
    const company = (r[1] ?? "").toString();
    const website = (r[6] ?? "").toString();
    if (company || role) seenPair.add(pairKey(company, role));
    if (website) seenUrl.add(normUrl(website));
  }

  const fresh = jobs.filter((j) => {
    if (j.url && seenUrl.has(normUrl(j.url))) return false;
    if (seenPair.has(pairKey(j.company, j.title))) return false;
    return true;
  });

  console.log(`[dedup] ${jobs.length} → ${fresh.length} new (against ${rows.length} sheet rows)`);
  return fresh;
}

function pairKey(company: string, role: string): string {
  return `${norm(company)}|${norm(role)}`;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normUrl(u: string): string {
  return u.toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
}
