/** Filter criteria, location aliases, and environment config. */

import { optionalEnv } from "../lib/env";

export const ENV = {
  anthropicKey: optionalEnv("ANTHROPIC_API_KEY", ""),
  sheetId: optionalEnv("JOB_SPREADSHEET_ID", ""),
  sheetTab: optionalEnv("JOB_SHEET_TAB", ""),            // optional; empty = first sheet
  googleProfile: optionalEnv("GOOGLE_PROFILE", ""),      // "work" / "personal"; empty = defaultProfile
  haikuModel: optionalEnv("HAIKU_MODEL", "claude-haiku-4-5-20251001"),
  nightlyCap: Number(optionalEnv("NIGHTLY_CAP", "30")),
  scoreThreshold: Number(optionalEnv("SCORE_THRESHOLD", "55")), // only used if you re-enable gating
  maxAgeHours: Number(optionalEnv("MAX_AGE_HOURS", "72")),      // 0 = no recency limit
  experiencesUrl: optionalEnv("RESUME_EXPERIENCES_URL", "https://seanfleming.dev/data/experiences.json"),
  projectsUrl: optionalEnv("RESUME_PROJECTS_URL", "https://seanfleming.dev/data/projects.json"),
};

/**
 * Title keywords that QUALIFY a role: software roles (any flavor, incl. Forward Deployed),
 * internships, and product/project/program management. Matched with word boundaries.
 */
export const INCLUDE_TITLE = [
  "software engineer",
  "software developer",
  "software dev",
  "swe",
  "forward deployed",
  "frontend engineer", "front end engineer", "front-end engineer",
  "backend engineer", "back end engineer", "back-end engineer",
  "full stack engineer", "fullstack engineer", "full-stack engineer",
  "web developer", "web engineer",
  "platform engineer", "applications engineer", "application engineer",
  "developer",
  "new grad", "new graduate", "entry level", "entry-level", "early career", "early-career",
  "university grad", "university graduate", "associate software", "associate engineer",
  "product manager", "project manager", "program manager",
  "product management", "project management",
  "intern", "internship",
];

/** Title keywords that DISQUALIFY a role: clearly too senior, or engineering people-management. */
export const EXCLUDE_TITLE = [
  "senior",
  "sr.",
  "sr ",
  "staff",
  "principal",
  "distinguished",
  "lead engineer",
  "lead software",
  "engineering manager",
  "manager, engineering",
  "director",
  "head of",
  "vp ",
  "vice president",
  "architect",
];

/**
 * Allowed locations. Each entry has aliases that may appear in postings.
 * Matching is case-insensitive substring against the posting location string.
 */
export const LOCATION_ALIASES: Record<string, string[]> = {
  "Los Angeles": ["los angeles", "l.a.", "santa monica", "culver city", "el segundo", "pasadena", "torrance"],
  "New York City": ["new york", "nyc", "manhattan", "brooklyn", "new york city", "ny, ny"],
  "Northern Virginia": [
    "northern virginia", "reston", "mclean", "sterling", "alexandria", "arlington",
    "herndon", "tysons", "washington, dc", "washington dc", "dc metro", "fairfax",
  ],
  Chicago: ["chicago"],
  "San Francisco": ["san francisco", "sf", "bay area", "south san francisco", "palo alto", "mountain view", "menlo park", "sunnyvale", "san jose"],
};

/** Strings that indicate a US-remote role. */
export const REMOTE_ALIASES = ["remote", "remote - us", "remote (us)", "us remote", "remote, us", "anywhere in the us"];

/** Markers used to reject "remote" roles that are remote-but-foreign. */
export const NON_US_REMOTE_HINTS = ["emea", "apac", "europe", "uk", "canada", "india", "latam", "remote - ca", "remote, canada"];