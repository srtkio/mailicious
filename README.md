# PlacementShield (Arthakram PS5)

Read `TEAM_PLAN.md` first. Roles, the API contract and the timeline are all there.

- `web/`: Next.js app (checker, demo inbox, dashboard, `POST /api/check`)
  - `npm install && npm run dev` → http://localhost:3000
  - `npm test`: rules-engine fixtures
  - Contract: `web/lib/types.ts`. Sample result to build against: `web/lib/mock-result.ts`
  - Engine: `web/lib/engine.ts` (pure, no deps; the extension can import or copy it)
- `extension/`: Chrome MV3 extension (P2). Call the API from the background service worker; `host_permissions` covers localhost, so add the deployed URL later.

Try it:
```
curl -s localhost:3000/api/check -H 'content-type: application/json' \
  -d '{"text":"Microsoft internship! Share the OTP to confirm.","sender":"hr.ms@gmail.com"}'
```
