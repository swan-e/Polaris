import type { RawJob } from "../types";

/**
 * Ashby public job board API.
 *   https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 * Returns { jobs: [{ title, location, isRemote, jobUrl, applyUrl, employmentType,
 *                     publishedAt, descriptionPlain, compensation }] }
 */
export async function fetchAshby(slug: string): Promise<RawJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
  const res = await fetch(url, { headers: { "User-Agent": "nova-job-apply" } });
  if (!res.ok) {
    console.warn(`[ashby:${slug}] HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { jobs?: any[] };
  const jobs = data.jobs ?? [];

  return jobs.map((j): RawJob => {
    const location: string = j.location ?? j.locationName ?? "";
    return {
      source: `ashby:${slug}`,
      sourceType: "ashby",
      platform: "ashby",
      company: slug,
      title: j.title ?? "",
      location,
      remote: Boolean(j.isRemote) || /remote/i.test(location),
      url: j.jobUrl ?? j.applyUrl ?? "",
      postedAt: j.publishedAt,
      description: (j.descriptionPlain ?? "").slice(0, 4000),
      salary: summarizeComp(j.compensation),
      raw: j,
    };
  });
}

function summarizeComp(comp: any): string | undefined {
  if (!comp) return undefined;
  const tiers = comp.compensationTiers ?? comp.summaryComponents ?? [];
  if (Array.isArray(tiers) && tiers.length) {
    const t = tiers[0];
    if (t?.minValue && t?.maxValue) return `${t.currencyCode ?? "$"} ${t.minValue}-${t.maxValue}`;
  }
  return comp.compensationTierSummary ?? undefined;
}
