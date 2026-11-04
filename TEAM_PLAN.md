# PS5 "The Fake HR Email": Team Plan (3 people, submit by 6 Nov)

## Context
Arthakram hackathon (Rishihood). PS5 asks for a tool where a student checks a suspicious placement message and gets a risk level (low/med/high), red flags in plain words, and one clear next step. **The catch:** warnings get ignored and alert fatigue sets in, so the tool must be short, specific and useful at the moment of doubt. Scoring is 60 build / 40 pitch. Defensive only (disqualification otherwise).

About 80% of teams are on PS5. Most will build "paste → AI says HIGH." We beat them on **evidence**: we don't just read the mail, we *check its claims against the outside world* (the company, the sender, the link/form) and show the proof. That's our RAG. Then we keep the answer short so it doesn't cause fatigue.

**Step 0: get everyone to the same pace.** Before coding, all 3 read this plan (shared as `~/arthakram-ps5/TEAM_PLAN.md`; the artifact link needs a claude.ai login), agree the API contract below and the flag list, and take one role each.

## First build step (now): scaffold + contract + rules engine (no keys needed)
In `~/arthakram-ps5` (new GitHub repo, pushed by the user):
- `npx create-next-app@latest web --ts --tailwind --app --eslint` (one app: checker, demo inbox, dashboard, API).
- `web/lib/types.ts`: the frozen `CheckResult` contract (step 7 shape) + `web/lib/mock-result.ts`, one hard-coded result so P2/P3 can start right away.
- `web/lib/engine.ts`: pure `checkRules(text, sender?)` with the hard floors (OTP/password, fee, Aadhaar/PAN/bank, free-mail sender claiming a company, lookalike domain, link shorteners/forms.gle, urgency as a supporting signal only). No dependencies, so P2 can copy it into the extension.
- `web/app/api/check/route.ts`: validates input (length cap) → `checkRules` → returns `CheckResult` with `mode:"limited"`. The AI/search steps are stubbed until the keys arrive.
- `web/lib/engine.test.ts` (vitest): the fixture cases from Verification that don't need AI.
- `extension/`: an empty MV3 folder (`manifest.json` only) for P2.
- Copy `TEAM_PLAN.md` to the repo root; `.env.example` lists `GEMINI_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`; `.env.local` stays gitignored.
- Then: `git init` + first commit; the user creates the GitHub repo and pushes (or I run `gh repo create` if they ask).

## Product: 3 pieces, 1 engine
1. **Chrome extension:** reads the open mail (or selected text) → one result card. Has a privacy switch (OFF = nothing is read or sent). It stays silent until the student opens a placement-type mail and clicks check, or until they start typing an OTP / clicking a link in it.
2. **Website:** paste checker (the PS MVP), extension download page, and a fictional demo inbox (the safe stage demo, since Gmail's DOM is fragile).
3. **Placement-cell dashboard:** checks, high-risk catches, community-flagged senders, and a verify queue where the coordinator marks a mail fake or genuine, which updates the result for every student (herd immunity).

## The engine (where the RAG lives): `POST /api/check`
Pipeline. Each step adds **evidence**, and the result card shows the top 2:

1. **Extract claims** (LLM, JSON only): claimed company, role, stipend/salary, sender address, every link, what the sender wants you to do (*intent*: fill a form / pay / share OTP / reply on WhatsApp / just apply on the portal).
2. **Hard rules (instant, offline, the AI can't override them):** asks for OTP/password → HIGH; asks for a fee → HIGH; asks for Aadhaar/PAN/bank details → HIGH; sender domain is community-flagged → HIGH.
3. **Sender check: is the sender who they claim to be?**
   - Claimed company vs sender domain: does "Microsoft" come from `microsoft.com` or from `gmail.com` / `micros0ft-careers.co`? (lookalike + free-mail checks, and the official domain comes from the seeded company DB or web search)
   - **Own-org / hacked-account case:** the sender is on *our* college domain, so the domain looks trusted, but the content doesn't fit the sender (a student/faculty account pushing an external internship + a Google Form, or the sender isn't on the placement-cell sender list). Result: "This came from a real college account, but the content doesn't match who usually sends this. The account may be compromised. Confirm with them by phone or in person."
4. **Company background check (web RAG):** search "<company> <role> internship 2026 careers" via a search API → take the top results → the LLM answers *only from those results, with citations*: "Is this company actually running this program? Where do they officially take applications?" Output: a short summary + source links. No results means "couldn't confirm," which is not the same as fake.
5. **Link / form check: does the link deliver what the mail claims?**
   - The link domain vs the claimed company (a "Microsoft internship" via `forms.gle` / `bit.ly` / an unknown domain is a mismatch).
   - The server safely fetches the page (GET only, no JS, 5s timeout, size cap, blocks private IPs and redirects to them). For **Google Forms** it reads the form title + question text. Then we check: does the form ask for an OTP/password/bank/payment? Does the form's topic match the mail ("Microsoft internship" mail → form titled "KYC verification")?
6. **Reality check: does this opportunity make sense?** The LLM + rules judge plausibility: stipend way above market for a fresher, no interview, a "selected" email you never applied for, a deadline in hours.
7. **Combine:** risk = max(rule floors, evidence signals). The LLM writes the plain-English explanation and can't lower a floor. Output:
   `{level, reasons[≤2], nextStep, intent, evidence:{sender, company, link}, sources[]}`. The card shows level + 2 reasons + 1 action; "Why?" expands into the evidence + sources.
8. **Fallback:** if the LLM or search fails, return a rules-only result marked "limited check". The demo never breaks.

## Free APIs (check limits on day 1)
- LLM: **Google AI Studio (Gemini Flash)** free key; backup **Groq** free key.
- Web search: **Tavily** (built for RAG, free monthly credits) or **Serper** (Google results, free credits). Cache by company name so the demo doesn't burn quota.
- DB: **Supabase** free: `companies(name, official_domains)`, `flags(sender_domain/url, verdict, count)`, `reports(redacted_text, status)`, `events(level, flags, created_at)`, no raw mail stored.
- shortcut: shared dashboard password instead of auth; upgrade for a real pilot.

## Team split
| Person | Owns |
|---|---|
| **Lead (you)** | Engine: claim extraction, rules, sender check, web-RAG, link/form fetch, combine, `/api/check`, Supabase, deploy, merging |
| **P2** | Extension: read the open mail on the demo inbox (Gmail if time allows), privacy switch, result card, OTP/link moment triggers, context menu, zip. From ~hour 14: business side + pitch deck |
| **P3** | Website: paste checker, download page, demo inbox, dashboard + verify queue; writes ~15 fictional sample mails (incl. the hacked-college-account + fake-Google-Form cases) and seeds the companies table |

**Contract (freeze in the first hour):** `POST /api/check {text, sender?, links?[]}` returns the object in step 7. P2 and P3 build against a hard-coded copy of that object until the engine is ready.

## Timeline (to submission on 6 Nov)
- **0–1h:** everyone reads the plan, freezes the contract, gets API keys, splits the sample mails.
- **1–6h:** rules + `/api/check` end to end with the paste UI. **First milestone: the PS MVP is done and deployed.**
- **6–12h:** sender check, Google Form/link check, web-RAG company check; extension card on the demo inbox; dashboard reads `events`.
- **12–16h:** herd immunity (report → mark fake → others get HIGH), hacked-account case, reality check; P2 moves to the pitch.
- **16–20h:** fix bugs only, cache demo search results, record a backup demo video.
- **20h → deadline:** freeze, rehearse.

## Pitch answers (P2)
- *Why will students use it when they ignore training?* It sits in their inbox, speaks only at the risky moment, and takes 5 seconds to read, with proof attached.
- *How do we measure it works?* OTP/payment leaks per placement season (8 → 0), "risky moments stopped," and install rate (install is made part of placement registration).
- *A real offer that looks suspicious?* MEDIUM + "verify with the placement cell" + one-click report → the coordinator marks it genuine → it shows LOW for everyone, with the company check sources shown.
- Buyer: college placement cell; free pilot for a semester, then ~₹10–25k/yr per campus (assumption).

## Verification
- `engine.test.ts` (vitest), ~15 fixtures: OTP ask → HIGH; fee → HIGH; Microsoft claim from gmail → ≥MED; college account + external internship + Google Form → ≥MED with the "account may be compromised" reason; form asking bank details → HIGH; real-looking allowlisted mail → LOW; urgency only → not HIGH; LLM/search down → still returns a rules result.
- Manual E2E: demo inbox + extension → card shows; report → dashboard → mark fake → re-check → HIGH; privacy switch OFF → no network calls (check the DevTools Network tab).

## Skipped / risks
- Skipped: real email header checks (SPF/DKIM; we can't see headers from pasted text, so we say that), OCR, Outlook, Hindi output.
- Risk: fetching links server-side must keep the SSRF guard. Search/LLM free quotas may be low, so cache and keep the rules fallback.
