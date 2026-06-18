# Nova — Auto Job Application Module (`job-apply`)

Overnight discovery + tailored-resume + prepare-and-queue pipeline for new-grad SWE
roles. Runs locally inside the existing Nova Docker Compose stack; scheduled by Ofelia;
notifies via Discord webhook; submission is human-triggered from a phone-reachable card UI.

---

## Operating model

**Prepare + queue** (v1). The pipeline discovers jobs, builds a tailored resume per job,
pre-fills every form field it safely can, and saves a self-contained record to disk. You
review and tap **Submit** in the card UI. Nothing is auto-submitted in v1; a future
`AUTO_APPLY` toggle enables true overnight submission once the queue is trusted.

This keeps us **zero-ToS-risk**: the actual submit is your own action in your own
authenticated browser session. LinkedIn is out of scope (handled manually).

---

## Data flow

```
sources.json
   │  github_repos · job_boards · ats_companies
   ▼
discovery/  ── resolve each source to the ATS JSON API where possible (free, deterministic)
   │         greenhouse · lever · ashby · github(new-grad lists) · jobboard
   ▼
normalize → RawJob[]            (unified shape)
   ▼
filter.ts   ── rules: new-grad SWE title, allowed locations + Remote-US, exclude
   │            senior/intern/manager and high-YOE roles
   ▼
dedup.ts    ── drop anything already in the Google Sheet (company+title / URL match)
   ▼
scoring.ts  ── Haiku, batched, prompt-cached criteria → relevance score + reason
   │            (only used to rank down to the nightly cap when candidates > cap)
   ▼
top N (cap, default 30) → data/candidates.json
   ▼
[next stage] resume builder → tectonic PDF → form-field mapping from profile.json
   ▼
[next stage] queue record {job meta, resume.pdf, prepared answers, unknown-field flags}
   ▼
log row to Google Sheet  →  Status (col C) = "In Progress" (exact dropdown value)
   ▼
notification gate → Discord webhook ping when you're reachable
   ▼
YOU: card UI → review → Submit (fresh Playwright session) → Sheet row → "Completed"
```

This document's code covers **discovery → filter → dedup → score → candidates.json**.
Resume building, form mapping, the queue server, and the card UI are later stages.

---

## Sources (`sources.json`)

Three lanes, all editable any time (read fresh each run, no redeploy):

- **`github_repos`** — daily-refreshed new-grad lists. `format: "auto"` detects a JSON
  listings feed (preferred, deterministic) and falls back to parsing the README table.
- **`job_boards`** — sites like newgrad-jobs.com.
- **`ats_companies`** — direct Greenhouse / Lever / Ashby company slugs. Most reliable and
  fastest source (official APIs), best for first-hour detection.

A **slug** is the company identifier in its ATS URL
(`boards.greenhouse.io/stripe` → `stripe`).

---

## Filtering criteria

- **Role:** new-grad / entry-level / early-career Software Engineer. Include keywords:
  software engineer, swe, new grad, entry level, early career, university graduate,
  associate software engineer, 2026. Exclude: senior, staff, principal, lead, manager,
  director, intern/internship, and postings demanding meaningful YOE (e.g. "5+ years").
- **Location:** Los Angeles, New York City, Northern Virginia
  (Reston, McLean, Sterling, Alexandria, Arlington, Herndon, Tysons; plus "Northern
  Virginia" / DC metro), Chicago, San Francisco / Bay Area, and **Remote (US)**.
- Location aliases are matched generously; remote flags from the ATS are honored.

---

## Resume tailoring (later stage, design locked)

- `experiences.json` and `projects.json` stay **separate** and keep all existing base
  keys (your website parser is unaffected). Each entry gains an **additive `resume`**
  object: `{ org, date, tags[], bullets:[{text, tags[]}] }`.
- The agent only **selects and orders** pre-approved blocks/bullets — it never writes new
  bullets at apply-time. (No-fabrication guarantee.) Bullet wording is locked once in an
  interactive enrichment pass.
- Always keeps Education + Skills + header; reorders the Skills line to lead with the JD's
  stack; swaps header location: **Sterling, VA** for NoVA jobs, **Torrance, CA** elsewhere
  (incl. remote). Portfolio link = **seanfleming.dev**. Compiles locally with `tectonic`.

---

## Forms

- Standard questions answer deterministically from `profile.json` (free).
- EEO answers come from `profile.json` (you maintain these values).
- An **unknown but profile-worthy** field (e.g. "Years of Python") triggers: (a) a Discord
  ping suggesting a `profile.json` addition, and (b) a short note in the existing **Notes
  column (H)** of the sheet. No sheet/tool schema changes needed.
- Anything unanswerable pauses that application and flags it in the queue as "needs manual".

---

## Schedule (Ofelia)

All pings pass through a **notification gate** that holds until you're reachable.
Gate suppresses when: 00:00–07:00 (sleep), the "routine" calendar block is active, or
Google Calendar shows you busy/in a meeting.

- **Tue–Fri:** silent prep at **02:00** and **06:50** (queue ready before you leave; ping
  releases when the routine block ends, ~07:20, landing during the commute). Prep again at
  **16:15**; ping once you're home/free.
- **Mon / Sat / Sun:** prep at **09:30** and **13:30**; ping when the gate clears.

---

## Security

- Card UI lives at **`apply.seanfleming.dev`** via Cloudflare Tunnel (separate public
  hostname; no conflict with the apex professional site or the receipts route).
- **Cloudflare Access (Zero Trust)** gates the subdomain — Google login, only you.
  Required because the UI can submit applications.

---

## Cost

ATS JSON APIs make discovery deterministic (no LLM). LLM use = batched Haiku scoring +
Haiku resume-block selection + occasional open-ended form answers, all with prompt caching
of the static block library / profile / system prompts. Estimate **~$0.40–0.80/night →
~$10–25/month**.

---

## File layout

```
job-apply/
  ARCHITECTURE.md         this file
  sources.json            source config (you edit)
  .env.example            env template
  package.json
  tsconfig.json
  data/
    candidates.json       pipeline output (gitignored)
  src/
    types.ts              shared types
    config.ts             filter criteria + env + constants
    sources.ts            load/validate sources.json
    auth.ts               Google auth adapter (reuses Nova profiles.ts)
    discovery/
      greenhouse.ts
      lever.ts
      ashby.ts
      github.ts           new-grad lists (JSON feed or README table)
      jobboard.ts         generic board (newgrad-jobs.com)
      index.ts            aggregate all sources → RawJob[]
    filter.ts             rule-based new-grad/location filter
    dedup.ts              dedup against the Google Sheet
    scoring.ts            Haiku batched scoring + caching
    pipeline.ts           orchestrator → writes candidates.json
    index.ts              CLI entry (Ofelia calls this)
```

## Env vars

```
ANTHROPIC_API_KEY=          # shared with Nova
JOB_SHEET_ID=               # existing job-tracker spreadsheet ID
JOB_SHEET_TAB=              # tab/sheet name holding the tracker rows
GOOGLE_PROFILE=personal     # which profiles.ts profile to use
HAIKU_MODEL=claude-haiku-4-5-20251001
NIGHTLY_CAP=30
```

## Build status

- [x] discovery + filter + dedup + scoring + candidates.json   ← this commit
- [ ] resume block enrichment (interactive) + tectonic builder
- [ ] form-field mapping from profile.json + unknown-field flagging
- [ ] queue server + card UI (apply.seanfleming.dev, Cloudflare Access)
- [ ] notification gate (Discord webhook + Calendar busy-suppression)
- [ ] Ofelia schedule wiring + AUTO_APPLY toggle
