# Integration & Testing — `job-apply`

## 0. Placement

Drop this whole folder into your Nova project as **`src/job-apply/`** (sibling of
`src/lib`, `src/tools`, `src/scripts`). It shares Nova's `package.json`, `tsconfig.json`,
and `node_modules` — no separate package. `auth.ts` imports `../lib/profiles.js`; if you
place it somewhere else, fix that one path.

## 1. Dependencies

Add to Nova's **root** `package.json` (skip any you already have):

```
npm install @anthropic-ai/sdk @googleapis/sheets
```

`google-auth-library` is already present (profiles.ts uses it).

## 2. Env vars

You already have the two required vars in Nova's `.env`:

```
JOB_SPREADSHEET_ID=...      # already present
ANTHROPIC_API_KEY=...       # already present
```

Everything else is optional with defaults — only set if you want to override:

```
# JOB_SHEET_TAB=           # tracker tab name; empty = first sheet
# GOOGLE_PROFILE=          # profiles.json profile; empty = your defaultProfile
# HAIKU_MODEL=claude-haiku-4-5-20251001
# NIGHTLY_CAP=30
# SCORE_THRESHOLD=55
```

## 3. Wire into `src/index.ts` (the MCP server) — 3 spots

```ts
// (1) near your other imports
import { jobApplyTools, handleJobApplyTool } from "./job-apply/mcp";

// (2) in your ListToolsRequestSchema handler, where you return { tools: [...] }
return { tools: [ ...yourExistingTools, ...jobApplyTools ] };

// (3) in your CallToolRequestSchema handler, BEFORE the final
//     `throw new Error(\`Unknown tool: ${name}\`)`:
const jobResult = await handleJobApplyTool(name, args);
if (jobResult) return jobResult;
```

That exposes two tools in Claude Code: `discover_jobs` and `list_candidates`.

## 4. Add to `CLAUDE.md`

Paste this section:

```md
## Job Apply (`src/job-apply/`)

Overnight new-grad SWE discovery + (later) prepare-and-queue pipeline.

- **What it does now:** reads `src/job-apply/sources.json` (GitHub new-grad repos,
  job boards, direct Greenhouse/Lever/Ashby slugs), resolves postings via the ATS
  JSON APIs, filters to new-grad SWE in LA / NYC / NoVA / Chicago / SF / Remote-US,
  dedups against the tracker sheet, scores with Haiku, and writes
  `src/job-apply/data/candidates.json`.
- **Run manually:** `npx tsx src/job-apply/index.ts`
- **MCP tools:** `discover_jobs` (run a cycle), `list_candidates` (show results).
- **Config:** edit `sources.json` to add/remove sources. A `slug` is the company id
  in its ATS URL (boards.greenhouse.io/<slug>). Optional `jsonPath` on a github_repos
  entry overrides the auto-detected listings-feed path inside that repo.
- **Env:** JOB_SPREADSHEET_ID (+ optional JOB_SHEET_TAB, GOOGLE_PROFILE), HAIKU_MODEL, NIGHTLY_CAP,
  SCORE_THRESHOLD.
- **Auth:** reuses profiles.ts (loadProfile + getGoogleAuth) — no new credentials.
- **Status:** discovery/filter/dedup/score built. Resume builder, form mapping,
  queue UI (apply.seanfleming.dev + Cloudflare Access), Discord webhook + Calendar
  busy-suppression, and the Ofelia schedule are still to come.
```

## 5. Ofelia (later)

When ready, schedule `npx tsx src/job-apply/index.ts` on the cadence in
`ARCHITECTURE.md` (Tue–Fri 02:00 / 06:50 / 16:15; Mon/Sat/Sun 09:30 / 13:30). For now
just run it by hand while testing.

---

## How to test (do this in order)

**Test 1 — does it run + reach the ATS APIs?**
Start with a *minimal* `sources.json` — one company you know uses Greenhouse:

```json
{ "github_repos": [], "job_boards": [],
  "ats_companies": [ { "platform": "greenhouse", "slug": "stripe" } ] }
```

Run `npx tsx src/job-apply/index.ts`. You should see
`[discovery] N raw → N unique ...` and a `[filter] ...` line. If discovery returns 0,
the slug is wrong or the company isn't on Greenhouse — try `lever`/`ashby` or another slug.

**Test 2 — filtering.** Add a few more slugs. Confirm the `[filter]` line rejects
senior/intern/out-of-area roles and keeps new-grad SWE ones. Tune keyword lists in
`config.ts` if something legit gets dropped.

**Test 3 — sheet dedup.** With `JOB_SHEET_ID`/`JOB_SHEET_TAB` set, run again. The
`[dedup] X → Y new (against Z sheet rows)` line proves auth works and that jobs already
in your tracker are skipped. If it says "JOB_SPREADSHEET_ID not set", fix `.env`. If it throws
on auth, recheck the `../lib/profiles.js` import path and that GOOGLE_PROFILE exists.

**Test 4 — scoring.** Add enough sources that candidates exceed `NIGHTLY_CAP`. You should
see a `[scoring]` line and scores in the output. Under the cap, scoring is skipped on
purpose (nothing to trim, saves money).

**Test 5 — the MCP tools.** After wiring `index.ts`, restart the MCP and from Claude Code
run `discover_jobs`, then `list_candidates`. Inspect `src/job-apply/data/candidates.json`.

**Test 6 — github + job board (the two unverified parsers).** Add your real new-grad
repos and `newgrad-jobs.com`. Watch for warnings like "no recognizable job data found"
(board parser needs the live shape) or an empty github result (add a `jsonPath`). These
are the two spots most likely to need a small tweak against live data.
