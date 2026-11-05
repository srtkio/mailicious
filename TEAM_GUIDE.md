# PlacementShield team guide

Start here. This is the one page for what we're building, how to run it, who does what and what's left. If something changes, update this file in the same commit.

**Submission is due 6 Nov.** `TEAM_PLAN.md` has the full original plan and the pitch answers.

## What we're building

Arthakram PS5, "The Fake HR Email": a student checks a suspicious placement message and gets a risk level, red flags in plain words and one clear next step. The catch in the problem statement is that warnings get ignored, so ours must be short, specific and shown only when it matters.

Most teams will build "paste it, AI says HIGH". We win on **evidence**: we check what the mail claims against the outside world (the sender, the company, the link or form) and show the proof.

There are three pieces, all using one engine:

1. **Website:** paste checker, demo inbox, extension download page.
2. **Chrome extension:** stays quiet until a student opens a placement mail or is about to type an OTP or click a link.
3. **Placement-cell dashboard:** a coordinator marks a sender fake, and every student then sees it as HIGH.

## Status

| Piece | State | Owner |
|---|---|---|
| Rules engine (`web/lib/engine.ts`) | Done | Lead |
| Short-link and Google Form check (`web/lib/links.ts`) | Done | Lead |
| `POST /api/check` | Done, rules and link checks only | Lead |
| Paste checker page (`web/app/page.tsx`) | Done | Lead |
| AI claim extraction and company background check | Waiting on API keys | Lead |
| Deployment | Not done | Lead |
| Chrome extension (`extension/`) | Manifest only, not started | P2 |
| Demo inbox, download page | Not started | P3 |
| Dashboard, verify queue | Not started, needs Supabase | P3 |
| About 15 fictional sample mails | Not started | P3 |
| Pitch deck, business side | Not started | P2, from about hour 14 |

P2 and P3 are not assigned to names yet. Akash and Dhruv: pick one each and put your name in the table.

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

The app runs without keys. They turn on the AI and web-search checks, and only the Lead needs them for now. All are free.

| Name in `.env.local` | What it does | Get it from |
|---|---|---|
| `GEMINI_API_KEY` | Reads the mail, writes the explanation | https://aistudio.google.com/app/apikey |
| `TAVILY_API_KEY` | Company background search | https://app.tavily.com/home |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Dashboard data. Found under Project Settings, API. | https://supabase.com/dashboard/projects |

Keys go in `web/.env.local`: run `cp .env.example .env.local` in `web/`, then paste each value straight after its `=`, with no quotes or spaces. Finder hides this file; press Cmd+Shift+. to show it.

**This repo is public. Never commit a key or paste one in an issue or chat.** Git ignores `.env.local`, so keep keys only there. If a key leaks, delete it on the provider's site and make a new one.

## How we work

- Make a branch for your piece (`extension-card`, `dashboard`) and open a pull request. The Lead reviews and merges.
- Don't change `web/lib/types.ts` without telling everyone. It's the contract all three pieces build on.
- Stay inside your own folders where you can, so we don't overwrite each other.
- Every sample mail must be fictional. This project is defensive only; building or sending real phishing means disqualification.
- If you use Claude Code, `CLAUDE.md` points it at this guide.

## How the engine works

`POST /api/check` takes `{ text, sender?, links? }`. The full shape is in `web/lib/types.ts`, and `web/lib/mock-result.ts` is a sample answer you can build against.

```
curl -s localhost:3000/api/check -H 'content-type: application/json' \
  -d '{"text":"Microsoft internship! Share the OTP to confirm.","sender":"hr.ms@gmail.com"}'
```

1. **Rules (`engine.ts`).** Instant and offline. Each flag sets a minimum risk level. These are the floors: AI may add risk but can never lower them.
2. **Links (`links.ts`).** Follows short links and reads Google Forms. It flags forms asking for an OTP, ID, bank details or payment, and forms that never mention the company in the mail.
3. **AI and search (next).** Pull out the claims, check the company online, and answer only from the search results, with sources.

The rule is that **the final level is the highest risk found**. If AI or search fails, the student still gets the rules result, marked `mode: "limited"`.

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
| `URGENCY` | Low | Pressure to act fast |

## Notes for each piece

**Extension (P2)**
- Call the API from the background service worker. `host_permissions` covers localhost; add the deployed URL once we have one.
- Show flag text with `textContent`, never `innerHTML`. Form titles come from scammers.
- Include the privacy switch: when it's off, nothing is read or sent.
- Build on the demo inbox first. Gmail's page is fragile.

**Website and dashboard (P3)**
- Reuse the page's colours in `web/app/globals.css` so everything looks like one product.
- The page currently says nothing pasted is saved. If the dashboard starts storing reports, update that line, and store redacted text only.

**Pitch (P2)**
- Don't say scammers can't tell a mail was checked. We don't touch their sites, but checking a short link counts as a click on the shortener's stats.
- We can't see real mail headers from pasted text, so we don't claim SPF or DKIM checks.

## Limits to know

- Only Google Forms are read. Microsoft Forms, Typeform and Jotform aren't, and forms that need sign-in can't be read.
- The company list is a small hard-coded seed until Supabase is in.
- Rules are deliberately cautious: they'd rather flag a real mail than miss a scam.
