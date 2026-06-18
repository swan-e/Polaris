import type { RawJob } from "../types";

/**
 * Greenhouse public board API.
 *   https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 * Returns { jobs: [{ id, title, location:{name}, absolute_url, updated_at, content }] }
 * content is HTML-escaped; we strip tags for a plain-text description.
 */
export async function fetchGreenhouse(slug: string): Promise<RawJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
  const res = await fetch(url, { headers: { "User-Agent": "nova-job-apply" } });
  if (!res.ok) {
    console.warn(`[greenhouse:${slug}] HTTP ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { jobs?: any[] };
  const jobs = data.jobs ?? [];

  return jobs.map((j): RawJob => {
    const location: string = j.location?.name ?? "";
    const description = htmlToText(j.content ?? "");
    return {
      source: `greenhouse:${slug}`,
      sourceType: "greenhouse",
      platform: "greenhouse",
      company: slug,
      title: j.title ?? "",
      location,
      remote: /remote/i.test(location) || /remote/i.test(j.title ?? ""),
      url: j.absolute_url ?? "",
      postedAt: j.first_published ?? j.updated_at,
      description,
      raw: j,
    };
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}