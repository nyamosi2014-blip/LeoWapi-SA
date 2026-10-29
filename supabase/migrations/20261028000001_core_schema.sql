-- LeoWapi SA core schema.
-- Conceptual model: docs/data-model.md. Every customer-visible fact records its source.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value text not null
);
-- Production setup changes this to 'production' (docs/environments.md). Sample rows are refused there.
insert into public.app_settings (key, value) values ('environment', 'development');

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('venue_owner', 'organiser', 'moderator', 'admin');
create type public.publication_status as enum ('draft', 'pending', 'published', 'unpublished', 'rejected');
create type public.verification_status as enum ('none', 'pending', 'verified', 'lapsed');
create type public.event_status as enum ('draft', 'pending', 'published', 'rejected', 'cancelled', 'expired');
create type public.request_type as enum ('table', 'recommendation', 'group_outing', 'listing_correction');
create type public.request_status as enum ('submitted', 'delivered', 'acknowledged', 'confirmed', 'declined', 'cancelled', 'expired');
create type public.price_kind as enum ('entry', 'cover', 'minimum_spend', 'drink', 'table', 'vip');
create type public.price_source as enum ('verified', 'venue', 'estimate', 'customer_report');
create type public.report_target as enum ('venue', 'event', 'offer');
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Geography: country > city > area. Adding a city is adding rows.
-- ---------------------------------------------------------------------------
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  country text not null default 'ZA',
  time_zone text not null default 'Africa/Johannesburg',
  centre extensions.geography(Point, 4326),
  boundary extensions.geography(MultiPolygon, 4326),
  is_live boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  centre extensions.geography(Point, 4326),
  boundary extensions.geography(MultiPolygon, 4326),
  is_live boolean not null default false,
  created_at timestamptz not null default now(),
  unique (city_id, slug)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  is_enabled boolean not null default true,
  sort smallint not null default 0
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  phone_e164 text check (phone_e164 ~ '^\+27[1-8][0-9]{8}$'),
  home_city_id uuid references public.cities (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every signed-in person is a customer. Extra roles are granted by an admin.
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('privacy_notice', 'marketing_email', 'request_sharing')),
  granted boolean not null,
  version text not null,
  at timestamptz not null default now(),
  primary key (user_id, kind, at)
);

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 120),
  city_id uuid not null references public.cities (id),
  area_id uuid not null references public.areas (id),
  category_id uuid references public.categories (id),
  description text check (char_length(description) <= 2000),
  street_address text,
  landmark text,
  -- Set from the owner's confirmed map pin, never copied from Google Places (its terms forbid storing it).
  location extensions.geography(Point, 4326),
  whatsapp_e164 text check (whatsapp_e164 ~ '^\+27[1-8][0-9]{8}$'),
  phone_e164 text check (phone_e164 ~ '^\+27[1-8][0-9]{8}$'),
  email text check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  website_url text check (website_url ~ '^https://'),
  contact_whatsapp boolean not null default false,
  contact_call boolean not null default false,
  contact_email boolean not null default false,
  accepts_requests boolean not null default false,
  parking text,
  transport_notes text,
  accessibility text,
  dress_code text,
  min_age smallint check (min_age between 0 and 25),
  publication public.publication_status not null default 'draft',
  ever_approved boolean not null default false,
  moderator_note text,
  verification public.verification_status not null default 'none',
  verified_at timestamptz,
  verified_by uuid references auth.users (id),
  is_sample boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id),  -- null: added by LeoWapi (seed or import)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, slug),
  -- Ported from the prototype: requests need at least one way to reach the venue.
  check (not accepts_requests or contact_whatsapp or contact_call or contact_email),
  check (not contact_whatsapp or whatsapp_e164 is not null),
  check (not contact_call or phone_e164 is not null),
  check (not contact_email or email is not null)
);
create index venues_location_idx on public.venues using gist (location);
create index venues_public_idx on public.venues (city_id, area_id) where publication = 'published';

create table public.venue_members (
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'manager')),
  added_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);
create index venue_members_user_idx on public.venue_members (user_id);

-- Same model as the prototype's hours engine: a close at or before the open runs past midnight.
create table public.venue_hours (
  venue_id uuid not null references public.venues (id) on delete cascade,
  day smallint not null check (day between 0 and 6),
  opens time not null,
  closes time not null check (closes <> opens),
  primary key (venue_id, day, opens)
);

create table public.venue_hours_overrides (
  venue_id uuid not null references public.venues (id) on delete cascade,
  on_date date not null,
  closed boolean not null default false,
  opens time,
  closes time,
  note text,
  primary key (venue_id, on_date),
  check (closed or (opens is not null and closes is not null))
);

create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  kind public.price_kind not null,
  lo_cents integer check (lo_cents >= 0),
  hi_cents integer check (hi_cents >= 0),
  is_from boolean not null default false,
  source public.price_source not null,
  confirmed_on date,
  expires_on date,
  note text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (hi_cents is null or lo_cents is null or hi_cents >= lo_cents)
);
create index price_items_venue_idx on public.price_items (venue_id);

create table public.venue_media (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  storage_path text not null,
  alt_text text,
  sort smallint not null default 0,
  rights_confirmed boolean not null default false,
  uploaded_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events and offers
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references public.venues (id) on delete set null,
  city_id uuid not null references public.cities (id),
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null check (char_length(title) between 2 and 140),
  description text,
  line_up text,
  category_id uuid references public.categories (id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  entry_lo_cents integer check (entry_lo_cents >= 0),
  entry_hi_cents integer check (entry_hi_cents >= 0),
  price_source public.price_source,
  ticket_url text check (ticket_url ~ '^https://'),
  min_age smallint check (min_age between 0 and 25),
  dress_code text,
  status public.event_status not null default 'draft',
  moderator_note text,
  is_sample boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id),  -- null: added by LeoWapi (seed or import)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, slug),
  check (ends_at is null or ends_at > starts_at)
);
create index events_upcoming_idx on public.events (city_id, starts_at) where status = 'published';

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 140),
  details text,
  conditions text,
  -- Specials always carry dates, so nothing stays "on" after it ends.
  starts_on date not null,
  ends_on date not null,
  days_of_week smallint[] check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  status public.publication_status not null default 'draft',
  is_sample boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id),  -- null: added by LeoWapi (seed or import)
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------------
-- Customer requests (one table for every request type)
-- ---------------------------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('REQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  type public.request_type not null,
  customer_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  venue_id uuid references public.venues (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  city_id uuid references public.cities (id),
  area_id uuid references public.areas (id),
  name text not null check (char_length(name) between 2 and 100),
  contact text not null check (char_length(contact) <= 100),
  visit_date date,
  arrival_time time,
  guests smallint check (guests between 1 and 30),
  budget_band text,
  occasion text,
  note text check (char_length(note) <= 300),
  status public.request_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type not in ('table', 'group_outing') or (visit_date is not null and arrival_time is not null and guests is not null)),
  check (type <> 'table' or venue_id is not null)
);
create index requests_customer_idx on public.requests (customer_id, created_at desc);
create index requests_venue_idx on public.requests (venue_id, created_at desc);

create table public.request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.requests (id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('customer', 'venue', 'admin', 'system')),
  at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customer lists
-- ---------------------------------------------------------------------------
create table public.saved_venues (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

create table public.event_bookmarks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ---------------------------------------------------------------------------
-- Trust and moderation
-- ---------------------------------------------------------------------------
create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  check_type text not null check (check_type in ('contact', 'business_registration', 'liquor_licence', 'address', 'owner_authority', 'site_visit')),
  passed boolean not null,
  evidence text not null,
  checked_by uuid not null default auth.uid() references auth.users (id),
  checked_at timestamptz not null default now(),
  expires_on date
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target not null,
  target_id uuid not null,
  reporter_id uuid default auth.uid() references auth.users (id) on delete set null,
  reason text not null check (reason in ('wrong_details', 'closed', 'cancelled_event', 'price_wrong', 'unsafe', 'scam', 'other')),
  details text check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  resolution text,
  resolved_by uuid references auth.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text not null,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);

-- Last known state of each external provider, shown on the admin dashboard.
create table public.integration_status (
  provider text primary key,
  configured boolean not null default false,
  last_ok_at timestamptz,
  last_error_at timestamptz,
  last_error text
);
