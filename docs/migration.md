# From the Tanzania prototype to LeoWapi SA

The prototype (`legacy/tanzania-prototype/leowapi.html`, from commit `e1ae106`) is one HTML file with no server. Everything it knew lived in the visitor's own browser (localStorage, sessionStorage, IndexedDB), so "sign-in", "publishing" and "requests" only ever existed on one device.

LeoWapi SA keeps the prototype's rules and rebuilds the rest on a server and a database. This page maps each rule to where it lives now. Where a rule is enforced in two places, the database is the one that counts: the TypeScript copy gives fast, friendly messages, and the database refuses anything that gets past it.

## Rules that carried over

| Prototype | What it does | LeoWapi SA |
| --- | --- | --- |
| `hrsNow`, `hrsLines` | Open-now status and weekly hours, including hours that run past midnight | `src/lib/domain/hours.ts`; table `venue_hours` (a close at or before the open runs past midnight) |
| `darNow` | Current time in Dar es Salaam | `localNow` in `src/lib/domain/time.ts`, using `Africa/Johannesburg` from `src/config/market.ts` |
| `spendOf`, `priceRows` | Expected spend and price lines | `src/lib/domain/pricing.ts`. Now refuses to estimate from missing or out-of-date prices, and says what each estimate assumes |
| `rqValidate`, `rqHoursWarn` | Checks a customer request before it is sent | `validateRequest` in `src/lib/domain/requests.ts`; check constraints on `requests` |
| `RSTAT`, `rqCancel` | Request statuses | `REQUEST_STATUS_LABEL` and the transition table in `requests.ts`; `request_transition_ok` and `guard_request` in the database, which also keep a history of every change |
| `OWNER_TX`, `PUBL`, `oPublish`, `oWithdraw`, `oUnpublish` | Listing publication states | `src/lib/domain/publication.ts`; `publication_transition_ok` and `guard_venue` in the database |
| `PUBLISH_NEEDS_REVIEW` | Whether an owner's listing goes live straight away | Always on. Owners submit; a moderator who doesn't belong to the venue approves |
| `contactFromMode`, `oCm` | How a customer can reach the venue | Venue contact columns; the database refuses "accepts requests" without at least one working contact method |
| `oNorm`, `oFieldErrs`, `VENUE_SCHEMA` | Venue field checks | Column types and check constraints on `venues`; form validation will use zod |
| `MEDIA_POLICY`, `mPhoto`, `mVideo` | Photo and video limits | `venue_media` (with `rights_confirmed`); Supabase Storage in Phase 5 |
| `CATS`, `AREAS`, `CITY` | Categories, areas and the one city | `categories`, `areas` and `cities` tables, so adding a city is adding rows |

Tanzanian specifics were replaced: TZS became ZAR (`src/lib/domain/money.ts`), +255 numbers became South African +27 numbers (`src/lib/domain/contact.ts`), and Swahili strings (`DAYS_SW`, `VIBE_SW`, `toggleLang`) are not carried over. The prototype's `EV_LABEL` sample events, sample prices and Safety Insight scores were removed, as agreed.

## What was rebuilt rather than ported

| Prototype | Why it couldn't carry over | LeoWapi SA |
| --- | --- | --- |
| `oDoSignin`, `oSendCode`, `oVerify`, `oSavePw` | Accounts and codes were stored in the browser, so anyone with the device could read them | Supabase Auth with an emailed one-time code, checked on the server (`src/app/sign-in`) |
| `oSetSess`, `oLoad`, `oCommit` | Sessions and data in localStorage | Session cookie refreshed by `src/proxy.ts`; data in PostgreSQL |
| `syncPublic`, `venueFromOwner` | Copied an owner's draft into the "public" list on the same device | Publication status on the venue row, protected by row-level security |
| `syncReq`, `rqSave` | Requests stayed on the customer's phone and never reached the venue | `requests` table, visible to the customer, the venue and staff only |
| `oSeed` | Loaded sample venues into every visitor's browser | `supabase/seed.sql`, for development and staging only; the database refuses sample rows in production |

## What is not built yet

Discovery pages, event pages, the request form, the owner dashboard, maps, transport links and email notifications are Phase 4 and 5 work. Their page design waits for the design board to be approved.
