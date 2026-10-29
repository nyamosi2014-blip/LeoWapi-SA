-- LeoWapi SA access rules: row-level security, workflow guards and audit.
--
-- The application checks these rules too (src/lib/domain), but the database is the
-- last line: a bug in a page or a crafted API call still cannot publish a venue,
-- verify a listing or confirm a request on someone else's behalf.
--
-- "System" below means a connection with no signed-in user (the service role used by
-- server jobs, or a migration). Anonymous visitors never reach the guards, because
-- row-level security gives them no insert or update rights.

-- ---------------------------------------------------------------------------
-- Helpers. security definer so policies can read user_roles and venue_members
-- without granting customers access to those tables.
-- ---------------------------------------------------------------------------
create function public.has_role(r public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r);
$$;

create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('moderator', 'admin'));
$$;

create function public.is_venue_member(v uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.venue_members where venue_id = v and user_id = auth.uid());
$$;

create function public.venue_is_public(v uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.venues where id = v and publication = 'published');
$$;

create function public.can_see_venue(v uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.venue_is_public(v) or public.is_venue_member(v) or public.is_staff();
$$;

create function public.is_production()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'production' from public.app_settings where key = 'environment'), false);
$$;

create function public.audit(action text, target_type text, target_id text, details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), action, target_type, target_id, coalesce(details, '{}'));
$$;
revoke execute on function public.audit(text, text, text, jsonb) from public, anon, authenticated;

-- Same table as src/lib/domain/publication.ts. Keep the two in step.
create function public.publication_transition_ok(
  from_s public.publication_status, to_s public.publication_status,
  as_owner boolean, as_moderator boolean, ever_approved boolean
) returns boolean language sql immutable set search_path = '' as $$
  select case
    when from_s = to_s then true
    when as_owner and (from_s, to_s) in (
      ('draft', 'pending'), ('pending', 'draft'), ('published', 'unpublished'),
      ('unpublished', 'pending'), ('rejected', 'draft')) then true
    when as_owner and from_s = 'unpublished' and to_s = 'published' then ever_approved
    when as_moderator and (from_s, to_s) in (
      ('pending', 'published'), ('pending', 'rejected'), ('published', 'unpublished')) then true
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- New accounts get a profile
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch before update on public.venues for each row execute function public.touch_updated_at();
create trigger touch before update on public.events for each row execute function public.touch_updated_at();
create trigger touch before update on public.requests for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Sample data can never exist in production
-- ---------------------------------------------------------------------------
create function public.refuse_sample_in_production()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_sample and public.is_production() then
    raise exception 'Sample data is not allowed in production' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger no_sample before insert or update on public.venues for each row execute function public.refuse_sample_in_production();
create trigger no_sample before insert or update on public.events for each row execute function public.refuse_sample_in_production();
create trigger no_sample before insert or update on public.offers for each row execute function public.refuse_sample_in_production();

-- Switching an environment to production with sample rows still in it fails too.
create function public.check_environment_switch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.key = 'environment' and new.value = 'production' and (
    exists (select 1 from public.venues where is_sample) or
    exists (select 1 from public.events where is_sample) or
    exists (select 1 from public.offers where is_sample)) then
    raise exception 'Remove sample venues, events and offers before switching to production' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger environment_switch before insert or update on public.app_settings
  for each row execute function public.check_environment_switch();

-- ---------------------------------------------------------------------------
-- Venues: publication and verification guard
-- ---------------------------------------------------------------------------
create function public.guard_venue()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  member boolean;
  staff boolean;
begin
  if uid is null then return new; end if;  -- system
  staff := public.is_staff();

  if tg_op = 'INSERT' then
    if not staff then
      new.created_by := uid;
      new.is_sample := false;
    end if;
    if new.publication <> 'draft' or new.verification <> 'none' or new.ever_approved
       or new.verified_at is not null or new.verified_by is not null or new.moderator_note is not null then
      raise exception 'A new venue starts as an unverified draft' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  member := public.is_venue_member(old.id);

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot change' using errcode = 'insufficient_privilege';
  end if;
  if new.is_sample is distinct from old.is_sample and not staff then
    raise exception 'Only LeoWapi staff can change the sample flag' using errcode = 'insufficient_privilege';
  end if;
  if new.moderator_note is distinct from old.moderator_note and (not staff or member) then
    raise exception 'Only a moderator can write the moderator note' using errcode = 'insufficient_privilege';
  end if;
  if new.ever_approved is distinct from old.ever_approved then
    raise exception 'ever_approved is set by approval only' using errcode = 'insufficient_privilege';
  end if;

  if new.publication is distinct from old.publication then
    -- A moderator who is also a member of the venue acts as its owner, never as its moderator.
    if not public.publication_transition_ok(old.publication, new.publication,
         member, staff and not member, old.ever_approved) then
      raise exception 'Publication change % -> % is not allowed for you', old.publication, new.publication
        using errcode = 'insufficient_privilege';
    end if;
    if new.publication = 'published' and old.publication = 'pending' then
      new.ever_approved := true;
    end if;
    perform public.audit('venue.publication', 'venue', old.id::text,
      jsonb_build_object('from', old.publication, 'to', new.publication, 'note', new.moderator_note));
  end if;

  if new.verification is distinct from old.verification
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by then
    if not staff or member then
      raise exception 'Only an independent moderator can change verification' using errcode = 'insufficient_privilege';
    end if;
    if new.verification = 'verified' then
      if not exists (select 1 from public.verifications v
                     where v.venue_id = old.id and v.passed
                       and (v.expires_on is null or v.expires_on >= current_date)) then
        raise exception 'Record a passed verification check before marking the venue verified'
          using errcode = 'check_violation';
      end if;
      new.verified_at := now();
      new.verified_by := uid;
    else
      new.verified_at := null;
      new.verified_by := null;
    end if;
    perform public.audit('venue.verification', 'venue', old.id::text,
      jsonb_build_object('from', old.verification, 'to', new.verification));
  end if;

  return new;
end $$;
create trigger guard before insert or update on public.venues for each row execute function public.guard_venue();

-- Whoever creates a venue becomes its owner.
create function public.add_venue_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    insert into public.venue_members (venue_id, user_id, member_role)
    values (new.id, auth.uid(), 'owner') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger add_creator after insert on public.venues for each row execute function public.add_venue_creator();

-- ---------------------------------------------------------------------------
-- Prices: only a moderator can mark a price as verified by LeoWapi
-- ---------------------------------------------------------------------------
create function public.guard_price()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.source = 'verified' and (not public.is_staff() or public.is_venue_member(new.venue_id))
     and (tg_op = 'INSERT' or old.source is distinct from 'verified'
          or old.lo_cents is distinct from new.lo_cents or old.hi_cents is distinct from new.hi_cents) then
    raise exception 'Only an independent moderator can mark a price as verified' using errcode = 'insufficient_privilege';
  end if;
  if new.source = 'customer_report' and tg_op = 'INSERT' and not public.is_staff() then
    raise exception 'Customer price reports go through the reports form' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
create trigger guard before insert or update on public.price_items for each row execute function public.guard_price();

-- ---------------------------------------------------------------------------
-- Events and offers: same review rule as venues
-- ---------------------------------------------------------------------------
create function public.guard_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  is_owner boolean;
  is_mod boolean;
begin
  if uid is null then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_staff() then new.is_sample := false; end if;
    new.created_by := uid;
    if new.status <> 'draft' or new.moderator_note is not null then
      raise exception 'A new event starts as a draft' using errcode = 'insufficient_privilege';
    end if;
    if new.venue_id is not null and not public.is_venue_member(new.venue_id) and not public.is_staff() then
      raise exception 'Only the venue can list an event at its venue' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  is_owner := old.created_by = uid or (old.venue_id is not null and public.is_venue_member(old.venue_id));
  is_mod := public.is_staff() and not is_owner;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot change' using errcode = 'insufficient_privilege';
  end if;
  if new.is_sample is distinct from old.is_sample and not public.is_staff() then
    raise exception 'Only LeoWapi staff can change the sample flag' using errcode = 'insufficient_privilege';
  end if;
  if new.moderator_note is distinct from old.moderator_note and not is_mod then
    raise exception 'Only a moderator can write the moderator note' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
       (is_owner and (old.status, new.status) in (('draft', 'pending'), ('pending', 'draft'), ('rejected', 'draft'),
                                                  ('published', 'cancelled')))
    or (is_mod and (old.status, new.status) in (('pending', 'published'), ('pending', 'rejected'),
                                                ('published', 'cancelled'), ('published', 'expired')))) then
    raise exception 'Event status change % -> % is not allowed for you', old.status, new.status
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    perform public.audit('event.status', 'event', old.id::text, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger guard before insert or update on public.events for each row execute function public.guard_event();

create function public.guard_offer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  member boolean;
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_staff() then new.is_sample := false; end if;
    new.created_by := auth.uid();
    if new.status <> 'draft' then
      raise exception 'A new offer starts as a draft' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;
  member := public.is_venue_member(old.venue_id);
  if new.is_sample is distinct from old.is_sample and not public.is_staff() then
    raise exception 'Only LeoWapi staff can change the sample flag' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    if not public.publication_transition_ok(old.status, new.status, member, public.is_staff() and not member, false) then
      raise exception 'Offer status change % -> % is not allowed for you', old.status, new.status
        using errcode = 'insufficient_privilege';
    end if;
    perform public.audit('offer.status', 'offer', old.id::text, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger guard before insert or update on public.offers for each row execute function public.guard_offer();

-- ---------------------------------------------------------------------------
-- Requests: same transition table as src/lib/domain/requests.ts
-- ---------------------------------------------------------------------------
create function public.request_transition_ok(from_s public.request_status, to_s public.request_status, actor text)
returns boolean language sql immutable set search_path = '' as $$
  select case (from_s::text || '>' || to_s::text)
    when 'submitted>delivered'    then actor in ('system', 'admin')
    when 'submitted>cancelled'    then actor in ('customer', 'admin')
    when 'submitted>expired'      then actor = 'system'
    when 'delivered>acknowledged' then actor in ('venue', 'admin')
    when 'delivered>confirmed'    then actor in ('venue', 'admin')
    when 'delivered>declined'     then actor in ('venue', 'admin')
    when 'delivered>cancelled'    then actor in ('customer', 'admin')
    when 'delivered>expired'      then actor = 'system'
    when 'acknowledged>confirmed' then actor in ('venue', 'admin')
    when 'acknowledged>declined'  then actor in ('venue', 'admin')
    when 'acknowledged>cancelled' then actor in ('customer', 'admin')
    when 'acknowledged>expired'   then actor = 'system'
    when 'confirmed>cancelled'    then actor in ('customer', 'venue', 'admin')
    else false
  end;
$$;

create function public.guard_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  actor text;
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      new.customer_id := uid;
      if new.status <> 'submitted' then
        raise exception 'A new request starts as submitted' using errcode = 'insufficient_privilege';
      end if;
      if new.type in ('table', 'group_outing') and new.venue_id is not null and not exists (
           select 1 from public.venues where id = new.venue_id and publication = 'published' and accepts_requests) then
        raise exception 'This venue is not taking requests' using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  -- After submission only the status moves. Everything else is the customer's record of what they asked for.
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') and uid is not null then
    raise exception 'Only the status of a request can change' using errcode = 'insufficient_privilege';
  end if;
  if new.status is not distinct from old.status then return new; end if;

  -- A person can hold more than one relationship to a request. Try the strongest first.
  actor := case
    when uid is null then 'system'
    when public.is_staff() and not (old.venue_id is not null and public.is_venue_member(old.venue_id)) then 'admin'
    when old.venue_id is not null and public.is_venue_member(old.venue_id)
         and public.request_transition_ok(old.status, new.status, 'venue') then 'venue'
    when old.customer_id = uid then 'customer'
    else 'none'
  end;
  if not public.request_transition_ok(old.status, new.status, actor) then
    raise exception 'Request status change % -> % is not allowed for you', old.status, new.status
      using errcode = 'insufficient_privilege';
  end if;
  insert into public.request_status_history (request_id, from_status, to_status, actor_id, actor_kind)
  values (old.id, old.status, new.status, uid, actor);
  return new;
end $$;
create trigger guard before insert or update on public.requests for each row execute function public.guard_request();

create function public.log_new_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.request_status_history (request_id, from_status, to_status, actor_id, actor_kind)
  values (new.id, null, new.status, auth.uid(), case when auth.uid() is null then 'system' else 'customer' end);
  return new;
end $$;
create trigger log_new after insert on public.requests for each row execute function public.log_new_request();

-- ---------------------------------------------------------------------------
-- Roles, verifications and reports are audited
-- ---------------------------------------------------------------------------
create function public.audit_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit('role.grant', 'user', new.user_id::text, jsonb_build_object('role', new.role));
    return new;
  end if;
  perform public.audit('role.revoke', 'user', old.user_id::text, jsonb_build_object('role', old.role));
  return old;
end $$;
create trigger audit after insert or delete on public.user_roles for each row execute function public.audit_roles();

create function public.guard_role_grant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null then new.granted_by := auth.uid(); end if;
  return new;
end $$;
create trigger guard before insert on public.user_roles for each row execute function public.guard_role_grant();

create function public.guard_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_venue_member(new.venue_id) then
    raise exception 'You cannot verify a venue you belong to' using errcode = 'insufficient_privilege';
  end if;
  new.checked_by := auth.uid();
  perform public.audit('venue.check', 'venue', new.venue_id::text,
    jsonb_build_object('check', new.check_type, 'passed', new.passed));
  return new;
end $$;
create trigger guard before insert on public.verifications for each row execute function public.guard_verification();

create function public.guard_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.reporter_id := auth.uid();
    new.status := 'open';
    new.resolution := null; new.resolved_by := null; new.resolved_at := null;
    return new;
  end if;
  if new.status in ('resolved', 'dismissed') and old.status not in ('resolved', 'dismissed') then
    new.resolved_by := auth.uid();
    new.resolved_at := now();
  end if;
  perform public.audit('report.status', 'report', old.id::text, jsonb_build_object('from', old.status, 'to', new.status));
  return new;
end $$;
create trigger guard before insert or update on public.reports for each row execute function public.guard_report();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.cities enable row level security;
alter table public.areas enable row level security;
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.consents enable row level security;
alter table public.venues enable row level security;
alter table public.venue_members enable row level security;
alter table public.venue_hours enable row level security;
alter table public.venue_hours_overrides enable row level security;
alter table public.price_items enable row level security;
alter table public.venue_media enable row level security;
alter table public.events enable row level security;
alter table public.offers enable row level security;
alter table public.requests enable row level security;
alter table public.request_status_history enable row level security;
alter table public.saved_venues enable row level security;
alter table public.event_bookmarks enable row level security;
alter table public.verifications enable row level security;
alter table public.reports enable row level security;
alter table public.audit_log enable row level security;
alter table public.integration_status enable row level security;

-- Settings, audit and integration health: staff read, nobody writes through the API.
create policy staff_read on public.app_settings for select to authenticated using (public.has_role('admin'));
create policy staff_read on public.audit_log for select to authenticated using (public.has_role('admin'));
create policy staff_read on public.integration_status for select to authenticated using (public.is_staff());

-- Reference data: everyone reads, admins write.
create policy read_all on public.cities for select to anon, authenticated using (true);
create policy admin_write on public.cities for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy read_all on public.areas for select to anon, authenticated using (true);
create policy admin_write on public.areas for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy read_all on public.categories for select to anon, authenticated using (true);
create policy admin_write on public.categories for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- Profiles and consents: your own; staff can read profiles to handle requests and reports.
create policy own_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_staff());
create policy own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy own_read on public.consents for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.consents for insert to authenticated with check (user_id = auth.uid());

-- Roles: you can see your own; only admins grant or revoke.
create policy own_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));
create policy admin_grant on public.user_roles for insert to authenticated with check (public.has_role('admin'));
create policy admin_revoke on public.user_roles for delete to authenticated using (public.has_role('admin') and user_id <> auth.uid());

-- Venues
create policy public_read on public.venues for select to anon, authenticated
  using (publication = 'published' or created_by = auth.uid() or public.is_venue_member(id) or public.is_staff());
create policy owner_create on public.venues for insert to authenticated
  with check (public.has_role('venue_owner') or public.is_staff());
create policy member_update on public.venues for update to authenticated
  using (public.is_venue_member(id) or public.is_staff()) with check (public.is_venue_member(id) or public.is_staff());
create policy admin_delete on public.venues for delete to authenticated using (public.has_role('admin'));

create policy member_read on public.venue_members for select to authenticated
  using (user_id = auth.uid() or public.is_venue_member(venue_id) or public.is_staff());
create policy admin_write on public.venue_members for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Venue details follow the venue: visible when the venue is, editable by its members and staff.
create policy read_with_venue on public.venue_hours for select to anon, authenticated using (public.can_see_venue(venue_id));
create policy member_write on public.venue_hours for all to authenticated
  using (public.is_venue_member(venue_id) or public.is_staff()) with check (public.is_venue_member(venue_id) or public.is_staff());
create policy read_with_venue on public.venue_hours_overrides for select to anon, authenticated using (public.can_see_venue(venue_id));
create policy member_write on public.venue_hours_overrides for all to authenticated
  using (public.is_venue_member(venue_id) or public.is_staff()) with check (public.is_venue_member(venue_id) or public.is_staff());
create policy read_with_venue on public.price_items for select to anon, authenticated using (public.can_see_venue(venue_id));
create policy member_write on public.price_items for all to authenticated
  using (public.is_venue_member(venue_id) or public.is_staff()) with check (public.is_venue_member(venue_id) or public.is_staff());
create policy read_with_venue on public.venue_media for select to anon, authenticated using (public.can_see_venue(venue_id));
create policy member_write on public.venue_media for all to authenticated
  using (public.is_venue_member(venue_id) or public.is_staff()) with check (public.is_venue_member(venue_id) or public.is_staff());

-- Events
create policy public_read on public.events for select to anon, authenticated
  using (status in ('published', 'cancelled') or created_by = auth.uid()
         or (venue_id is not null and public.is_venue_member(venue_id)) or public.is_staff());
create policy organiser_create on public.events for insert to authenticated
  with check (public.has_role('organiser') or public.has_role('venue_owner') or public.is_staff());
create policy owner_update on public.events for update to authenticated
  using (created_by = auth.uid() or (venue_id is not null and public.is_venue_member(venue_id)) or public.is_staff())
  with check (created_by = auth.uid() or (venue_id is not null and public.is_venue_member(venue_id)) or public.is_staff());
create policy admin_delete on public.events for delete to authenticated using (public.has_role('admin'));

-- Offers
create policy public_read on public.offers for select to anon, authenticated
  using ((status = 'published' and public.venue_is_public(venue_id)) or public.is_venue_member(venue_id) or public.is_staff());
create policy member_write on public.offers for insert to authenticated
  with check (public.is_venue_member(venue_id) or public.is_staff());
create policy member_update on public.offers for update to authenticated
  using (public.is_venue_member(venue_id) or public.is_staff()) with check (public.is_venue_member(venue_id) or public.is_staff());
create policy member_delete on public.offers for delete to authenticated
  using ((public.is_venue_member(venue_id) and status = 'draft') or public.has_role('admin'));

-- Requests: signed-in customers create their own; the venue sees requests sent to it.
create policy customer_create on public.requests for insert to authenticated with check (customer_id = auth.uid());
create policy party_read on public.requests for select to authenticated
  using (customer_id = auth.uid() or (venue_id is not null and public.is_venue_member(venue_id)) or public.is_staff());
create policy party_update on public.requests for update to authenticated
  using (customer_id = auth.uid() or (venue_id is not null and public.is_venue_member(venue_id)) or public.is_staff());
create policy party_read on public.request_status_history for select to authenticated
  using (exists (select 1 from public.requests r where r.id = request_id));

-- Saved lists: your own only.
create policy own_all on public.saved_venues for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.event_bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Verifications: moderators record checks; the venue can see what was checked.
create policy read on public.verifications for select to authenticated using (public.is_staff() or public.is_venue_member(venue_id));
create policy staff_create on public.verifications for insert to authenticated with check (public.is_staff());

-- Reports: any signed-in person can report; staff work the queue.
create policy create_own on public.reports for insert to authenticated with check (true);
create policy read on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_staff());
create policy staff_update on public.reports for update to authenticated using (public.is_staff()) with check (public.is_staff());
