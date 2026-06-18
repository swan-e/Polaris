import type { RawJob } from "./types";
import {
  INCLUDE_TITLE,
  EXCLUDE_TITLE,
  LOCATION_ALIASES,
  REMOTE_ALIASES,
  NON_US_REMOTE_HINTS,
  ENV,
} from "./config";

export interface FilterResult {
  kept: RawJob[];
  rejected: { job: RawJob; reason: string }[];
}

export function filterJobs(jobs: RawJob[]): FilterResult {
  const kept: RawJob[] = [];
  const rejected: { job: RawJob; reason: string }[] = [];
  const now = Date.now();
  const maxAgeMs = ENV.maxAgeHours > 0 ? ENV.maxAgeHours * 3_600_000 : 0;

  for (const job of jobs) {
    const title = job.title.toLowerCase();

    if (EXCLUDE_TITLE.some((kw) => titleHas(title, kw))) {
      rejected.push({ job, reason: "excluded title keyword (too senior / management)" });
      continue;
    }
    if (!INCLUDE_TITLE.some((kw) => titleHas(title, kw))) {
      rejected.push({ job, reason: "title not SWE / intern / PM" });
      continue;
    }
    if (!matchLocation(job)) {
      rejected.push({ job, reason: `location not in scope: "${job.location}"` });
      continue;
    }
    if (maxAgeMs && job.postedAt) {
      const age = now - Date.parse(job.postedAt);
      if (Number.isFinite(age) && age > maxAgeMs) {
        rejected.push({ job, reason: `older than ${ENV.maxAgeHours}h` });
        continue;
      }
    }
    kept.push(job);
  }

  console.log(`[filter] ${jobs.length} → ${kept.length} kept, ${rejected.length} rejected`);
  return { kept, rejected };
}

/** Word-boundary match so "lead " doesn't catch "leadership" and "intern" doesn't catch "internal". */
function titleHas(title: string, kw: string): boolean {
  if (kw.endsWith(" ")) return title.includes(kw);
  const re = new RegExp(`(^|[^a-z])${escapeRe(kw)}([^a-z]|$)`, "i");
  return re.test(title);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns the matched location bucket, "Remote (US)", or null. */
export function matchLocation(job: RawJob): string | null {
  const loc = job.location.toLowerCase();

  if (job.remote || REMOTE_ALIASES.some((a) => loc.includes(a))) {
    if (NON_US_REMOTE_HINTS.some((h) => loc.includes(h))) return null;
    return "Remote (US)";
  }
  for (const [bucket, aliases] of Object.entries(LOCATION_ALIASES)) {
    if (aliases.some((a) => loc.includes(a))) return bucket;
  }
  return null;
}