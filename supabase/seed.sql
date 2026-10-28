-- Development and staging seed. Supabase runs this file on `supabase db reset`.
--
-- Cities, areas and categories are reference data and are safe anywhere.
-- Everything marked is_sample is invented for testing layouts and workflows. Sample
-- venues are named "Sample ..." and say so in their description. The database refuses
-- sample rows once app_settings.environment is 'production'.

insert into public.cities (slug, name, is_live) values
  ('johannesburg', 'Johannesburg', false),
  ('pretoria', 'Pretoria', false);

insert into public.areas (city_id, slug, name)
select c.id, a.slug, a.name
from (values
  ('johannesburg', 'rosebank', 'Rosebank'),
  ('johannesburg', 'sandton', 'Sandton'),
  ('johannesburg', 'braamfontein', 'Braamfontein'),
  ('johannesburg', 'maboneng', 'Maboneng'),
  ('johannesburg', 'melville', 'Melville'),
  ('johannesburg', 'soweto', 'Soweto'),
  ('pretoria', 'hatfield', 'Hatfield'),
  ('pretoria', 'menlyn', 'Menlyn'),
  ('pretoria', 'brooklyn', 'Brooklyn'),
  ('pretoria', 'centurion', 'Centurion')
) as a (city, slug, name)
join public.cities c on c.slug = a.city;

insert into public.categories (slug, name, sort) values
  ('lounge', 'Lounge', 1),
  ('club', 'Club', 2),
  ('rooftop', 'Rooftop bar', 3),
  ('live-music', 'Live music', 4),
  ('shisanyama', 'Shisanyama', 5),
  ('cocktail-bar', 'Cocktail bar', 6);

-- Sample venues --------------------------------------------------------------
insert into public.venues (slug, name, city_id, area_id, category_id, description, landmark,
  whatsapp_e164, contact_whatsapp, accepts_requests, dress_code, min_age, publication, ever_approved, is_sample)
select v.slug, v.name, c.id, a.id, k.id,
  'SAMPLE LISTING FOR DEVELOPMENT. This is not a real venue.', v.landmark,
  '+27820000000', true, true, v.dress, 18, 'published', true, true
from (values
  ('sample-lounge-rosebank', 'Sample Lounge (Rosebank)', 'johannesburg', 'rosebank', 'lounge', 'Sample landmark', 'Smart casual'),
  ('sample-rooftop-braamfontein', 'Sample Rooftop (Braamfontein)', 'johannesburg', 'braamfontein', 'rooftop', 'Sample landmark', null),
  ('sample-club-hatfield', 'Sample Club (Hatfield)', 'pretoria', 'hatfield', 'club', 'Sample landmark', 'No sportswear')
) as v (slug, name, city, area, category, landmark, dress)
join public.cities c on c.slug = v.city
join public.areas a on a.city_id = c.id and a.slug = v.area
join public.categories k on k.slug = v.category;

insert into public.venue_hours (venue_id, day, opens, closes)
select v.id, d.day, '18:00', '02:00'
from public.venues v cross join (values (4), (5), (6)) as d (day)
where v.is_sample;

insert into public.price_items (venue_id, kind, lo_cents, hi_cents, source, confirmed_on, expires_on, note)
select v.id, p.kind::public.price_kind, p.lo, p.hi, 'estimate', current_date, current_date + 90, 'Sample price'
from public.venues v cross join (values ('entry', 10000, 10000), ('drink', 4500, 8000)) as p (kind, lo, hi)
where v.is_sample;

insert into public.events (venue_id, city_id, slug, title, description, starts_at, entry_lo_cents, entry_hi_cents, price_source, status, is_sample)
select v.id, v.city_id, 'sample-friday-session', 'Sample Friday Session',
  'SAMPLE EVENT FOR DEVELOPMENT. Not a real event.',
  -- Next Friday at 21:00 Johannesburg time.
  (date_trunc('week', now() at time zone 'Africa/Johannesburg' + interval '3 days') + interval '4 days 21 hours') at time zone 'Africa/Johannesburg', 10000, 15000, 'estimate', 'published', true
from public.venues v where v.slug = 'sample-lounge-rosebank';
