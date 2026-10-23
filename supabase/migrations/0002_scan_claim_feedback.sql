-- Make claim outcomes explicit for the web scan report. The claim table's
-- unique (team_id, scanner_id) key remains the concurrency-safe authority.
create or replace function public.resolve_scan(p_slug text)
returns table(destination_url text, message text)
language plpgsql security definer set search_path = '' as $$
declare
  v_team_id uuid;
  v_scanner public.scanners%rowtype;
  v_interaction_id uuid;
  v_delta integer := 0;
  v_result text;
begin
  v_team_id := public.current_team_id();
  if v_team_id is null then raise exception 'NOT_AN_ACTIVE_TEAM_SESSION'; end if;

  select * into v_scanner from public.scanners s where s.slug = p_slug and s.active for share;
  if not found then
    return query select '/'::text, 'SIGNAL NOT FOUND'::text;
    return;
  end if;

  insert into public.team_scanner_claims(team_id, scanner_id)
    values (v_team_id, v_scanner.id) on conflict do nothing;
  if not found then
    insert into public.scanner_interactions(team_id, scanner_id, result, points_delta)
      values (v_team_id, v_scanner.id, 'duplicate', 0) on conflict do nothing;
    return query select '/'::text, 'ALREADY CLAIMED'::text;
    return;
  end if;

  if v_scanner.type = 'reward' then
    v_delta := abs(v_scanner.points);
    v_result := 'awarded';
  elsif v_scanner.type = 'penalty' then
    v_delta := -abs(v_scanner.points);
    v_result := 'penalty_applied';
  else
    v_delta := 0;
    v_result := 'neutral';
  end if;

  insert into public.scanner_interactions(team_id, scanner_id, result, points_delta)
    values (v_team_id, v_scanner.id, v_result, v_delta) returning id into v_interaction_id;
  if v_delta <> 0 then
    insert into public.points_ledger(team_id, delta, reason, source, scanner_id, interaction_id)
      values (v_team_id, v_delta, 'Scanner: ' || v_scanner.name, 'scan', v_scanner.id, v_interaction_id);
  end if;

  if v_delta > 0 then
    return query select '/'::text, v_delta::text || ' POINT' || case when v_delta = 1 then '' else 'S' end || ' CLAIMED';
  elsif v_delta < 0 then
    return query select '/'::text, 'PENALTY APPLIED: ' || abs(v_delta)::text || ' POINTS';
  else
    return query select '/'::text, 'SIGNAL RECORDED — NO POINTS';
  end if;
end;
$$;

revoke all on function public.resolve_scan(text) from public, anon;
revoke all on function public.resolve_scan(text) from authenticated;
grant execute on function public.resolve_scan(text) to authenticated;

-- Preload the locations supplied for the event. Each QR awards one point once
-- per team; the server-side claim key prevents concurrent duplicate awards.
insert into public.scanners
  (slug, name, description, type, points, destination_url, destination_type, active)
values
  ('round-1-fake-mess-ground', 'Round 1 Fake QR — Mess Ground', 'Round 1 decoy marker at the Mess Ground.', 'reward', 1, '/', 'internal', true),
  ('sports-complex', 'Sports Complex', 'Orbital Breach field location.', 'reward', 1, '/', 'internal', true),
  ('pj-ground-actual-qr', 'PJ Ground — Actual QR', 'Actual Round 1 QR location at PJ Ground.', 'reward', 1, '/', 'internal', true),
  ('star-chart-mech-parking', 'Star Chart — Mech Parking', 'Star chart field location.', 'reward', 1, '/', 'internal', true),
  ('station-1-architecture-block-rocks', 'Station 1 — Architecture Block Rocks', 'Field station 1.', 'reward', 1, '/', 'internal', true),
  ('station-2-bmsce-academy', 'Station 2 — BMSCE Academy', 'Field station 2.', 'reward', 1, '/', 'internal', true),
  ('station-3-gopi-wall', 'Station 3 — Gopi Wall', 'Field station 3.', 'reward', 1, '/', 'internal', true),
  ('station-4-bmsce-international-hostel', 'Station 4 — BMSCE International Hostel', 'Field station 4.', 'reward', 1, '/', 'internal', true)
on conflict (slug) do nothing;

