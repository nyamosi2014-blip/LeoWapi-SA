# Environments

| | Development | Staging | Production |
| --- | --- | --- | --- |
| Purpose | Building and trying things | Checking a release before it ships | Real customers |
| Code | Any branch, locally | `main` | A tagged release of `main` |
| Database | Supabase free project `leowapi-sa-dev` | Supabase free project `leowapi-sa-staging` | Not created |
| Hosting | `npm run dev` on a laptop | Not set up yet (see below) | Not created |
| Sample data | Yes (`supabase/seed.sql`) | Yes | Refused by the database |
| Real customer data | No | No | Only after the POPIA review below |

**Nothing in the production column exists, and nothing there will be created or paid for without Getrude's written approval.** Before asking, we will bring an updated monthly cost estimate covering hosting, database, domain, email, maps, storage, backups and expected usage charges.

Staging hosting is still open. Vercel's free Hobby plan is for non-commercial use only, so it isn't a good fit for a business's staging site. The options are Vercel Pro (US$20 a month, needs approval) or a host whose free plan allows commercial use. This will come back as a decision before staging is set up.

Free-plan limits worth knowing: a Supabase free project pauses after a week without activity (it can be restored from the dashboard), and free projects have no automatic backups. Neither matters for development or staging, because neither holds real data.

## Database region

Supabase has no African region. The nearest are London (`eu-west-2`) and Frankfurt (`eu-central-1`). For development we will create the projects in London and measure response times from Johannesburg and Pretoria. Before real South African customer data goes in, the POPIA cross-border transfer requirements (section 72) need to be assessed and the contractual safeguards confirmed. The final region is Getrude's decision. If an acceptable arrangement can't be confirmed, a South African hosting option will be compared before production.

## Setting up a Supabase environment

1. Create the project in the Supabase dashboard on the free plan, in the agreed region.
2. Install the Supabase CLI (`npx supabase`), then `npx supabase link --project-ref <ref>`.
3. Apply the migrations: `npx supabase db push`. For development or staging only, load the sample data by running `supabase/seed.sql` in the SQL editor.
4. In **Authentication > Email templates**, change both the "Confirm signup" and "Magic link" templates to show the code, for example `Your LeoWapi SA sign-in code is {{ .Token }}`. Sign-in uses the 6-digit code, not a link.
5. Copy the project URL and publishable key into `.env.local` (development) or the hosting environment variables (staging).
6. Give the first administrator their role in the SQL editor: `insert into user_roles (user_id, role) select id, 'admin' from auth.users where email = '...';`

Supabase's built-in email sender is limited to a few messages an hour and is for testing only. Production will need a proper sender such as Resend, which is one of the costs to approve.

## Switching an environment to production

`app_settings.environment` is `development` by default. Setting it to `production` fails while any sample venue, event or offer exists, and once it is set the database refuses new sample rows.

## Protecting `main` (for Getrude, on GitHub)

In the repository's **Settings > Branches > Add branch ruleset** (or **Add rule**) for `main`:

- Require a pull request before merging, with at least one approval.
- Require status checks to pass: select **CI / check** once it has run once.
- Block force pushes and deletions.

GitHub Actions minutes for private repositories are included in the free plan up to a monthly allowance; CI here takes a few minutes per run.
