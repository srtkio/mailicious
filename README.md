# MAILicious

Catches fake placement mails and other scams inside Gmail, before a student replies, pays or clicks. Built for Arthakram PS5, "The Fake HR Email".

**Live:** https://placementshield.vercel.app

- **Gmail extension** (`extension/`): checks each mail you open, with no Google sign-in. Warns before a risky click and when you type an OTP, Aadhaar, PAN or card number into a reply.
- **Website** (`web/`): paste a mail, Gmail's Show original, or an `.eml` file, and get a verdict with a security report. Also offers the extension download.
- **Placement-cell dashboard** (`/dashboard`): students report senders, and marking one fake warns every student.

Read `TEAM_GUIDE.md` for how it works, its limits and its accuracy results. `TEAM_PLAN.md` is the original plan.

## Run it

```
cd web
npm install
npm run dev
```

Open http://localhost:3000. It works without keys, using rules and link checks only. Copy `web/.env.example` to `web/.env.local` to turn on the AI and web search. The dashboard also needs `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `ADMIN_PASSWORD` set, and `supabase/schema.sql` run once.

`npm test` runs the tests. After changing `extension/`, run `npm run pack:extension` to rebuild the download.
