import type { JobBoardSource, RawJob } from "../types";
import { detectPlatform } from "./github";

/**
 * Generic job-board adapter (e.g. newgrad-jobs.com).
 *
 * Many modern boards are Next.js apps that embed their data in a `__NEXT_DATA__` script
 * tag, or expose a JSON API. We try, in order:
 *   1. `<script id="__NEXT_DATA__">` JSON, scanning for an array of job-like objects.
 *   2. (extend here) a site-specific JSON endpoint once confirmed.
 *
 * This parser is intentionally defensive: the exact shape of newgrad-jobs.com must be
 * confirmed against the live site (no network access at authoring time). If nothing
 * parses, it returns [] and logs a warning rather than throwing.
 */
export async function fetchJobBoard(src: JobBoardSource): Promise<RawJob[]> {
  try {
    const res = await fetch(src.url, { headers: { "User-Agent": "Mozilla/5.0 nova-job-apply" } });
    if (!res.ok) {
      console.warn(`[board:${src.name}] HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    const nextData = extractNextData(html);
    if (nextData) {
      const jobs = harvestJobs(nextData, src);
      if (jobs.length) return jobs;
    }
    console.warn(`[board:${src.name}] no recognizable job data found — parser needs the live site's shape`);
    return [];
  } catch (err) {
    console.warn(`[board:${src.name}] error: ${(err as Error).message}`);
    return [];
  }
}

function extractNextData(html: string): unknown | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** Recursively walk an object tree collecting things that look like job postings. */
function harvestJobs(node: unknown, src: JobBoardSource, out: RawJob[] = []): RawJob[] {
  if (Array.isArray(node)) {
    for (const item of node) harvestJobs(item, src, out);
    return out;
  }
  if (node && typeof node === "object") {
    const o = node as Record<string, any>;
    const title = o.title ?? o.role ?? o.jobTitle;
    const company = o.company ?? o.companyName ?? o.company_name ?? o.organization;
    const url = o.url ?? o.applyUrl ?? o.link ?? o.applicationUrl;
    if (title && company && url) {
      const location = String(o.location ?? o.locations ?? "");
      out.push({
        source: `board:${src.name}`,
        sourceType: "jobboard",
        platform: detectPlatform(String(url)),
        company: String(company),
        title: String(title),
        location,
        remote: /remote/i.test(location),
        url: String(url),
        postedAt: o.datePosted ?? o.date_posted ?? o.postedAt,
        raw: o,
      });
    }
    for (const v of Object.values(o)) harvestJobs(v, src, out);
  }
  return out;
}
