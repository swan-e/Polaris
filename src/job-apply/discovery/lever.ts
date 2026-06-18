import type { RawJob } from "../types";

/**
 * Lever postings API.
 *   https://api.lever.co/v0/postings/{slug}?mode=json
 * Returns an array of postings.
 */
export async function fetchLever(slug: string): Promise<RawJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  const res = await fetch(url, { headers: { "User-Agent": "nova-job-apply" } });
  if (!res.ok) {
    console.warn(`[lever:${slug}] HTTP ${res.status}`);
    return [];
  }
  const postings = (await res.json()) as any[];

  return postings.map((p): RawJob => {
    const location: string = p.categories?.location ?? "";
    const workplace: string = p.workplaceType ?? "";
    const remote = /remote/i.test(workplace) || /remote/i.test(location);
    return {
      source: `lever:${slug}`,
      sourceType: "lever",
      platform: "lever",
      company: slug,
      title: p.text ?? "",
      location,
      remote,
      url: p.hostedUrl ?? p.applyUrl ?? "",
      postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      description: (p.descriptionPlain ?? "").slice(0, 4000),
      salary: p.salaryRange
        ? `${p.salaryRange.currency ?? ""} ${p.salaryRange.min ?? ""}-${p.salaryRange.max ?? ""}`.trim()
        : undefined,
      raw: p,
    };
  });
}
