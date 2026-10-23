create extension if not exists pgcrypto;

create table public.event_settings (
  id integer primary key check (id = 1),
  event_name text not null default 'ORBITAL BREACH' check (length(event_name) between 1 and 80),
  announcement text check (announcement is null or length(announcement) <= 1000),
  registration_open boolean not null default true,
  leaderboard_enabled boolean not null default false,
  allowed_email_domains text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.event_settings (id) values (1);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  team_name text not null check (length(trim(team_name)) between 2 and 48),
  team_name_key text generated always as (lower(trim(team_name))) stored unique,
  participant1_name text not null check (length(trim(participant1_name)) between 1 and 80),
  participant1_email text not null,
  participant2_name text not null check (length(trim(participant2_name)) between 1 and 80),
  participant2_email text not null,
  status text not null default 'active' check (status in ('active', 'disqualified')),
  created_at timestamptz not null default now(),
  check (lower(trim(participant1_email)) <> lower(trim(participant2_email)))
);
create unique index teams_participant1_email_unique on public.teams (lower(participant1_email));

create table public.team_emails (
  email text primary key,
  team_id uuid not null references public.teams(id) on delete cascade
);

create table public.admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamptz not null default now()
);

create table public.scanners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[A-Za-z0-9-]{2,64}$'),
  name text not null check (length(trim(name)) between 1 and 100),
  description text check (description is null or length(description) <= 1000),
  type text not null default 'neutral' check (type in ('reward', 'penalty', 'clue', 'decoy', 'neutral')),
  points integer not null default 5 check (points between 0 and 1000),
  destination_url text not null check (length(destination_url) <= 2048),
  destination_type text not null default 'internal' check (destination_type in ('internal', 'external')),
  active boolean not null default true,
  created_by uuid references public.admins(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((destination_type = 'internal' and destination_url like '/%' and left(destination_url,2) <> '//' and destination_url !~ '[[:cntrl:]]') or (destination_type = 'external' and destination_url ~ '^https://[^[:space:]]+$'))
);

create table public.team_scanner_claims (
  team_id uuid not null references public.teams(id) on delete cascade,
  scanner_id uuid not null references public.scanners(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (team_id, scanner_id)
);

create table public.scanner_interactions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  scanner_id uuid references public.scanners(id) on delete set null,
  result text not null check (result in ('awarded', 'penalty_applied', 'neutral', 'duplicate', 'not_found', 'blocked')),
  points_delta integer not null default 0 check (points_delta between -1000 and 1000),
  created_at timestamptz not null default now()
);
create index scanner_interactions_team_created on public.scanner_interactions (team_id, created_at desc);
create unique index scanner_interactions_one_duplicate_log on public.scanner_interactions (team_id, scanner_id) where result = 'duplicate';

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  delta integer not null,
  reason text not null check (length(trim(reason)) between 1 and 300),
  source text not null check (source in ('scan', 'admin_adjustment')),
  scanner_id uuid references public.scanners(id) on delete set null,
  admin_id uuid references public.admins(id) on delete set null,
  interaction_id uuid unique references public.scanner_interactions(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((source = 'scan' and delta between -1000 and 1000) or (source = 'admin_adjustment' and delta between -100000 and 100000))
);
create index points_ledger_team on public.points_ledger (team_id);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references public.admins(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.admins a where a.auth_user_id = auth.uid());
$$;

create or replace function public.current_team_id()
returns uuid language sql security definer stable set search_path = '' as $$
  select t.id from public.teams t where t.auth_user_id = auth.uid() and t.status = 'active';
$$;

create or replace function public.complete_team_registration()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user auth.users%rowtype; v_team_name text; v_name1 text; v_name2 text; v_email1 text; v_email2 text; v_domains text[];
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into v_user from auth.users u where u.id = auth.uid();
  if v_user.id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if exists (select 1 from public.teams t where t.auth_user_id = v_user.id) then return true; end if;
  if v_user.email_confirmed_at is null then raise exception 'PRIMARY_EMAIL_NOT_VERIFIED'; end if;
  if coalesce(v_user.raw_user_meta_data->>'registration_requested','false') <> 'true' then return false; end if;
  if not coalesce((select es.registration_open from public.event_settings es where es.id = 1), false) then raise exception 'REGISTRATION_CLOSED'; end if;

  v_team_name := trim(coalesce(v_user.raw_user_meta_data->>'team_name',''));
  v_name1 := trim(coalesce(v_user.raw_user_meta_data->>'participant1_name',''));
  v_name2 := trim(coalesce(v_user.raw_user_meta_data->>'participant2_name',''));
  v_email1 := lower(trim(coalesce(v_user.email,'')));
  v_email2 := lower(trim(coalesce(v_user.raw_user_meta_data->>'participant2_email','')));
  if length(v_team_name) < 2 or length(v_team_name) > 48 or length(v_name1) not between 1 and 80 or length(v_name2) not between 1 and 80
    or v_email2 !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_email1 = v_email2 then raise exception 'INVALID_REGISTRATION_DETAILS'; end if;
  select es.allowed_email_domains into v_domains from public.event_settings es where es.id = 1;
  if cardinality(v_domains) > 0 and (split_part(v_email1,'@',2) <> all(v_domains) or split_part(v_email2,'@',2) <> all(v_domains)) then
    raise exception 'COLLEGE_EMAIL_DOMAIN_REQUIRED';
  end if;

  begin
    insert into public.teams(auth_user_id,team_name,participant1_name,participant1_email,participant2_name,participant2_email)
      values(v_user.id,v_team_name,v_name1,v_email1,v_name2,v_email2) on conflict (auth_user_id) do nothing;
  exception when unique_violation then raise exception 'REGISTRATION_COULD_NOT_BE_COMPLETED';
  end;
  if not exists (select 1 from public.teams t where t.auth_user_id = v_user.id) then return false; end if;
  insert into public.team_emails(email,team_id) select v_email1,t.id from public.teams t where t.auth_user_id = v_user.id
    on conflict (email) do nothing;
  if not exists (select 1 from public.team_emails te join public.teams t on t.id=te.team_id where t.auth_user_id=v_user.id and te.email=v_email1) then
    raise exception 'REGISTRATION_COULD_NOT_BE_COMPLETED';
  end if;
  insert into public.team_emails(email,team_id) select v_email2,t.id from public.teams t where t.auth_user_id = v_user.id
    on conflict (email) do nothing;
  if not exists (select 1 from public.team_emails te join public.teams t on t.id=te.team_id where t.auth_user_id=v_user.id and te.email=v_email2) then
    raise exception 'REGISTRATION_COULD_NOT_BE_COMPLETED';
  end if;
  return true;
end;
$$;
revoke all on function public.complete_team_registration() from public, anon;
grant execute on function public.complete_team_registration() to authenticated;

-- The secondary operator can use the shared crew password without exposing the primary email lookup.
create or replace function public.resolve_team_login(p_email text)
returns text language sql security definer stable set search_path = '' as $$
  select t.participant1_email from public.team_emails te join public.teams t on t.id = te.team_id
  where te.email = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.resolve_team_login(text) from public, anon, authenticated;
grant execute on function public.resolve_team_login(text) to service_role;

create or replace function public.bootstrap_admin(p_auth_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('orbital_breach_admin_bootstrap'));
  if exists (select 1 from public.admins) then raise exception 'BOOTSTRAP_ALREADY_USED'; end if;
  insert into public.admins(auth_user_id, role) values (p_auth_user_id, 'superadmin');
end;
$$;
revoke all on function public.bootstrap_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_admin(uuid) to service_role;

create or replace function public.resolve_scan(p_slug text)
returns table(destination_url text, message text)
language plpgsql security definer set search_path = '' as $$
declare v_team_id uuid; v_scanner public.scanners%rowtype; v_interaction_id uuid; v_delta integer := 0; v_result text;
begin
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'NOT_AN_ACTIVE_TEAM_SESSION'; end if;

  select * into v_scanner from public.scanners s where s.slug = p_slug and s.active for share;
  if not found then
    return query select '/dashboard'::text, 'SIGNAL LOST'::text; return;
  end if;

  -- The unique key serializes concurrent claims for the same team and signal.
  insert into public.team_scanner_claims(team_id, scanner_id) values (v_team_id, v_scanner.id) on conflict do nothing;
  if not found then
    insert into public.scanner_interactions(team_id, scanner_id, result, points_delta) values (v_team_id, v_scanner.id, 'duplicate', 0) on conflict do nothing;
    return query select v_scanner.destination_url, 'SIGNAL ALREADY CLAIMED'::text; return;
  end if;

  if v_scanner.type = 'reward' then v_delta := abs(v_scanner.points); v_result := 'awarded';
  elsif v_scanner.type = 'penalty' then v_delta := -abs(v_scanner.points); v_result := 'penalty_applied';
  else v_delta := 0; v_result := 'neutral'; end if;

  insert into public.scanner_interactions(team_id, scanner_id, result, points_delta)
    values (v_team_id, v_scanner.id, v_result, v_delta) returning id into v_interaction_id;
  if v_delta <> 0 then
    insert into public.points_ledger(team_id, delta, reason, source, scanner_id, interaction_id)
      values (v_team_id, v_delta, 'Scanner: ' || v_scanner.name, 'scan', v_scanner.id, v_interaction_id);
  end if;
  return query select v_scanner.destination_url, 'SIGNAL PROCESSED'::text;
end;
$$;
revoke all on function public.resolve_scan(text) from public, anon;
revoke all on function public.resolve_scan(text) from authenticated;
grant execute on function public.resolve_scan(text) to authenticated;

create or replace function public.get_my_activity()
returns table(created_at timestamptz, label text)
language sql security definer stable set search_path = '' as $$
  select si.created_at, 'Signal interaction logged'::text from public.scanner_interactions si
  where si.team_id = public.current_team_id() order by si.created_at desc limit 12;
$$;

create or replace function public.public_leaderboard()
returns table(rank integer, team_name text)
language plpgsql security definer stable set search_path = '' as $$
declare v_enabled boolean;
begin
  select es.leaderboard_enabled into v_enabled from public.event_settings es where es.id = 1;
  if not coalesce(v_enabled, false) then return; end if;
  return query select row_number() over (order by coalesce(sum(pl.delta), 0) desc, t.team_name)::integer, t.team_name
    from public.teams t left join public.points_ledger pl on pl.team_id = t.id where t.status = 'active'
    group by t.id, t.team_name order by coalesce(sum(pl.delta), 0) desc, t.team_name;
end;
$$;

create or replace function public.admin_upsert_scanner(
  p_id uuid, p_slug text, p_name text, p_description text, p_type text, p_points integer,
  p_destination_url text, p_destination_type text, p_active boolean
) returns public.scanners
language plpgsql security definer set search_path = '' as $$
declare v_admin_id uuid; v_row public.scanners%rowtype;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_type not in ('reward','penalty','clue','decoy','neutral') then raise exception 'INVALID_SCANNER_TYPE'; end if;
  if p_points < 0 or p_points > 1000 then raise exception 'INVALID_POINTS'; end if;
  if p_destination_type = 'internal' and (p_destination_url not like '/%' or left(p_destination_url,2) = '//' or p_destination_url ~ '[[:cntrl:]]') then raise exception 'INVALID_INTERNAL_DESTINATION'; end if;
  if p_destination_type = 'external' and p_destination_url !~ '^https://[^[:space:]]+$' then raise exception 'INVALID_EXTERNAL_DESTINATION'; end if;
  select a.id into v_admin_id from public.admins a where a.auth_user_id = auth.uid();
  if p_id is null then
    insert into public.scanners(slug,name,description,type,points,destination_url,destination_type,active,created_by)
      values (p_slug,trim(p_name),p_description,p_type,p_points,p_destination_url,p_destination_type,p_active,v_admin_id) returning * into v_row;
  else
    update public.scanners set slug=p_slug,name=trim(p_name),description=p_description,type=p_type,points=p_points,
      destination_url=p_destination_url,destination_type=p_destination_type,active=p_active,updated_at=now()
      where id=p_id returning * into v_row;
    if not found then raise exception 'SCANNER_NOT_FOUND'; end if;
  end if;
  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,details)
    values (v_admin_id,case when p_id is null then 'create_scanner' else 'update_scanner' end,'scanner',v_row.id,
      jsonb_build_object('slug',p_slug,'type',p_type,'points',p_points,'active',p_active));
  return v_row;
end;
$$;

create or replace function public.admin_adjust_points(p_team_id uuid, p_delta integer, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_delta = 0 or abs(p_delta) > 100000 then raise exception 'INVALID_DELTA'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 300 then raise exception 'REASON_REQUIRED'; end if;
  select a.id into v_admin_id from public.admins a where a.auth_user_id = auth.uid();
  if not exists (select 1 from public.teams t where t.id = p_team_id) then raise exception 'TEAM_NOT_FOUND'; end if;
  insert into public.points_ledger(team_id,delta,reason,source,admin_id) values(p_team_id,p_delta,trim(p_reason),'admin_adjustment',v_admin_id);
  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,details)
    values(v_admin_id,'adjust_points','team',p_team_id,jsonb_build_object('delta',p_delta,'reason',trim(p_reason)));
end;
$$;

create or replace function public.admin_set_team_status(p_team_id uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('active','disqualified') then raise exception 'INVALID_STATUS'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 300 then raise exception 'REASON_REQUIRED'; end if;
  select a.id into v_admin_id from public.admins a where a.auth_user_id = auth.uid();
  update public.teams set status=p_status where id=p_team_id;
  if not found then raise exception 'TEAM_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_admin_id,action,target_type,target_id,details)
    values(v_admin_id,'set_team_status','team',p_team_id,jsonb_build_object('status',p_status,'reason',trim(p_reason)));
end;
$$;

create or replace function public.admin_get_leaderboard()
returns table(team_id uuid, team_name text, total_points bigint, status text)
language sql security definer stable set search_path = '' as $$
  select t.id,t.team_name,coalesce(sum(pl.delta),0),t.status from public.teams t left join public.points_ledger pl on pl.team_id=t.id
  where public.is_admin() group by t.id,t.team_name,t.status order by coalesce(sum(pl.delta),0) desc,t.team_name;
$$;

alter table public.event_settings enable row level security;
alter table public.teams enable row level security;
alter table public.team_emails enable row level security;
alter table public.admins enable row level security;
alter table public.scanners enable row level security;
alter table public.team_scanner_claims enable row level security;
alter table public.scanner_interactions enable row level security;
alter table public.points_ledger enable row level security;
alter table public.audit_logs enable row level security;

create policy event_settings_read on public.event_settings for select to anon, authenticated using (true);
create policy event_settings_admin_update on public.event_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy teams_read_self_or_admin on public.teams for select to authenticated using (auth_user_id = auth.uid() or public.is_admin());
create policy admins_read_self_or_admin on public.admins for select to authenticated using (auth_user_id = auth.uid() or public.is_admin());
create policy scanners_admin_read on public.scanners for select to authenticated using (public.is_admin());
create policy team_emails_admin_read on public.team_emails for select to authenticated using (public.is_admin());
create policy claims_admin_read on public.team_scanner_claims for select to authenticated using (public.is_admin());
create policy interactions_admin_read on public.scanner_interactions for select to authenticated using (public.is_admin());
create policy ledger_admin_read on public.points_ledger for select to authenticated using (public.is_admin());
create policy audits_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

revoke all on public.event_settings,public.teams,public.team_emails,public.admins,public.scanners,public.team_scanner_claims,public.scanner_interactions,public.points_ledger,public.audit_logs from anon,authenticated;
grant select on public.event_settings to anon,authenticated;
grant select on public.teams,public.admins to authenticated;
grant select on public.scanners,public.team_emails,public.team_scanner_claims,public.scanner_interactions,public.points_ledger,public.audit_logs to authenticated;

revoke all on function public.is_admin() from public;
revoke all on function public.current_team_id() from public;
revoke all on function public.get_my_activity() from public;
revoke all on function public.public_leaderboard() from public;
revoke all on function public.admin_upsert_scanner(uuid,text,text,text,text,integer,text,text,boolean) from public;
revoke all on function public.admin_adjust_points(uuid,integer,text) from public;
revoke all on function public.admin_set_team_status(uuid,text,text) from public;
revoke all on function public.admin_get_leaderboard() from public;
grant execute on function public.get_my_activity() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.public_leaderboard() to anon,authenticated;
grant execute on function public.admin_upsert_scanner(uuid,text,text,text,text,integer,text,text,boolean) to authenticated;
grant execute on function public.admin_adjust_points(uuid,integer,text) to authenticated;
grant execute on function public.admin_set_team_status(uuid,text,text) to authenticated;
grant execute on function public.admin_get_leaderboard() to authenticated;

-- Keep server-owned tables free from direct client mutation even if default grants change.
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from anon, authenticated;
grant update on public.event_settings to authenticated;

