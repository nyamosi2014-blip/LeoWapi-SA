# Data model

Schema: `supabase/migrations/20261028000001_core_schema.sql`. Access rules: `20261028000002_access_rules.sql`.

## Principles

- **Every customer-facing fact says where it came from.** Prices carry a source (`verified`, `venue`, `estimate`, `customer_report`), a confirmation date and an expiry. Venues carry a verification status separate from their publication status.
- **Published is not the same as verified.** A venue can be visible to customers ("Published") before LeoWapi has checked it ("Not verified by LeoWapi"). Pages must show both.
- **No ratings or safety scores.** There are no rating or score columns. They will be added only with a genuine review system, and safety information only with a documented source and verification status.
- **Sample data is marked.** `is_sample` on venues, events and offers. The database refuses sample rows in production.
- **Cities are data.** Country > city > area. Johannesburg and Pretoria are rows, not code.

## Tables

| Area | Tables |
| --- | --- |
| Places | `cities`, `areas`, `categories` |
| People | `profiles` (one per account), `user_roles` (venue_owner, organiser, moderator, admin; every account is a customer), `consents` |
| Venues | `venues`, `venue_members` (who manages a venue), `venue_hours`, `venue_hours_overrides`, `price_items`, `venue_media` |
| What's on | `events`, `offers` (always dated) |
| Requests | `requests` (table, recommendation, group outing, listing correction), `request_status_history` |
| Customer lists | `saved_venues`, `event_bookmarks` |
| Trust | `verifications` (each check, with evidence), `reports`, `audit_log` |
| Operations | `app_settings`, `integration_status` |

## Who can do what

| | Visitor | Customer | Venue member | Moderator | Admin |
| --- | --- | --- | --- | --- | --- |
| See published venues, events, offers | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send a request | | ✓ (signed in) | | | |
| Create a venue (starts as a draft) | | | venue_owner role | ✓ | ✓ |
| Edit a venue, its hours, prices, media | | | ✓ | ✓ | ✓ |
| Submit a venue for review | | | ✓ | | |
| Approve or reject a venue | | | | ✓, not their own | ✓, not their own |
| Record a verification check, mark verified | | | | ✓, not their own | ✓, not their own |
| Mark a price as verified | | | | ✓, not their own | ✓, not their own |
| Acknowledge, confirm or decline a request | | | ✓ (their venue) | ✓ | ✓ |
| Cancel a request | | ✓ (their own) | ✓ once confirmed | ✓ | ✓ |
| Grant roles, see the audit log | | | | | ✓ |

Every rule in this table is enforced in the database and covered by `tests/db/access.test.ts`.

## Open decisions

- **Requests need sign-in.** Every request belongs to an account, so customers can follow its status and venues get fewer fake requests. The prototype allowed anonymous requests. This can be relaxed later with spam protection if it costs too many requests.
- **Editing a published listing.** Owners can currently edit a published venue's details without another review. Publication and verification can't be changed this way, but names and descriptions can. An alternative is to send material edits back for review.
