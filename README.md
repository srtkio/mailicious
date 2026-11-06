# MAILicious

MAILicious catches fake placement mails and other scams inside Gmail, before a student replies, pays or clicks. It checks what a mail claims against evidence (the sender, the company, the link or form) and shows the proof. Built for Arthakram PS5, "The Fake HR Email".

- **Live site:** https://mailicious.vercel.app
- **How each part works:** https://mailicious.vercel.app/technology
- **Repo:** https://github.com/srtkio/mailicious

## Screenshots

<!-- Screenshot: warning card on a fake offer inside Gmail -->
<!-- Screenshot: website check result with the security report -->
<!-- Screenshot: placement-cell dashboard -->

## Features

- **Gmail extension:** checks each mail you open, with no Google sign-in. Shows a risk card on the mail and a dot beside risky-looking inbox rows.
- **Link and reply warnings:** pauses you before you open a link in a high-risk or unchecked mail, and warns when you type an OTP, Aadhaar, PAN or card number into a reply.
- **Website:** paste a mail, Gmail's Show original, or an `.eml` file, and get a verdict with a security report.
- **Sender proof:** reads SPF, DKIM and DMARC results from real headers. A sender counts as proven only when DMARC passes for the real From address.
- **Rules engine:** instant offline checks for OTP, fee and ID requests, lookalike domains, hidden links and dangerous attachments. Each flag sets a minimum risk level.
- **Link inspection:** follows short links and reads Google Forms for requests for an OTP, ID, bank details or payment.
- **AI and company check:** Gemini spots scams the rules miss, and Tavily search finds the company's real website.
- **Threat intel:** domain age, mail server and DMARC policy lookups, plus optional Safe Browsing and VirusTotal checks.
- **Placement-cell dashboard:** students report senders, and marking one fake warns every student.

## Architecture

```
extension/        Gmail content script, popup and background worker
web/app/          Next.js site, dashboard and API routes
web/lib/          engine, headers, links, ai, intel, store
supabase/         schema for campus data
```

Both the extension and the website call `POST /api/check`. That route parses any raw mail and headers, runs the AI, link, threat-intel and campus lookups, then passes everything to the rules engine. The final level is the highest risk found. AI may add risk but can't lower a rule's flag. If AI or search fails, the student still gets the rules and link result, marked `mode: "limited"`.

The extension calls the server address set in `extension/background.js`, and `extension/manifest.json` must allow that host.

## Install

### Website from source

You need Node and git.

```
git clone https://github.com/srtkio/mailicious.git
cd mailicious/web
npm install
npm run dev
```

Open http://localhost:3000 and click "Try a fake offer". It works without keys, using rules and link checks only.

To turn on the AI and web search:

1. In `web/`, run `cp .env.example .env.local`.
2. Paste each value straight after its `=`, with no quotes or spaces.
3. Restart `npm run dev`.

To turn on the dashboard:

1. Create a Supabase project.
2. Run `supabase/schema.sql` once in its SQL editor.
3. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `ADMIN_PASSWORD` in `web/.env.local`.
4. Open http://localhost:3000/dashboard and sign in with that password.

### Extension with Load unpacked

It works in Chrome, Brave and Edge.

1. Get the files: download the zip from the live site and unzip it, or use the `extension/` folder from this repo.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** at the top right.
4. Click **Load unpacked**.
5. Choose the folder that contains `manifest.json`.
6. Reload Gmail and open a mail. A MAILicious card appears on it.

The popup has the on/off switch. After changing `extension/`, run `npm run pack:extension` in `web/` to rebuild the download, then click reload on the extension's card.

## Environment variables

These go in `web/.env.local`, which git ignores. Never commit a key. This repo is public.

| Name | Needed for | Required |
|---|---|---|
| `GEMINI_API_KEY` | Reading the mail and company answers | For AI |
| `TAVILY_API_KEY` | Company website search | For the company check |
| `SUPABASE_URL` | Dashboard and campus blocklist | For the dashboard |
| `SUPABASE_SECRET_KEY` | Dashboard and campus blocklist, server only | For the dashboard |
| `ADMIN_PASSWORD` | The shared `/dashboard` password | For the dashboard |
| `SAFE_BROWSING_API_KEY` | Google's blocklist of dangerous links | Optional |
| `VIRUSTOTAL_API_KEY` | Security vendors' verdicts on domains | Optional |
| `SUPABASE_ANON_KEY` | Listed in `.env.example`, not read by the code | No |

## Tests

Run these in `web/`:

```
npm test
npm run lint
npx next typegen
npx tsc --noEmit
```

`next typegen` is needed once on a fresh clone, or `tsc` fails on `LayoutProps`.

## Transparency

### What leaves the browser

- **While the extension's switch is on, every mail you open is checked, not just placement mail.** Its text, sender, links, attachment names and headers go to our server.
- On the website, what you paste or open goes to the same server.
- If you click Report, the sender, risk level and attack type are sent.

### Where the server sends it

| Service | What it gets |
|---|---|
| Google Gemini | Up to 8,000 characters of the mail's text after redaction, and the sender |
| Tavily | The company name, for job mail only |
| Google Safe Browsing | Link addresses with query strings removed, if a key is set |
| VirusTotal | Up to 3 unfamiliar link domains, if a key is set |
| rdap.org and Google DNS | The sender's domain, unless it's on our known-safe list |
| Link shorteners and Google Forms | A request for the link, which counts as a click on the shortener's stats |

**Mail text goes to Google's AI.** Don't check a mail you wouldn't want sent there.

### Redaction is best effort

Before text goes to Gemini, we hide PAN-shaped IDs, password values, codes near words like OTP, and long digit runs. Pay amounts stay in, for the pay check. It isn't complete: a multi-word password can slip through, for example. Redaction applies to the Gemini call only, so our own server receives the mail as it was.

### What's stored

- We don't save mail. No mail text goes into the database.
- `events`: the risk level and attack type of each check.
- `reports`: the reported sender's domain (or full address for free mail and college accounts), level and attack type.
- `verdicts`: senders the placement cell marked fake or genuine.
- In the extension: the switch and two counters, in local browser storage.
- In server memory for a short time: per-IP rate-limit counts and company lookup results.
- Failures are logged on the server.

### Known limits

- The extension uses Gmail's page structure, which Google can change without notice. If a selector breaks, it goes quiet and doesn't warn.
- The link warning and reply warning have only been tested on a fake page, not in real Gmail.
- Sender checks need real headers. The extension, Show original and `.eml` have them. Plain pasted text doesn't.
- Rules alone miss scams with no fee or OTP request. That's the AI's job, so an AI outage lowers detection.
- Only Google Forms are read. Microsoft Forms, Typeform and Jotform aren't, and forms that need sign-in can't be read.
- "Couldn't confirm" means we found no official site. It does not mean fake.
- A confirmed company only means it has its own website. A scammer can build a site for a made-up company, so "confirmed" never means safe.
- Companies with a second domain can get a wrong MEDIUM.
- All students share one free Gemini key, so busy periods drop to a labelled basic check.
- After 20 AI checks a minute from one IP address, results drop to rules and link checks only. The count is per server instance, so it slows abuse but won't fully stop it.
- Rules are deliberately cautious: they'd rather flag a real mail than miss a scam.

### Accuracy

Blind means the mails were written without seeing the fixes. Only blind scores count.

| Test | Scams caught | False alarms |
|---|---|---|
| Rules only, set 2, blind | 80% | 15% |
| Rules only, set 3, blind | 70% | 5% |
| Rules plus AI, set 3, paced | 100% | 0%, not blind: the AI prompt was written after seeing the misses |
| Rules plus AI, set 4, blind, every kind of mail | 90% | 55%, of which 4 were a test error. This found the money rule firing on bills and tickets, since fixed |
| Rules plus AI, set 5, blind, every kind of mail | 85% | 25% after setting aside a sender-format bug, since fixed. The false-alarm fixes after this run haven't been re-measured |

## Roadmap

None of this is built yet.

- A Supabase company table to replace the small hard-coded list.
- Reading Microsoft Forms, Typeform and Jotform.
- A paid Gemini key for busy periods.
- Individual sign-in for the dashboard, in place of one shared password.
- A shared rate limit across server instances.

## More

`TEAM_GUIDE.md` has the engine details, every flag and the current status. `TEAM_PLAN.md` is the original plan.
