import type { GithubRepoSource, Platform, RawJob } from "../types";

/**
 * New-grad GitHub lists (SimplifyJobs, vanshb03, etc.).
 *
 * Strategy for format:"auto":
 *   1. Try known JSON listings feeds on common branches/paths (deterministic, preferred).
 *   2. Fall back to parsing the README markdown table.
 *
 * NOTE: these repos rename/restructure yearly. The candidate paths below cover the common
 * layouts; if a repo moves its feed, add an explicit `jsonPath` in sources.json. Verify
 * live when wiring (this code was written without network access).
 */
export async function fetchGithubRepo(src: GithubRepoSource): Promise<RawJob[]> {
  const branches = ["dev", "main", "master"];
  const candidatePaths = src.jsonPath
    ? [src.jsonPath]
    : [".github/scripts/listings.json", ".github/scripts/listings.js", "listings.json"];

  if (src.format !== "readme") {
    for (const branch of branches) {
      for (const path of candidatePaths) {
        const url = `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${branch}/${path}`;
        const jobs = await tryJsonFeed(url, src);
        if (jobs.length) return jobs;
      }
    }
  }

  if (src.format !== "json") {
    return await tryReadme(src, branches);
  }
  return [];
}

async function tryJsonFeed(url: string, src: GithubRepoSource): Promise<RawJob[]> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "nova-job-apply" } });
    if (!res.ok) return [];
    let text = await res.text();
    // Some repos wrap the array in JS (e.g. `const listings = [...]`). Extract the array.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    text = text.slice(start, end + 1);
    const listings = JSON.parse(text) as any[];
    return listings
      .filter((l) => l.active !== false && l.is_visible !== false)
      .map((l) => listingToJob(l, src));
  } catch {
    return [];
  }
}

function listingToJob(l: any, src: GithubRepoSource): RawJob {
  const locations: string[] = Array.isArray(l.locations) ? l.locations : l.location ? [l.location] : [];
  const locationStr = locations.join(", ");
  const url: string = l.url ?? l.application_link ?? "";
  return {
    source: `github:${src.owner}/${src.repo}`,
    sourceType: "github",
    platform: detectPlatform(url),
    company: l.company_name ?? l.company ?? "",
    title: l.title ?? l.role ?? "",
    location: locationStr,
    remote: /remote/i.test(locationStr),
    url,
    postedAt: l.date_posted ? new Date(Number(l.date_posted) * 1000 || l.date_posted).toISOString() : undefined,
    description: undefined, // resolved later from the ATS if needed
    raw: l,
  };
}

async function tryReadme(src: GithubRepoSource, branches: string[]): Promise<RawJob[]> {
  for (const branch of branches) {
    const url = `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${branch}/README.md`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "nova-job-apply" } });
      if (!res.ok) continue;
      const md = await res.text();
      const jobs = parseMarkdownTable(md, src);
      if (jobs.length) return jobs;
    } catch {
      /* try next branch */
    }
  }
  return [];
}

/**
 * Parse the common new-grad README table:
 *   | Company | Role | Location | Application/Link | Date |
 * A leading "↳" company cell means "same company as the row above".
 */
function parseMarkdownTable(md: string, src: GithubRepoSource): RawJob[] {
  const rows = md.split("\n").filter((line) => line.trim().startsWith("|") && line.includes("|"));
  const jobs: RawJob[] = [];
  let lastCompany = "";

  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
    if (cells.length < 3) continue;
    const header = cells.join(" ").toLowerCase();
    if (header.includes("company") && header.includes("role")) continue; // header row
    if (cells.every((c) => /^-+$/.test(c) || c === "")) continue; // separator

    let company = stripMd(cells[0]);
    if (company === "↳" || company === "") company = lastCompany;
    else lastCompany = company;

    const title = stripMd(cells[1]);
    const location = stripMd(cells[2]);
    const url = extractLink(cells[3] ?? "");

    if (!company || !title) continue;
    jobs.push({
      source: `github:${src.owner}/${src.repo}`,
      sourceType: "github",
      platform: detectPlatform(url),
      company,
      title,
      location,
      remote: /remote/i.test(location),
      url,
      raw: { row },
    });
  }
  return jobs;
}

function stripMd(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[🔒🛂🇺🇸\u{1F1E6}-\u{1F1FF}]/gu, "")
    .trim();
}

function extractLink(cell: string): string {
  const mdLink = cell.match(/\(([^)]+)\)/);
  if (mdLink) return mdLink[1];
  const href = cell.match(/href="([^"]+)"/);
  if (href) return href[1];
  const bare = cell.match(/https?:\/\/\S+/);
  return bare ? bare[0] : "";
}

export function detectPlatform(url: string): Platform {
  if (/greenhouse\.io|grnh\.se/i.test(url)) return "greenhouse";
  if (/lever\.co/i.test(url)) return "lever";
  if (/ashbyhq\.com/i.test(url)) return "ashby";
  if (/myworkday|workday/i.test(url)) return "workday";
  return "other";
}
