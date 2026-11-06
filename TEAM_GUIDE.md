# PlacementShield guide

Start here. This is the one page for what we're building, how to run it and what's left. If something changes, update this file in the same commit.

**Live site: https://placementshield.vercel.app.** Submission is due 6 Nov. `TEAM_PLAN.md` has the full original plan and the pitch answers.

## What we're building

Arthakram PS5, "The Fake HR Email": a student checks a suspicious placement message and gets a risk level, red flags in plain words and one clear next step. The catch in the problem statement is that warnings get ignored, so ours must be short, specific and shown only when it matters.

Most teams will build "paste it, AI says HIGH". We win on **evidence**: we check what the mail claims against the outside world (the sender, the company, the link or form) and show the proof.

There are three pieces, all using one engine:

1. **Website:** paste checker, demo inbox, extension download page.
2. **Chrome extension:** stays quiet until a student opens a placement mail or is about to type an OTP or click a link.
3. **Placement-cell dashboard:** a coordinator marks a sender fake, and every student then sees it as HIGH.

## Status

| Piece | State |
|---|---|
| Rules engine (`web/lib/engine.ts`) | Done |
| Short-link and Google Form check (`web/lib/links.ts`) | Done |
| AI and company check (`web/lib/ai.ts`) | Done |
| Header, raw mail and `.eml` analysis (`web/lib/headers.ts`) | Done |
| Domain age, mail server, link reputation (`web/lib/intel.ts`) | Done |
| Website with security report and extension download | Done, live |
| Gmail extension (`extension/`) | Works in real Gmail: card, security report and real SPF, DKIM and DMARC results confirmed. Link warning and reply warning only tested on a fake page |
| Placement-cell dashboard, reporting and campus blocklist (`web/lib/store.ts`) | Built at `/dashboard`, needs the Supabase secret key and `supabase/schema.sql` run once |
| Pitch deck | Not started |

## Run it

You need Node and git.

```
git clone https://github.com/srtkio/placementshield.git
cd placementshield/web
npm install
npm run dev
```

Open http://localhost:3000 and click "Try a fake offer". The checker works without any API keys.

- `npm test` runs the engine tests.
- `npm run lint` and `npx tsc --noEmit` check the code. Run all three before you push.

## API keys

The app runs without keys, using rules and link checks only. Keys turn on the AI and web-search checks. All are free. Use your own keys if you want those checks locally.

| Name in `.env.local` | What it does | Get it from |
|---|---|---|
| `GEMINI_API_KEY` | Reads the mail, writes the explanation | https://aistudio.google.com/app/apikey |
| `TAVILY_API_KEY` | Company background search | https://app.tavily.com/home |
| `SAFE_BROWSING_API_KEY` | Optional: Google's blocklist of dangerous links | https://console.cloud.google.com/apis/library/safebrowsing.googleapis.com |
| `VIRUSTOTAL_API_KEY` | Optional: 70+ security vendors' verdicts | https://www.virustotal.com/gui/my-apikey |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Dashboard data. Found under Project Settings, API. | https://supabase.com/dashboard/projects |

Keys go in `web/.env.local`: run `cp .env.example .env.local` in `web/`, then paste each value straight after its `=`, with no quotes or spaces. Finder hides this file; press Cmd+Shift+. to show it.

**This repo is public. Never commit a key or paste one in an issue or chat.** Git ignores `.env.local`, so keep keys only there. If a key leaks, delete it on the provider's site and make a new one.

## Extension

It works inside Gmail with no Google sign-in. A content script reads the open mail and fetches Gmail's own Show original page for the real headers, so it needs no OAuth and no MCP server.

After changing anything in `extension/`, run `npm run pack:extension` in `web/` to rebuild the download, then deploy.

Deploying isn't automatic: run `vercel deploy --prod --yes` in `web/`.

## Rules

- Every sample mail must be fictional. This project is defensive only; building or sending real phishing means disqualification.
- Mail text comes from scammers. Show it with `textContent`, never `innerHTML`, and never let AI output lower a rule's flag.

## How the engine works

`POST /api/check` takes `{ text, sender?, links? }`. The full shape is in `web/lib/types.ts`, and `web/lib/mock-result.ts` is a sample answer you can build against.

```
curl -s localhost:3000/api/check -H 'content-type: application/json' \
  -d '{"text":"Microsoft internship! Share the OTP to confirm.","sender":"hr.ms@gmail.com"}'
```

1. **Rules (`engine.ts`).** Instant and offline. Each flag sets a minimum risk level. These are the floors: AI may add risk but can never lower them.
2. **Links (`links.ts`).** Follows short links and reads Google Forms. It flags forms asking for an OTP, ID, bank details or payment, and forms that never mention the company in the mail.
3. **AI and search (`ai.ts`).** Gemini pulls out the company and role and spots an offer that doesn't add up. Tavily finds the company's real website, and Gemini answers only from those results, with sources. If the sender isn't on that website, we flag it.

The mail is written by the scammer, so we assume it may try to instruct the AI. The AI can't lower a rule's flag, its offer judgments come from a fixed list with our own wording, and a website only counts if a real search result is on it and it isn't a job board or shared host.

**Who sent it changes the answer.** A sender counts as proven only when DMARC passes for the real From address. A proven college office, or a sender the placement cell marked genuine, skips the soft warnings. A proven personal college account pushing an outside offer gets asked to confirm. Proof never clears an OTP, ID or malware flag, because a hacked account passes every check, so that mail stays High and says the account may be hacked.

The rule is that **the final level is the highest risk found**. If AI or search fails, the student still gets the rules and link results, marked `mode: "limited"`. Failures are logged on the server.

Flags you'll see:

| Flag | Risk | Meaning |
|---|---|---|
| `ASKS_SECRET` | High | Asks for an OTP or password |
| `ASKS_FEE` | High | Asks you to pay |
| `ASKS_DOCUMENTS` | High | Asks for ID or bank details |
| `BLOCKED_SENDER` | High | The placement cell already marked this sender fake |
| `LOOKALIKE_DOMAIN` | High | Sender imitates a company domain |
| `RAW_IP_LINK` | High | Link goes to a bare IP address |
| `FORM_ASKS_DATA` | High | The linked form asks for sensitive details |
| `FREE_MAIL_CLAIM` | Medium | Claims a company but sent from Gmail or similar |
| `WRONG_DOMAIN` | Medium | Sender domain isn't the company's |
| `HACKED_ACCOUNT` | Medium | Real college account, but the content doesn't fit |
| `MOVE_TO_CHAT` | Medium | Moves you to WhatsApp or Telegram |
| `TOO_GOOD` | Medium | Selected with no interview |
| `SHORT_LINK`, `SHORT_LINK_TARGET` | Medium | Shortened link, and where it really goes |
| `LINK_MISMATCH` | Medium | Link isn't on the company's site |
| `OUTSIDE_FORM` | Medium | Uses an outside form, not a careers portal |
| `FORM_MISMATCH` | Medium | The form never mentions the company |
| `LINK_NOT_CHECKED` | Medium | We couldn't check a link |
| `COMPANY_DOMAIN_MISMATCH` | Medium | Sender isn't on the website our search found for the company |
| `REALITY_CHECK` | Medium | Pay far above market, or a job offered with no application |
| `AUTH_FAIL` | High | Failed SPF, DKIM or DMARC: not really from that domain |
| `HIDDEN_LINK` | High | Link shows one site but goes to another |
| `HOMOGRAPH_LINK` | High | Address uses disguised characters |
| `LOOKALIKE_LINK` | High | Link imitates a company's site |
| `DANGEROUS_ATTACHMENT` | High or medium | A program or web page posing as a document |
| `KNOWN_MALICIOUS` | High | Listed by Safe Browsing or VirusTotal |
| `NEW_DOMAIN` | High or medium | Domain registered under 30 or 180 days ago |
| `AUTH_WEAK` | Medium | One sender check failed |
| `REPLY_TO_MISMATCH` | Medium | Replies go to a different domain |
| `NO_MAIL_SERVER` | Medium | Sender's domain can't receive mail |
| `URGENCY` | Low | Pressure to act fast |

## Pitch notes

- Don't say scammers can't tell a mail was checked. We don't touch their sites, but checking a short link counts as a click on the shortener's stats.
- Sender checks need real headers: the extension and Show original or `.eml` have them, plain pasted text doesn't.
- The page says we don't save mail and that its text goes to Google's AI. Keep that true.

## Accuracy

Blind test, offline rules only, on 40 fictional mails written without seeing the fixes: 80% of scams caught, 15% false alarms. That's the honest number so far. The engine was then fixed against those mails, so a later score on the same mails doesn't count. Quote only a score from mails the engine hasn't been fixed against.

## Limits to know

- The extension uses Gmail's page structure, which Google can change without notice. If a selector breaks, it goes quiet and doesn't warn.
- Only Google Forms are read. Microsoft Forms, Typeform and Jotform aren't, and forms that need sign-in can't be read.
- The company list is a small hard-coded seed until Supabase is in. Other companies rely on the live search.
- Companies with a second domain can get a wrong MEDIUM: a real `zohocorp.com` mail is flagged because search found `zoho.com`.
- "Couldn't confirm" means we found no official site. It does not mean fake.
- A confirmed company only means it has its own website. A scammer can build a site for a made-up company, so never say "confirmed" means safe.
- A check takes about 2 to 10 seconds. The AI gets 15 seconds at most, then the student gets the rules and link result.
- After 20 AI checks a minute from one IP address, results drop to rules and link checks only. The count is per server instance, so it slows abuse but won't fully stop it.
- Rules are deliberately cautious: they'd rather flag a real mail than miss a scam.
