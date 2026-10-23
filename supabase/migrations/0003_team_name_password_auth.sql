-- Remove the event's dependence on confirmation email delivery. Supabase Auth
-- still owns password verification and session tokens; synthetic .invalid
-- addresses are private implementation identifiers and never sent emails.
drop function if exists public.resolve_team_login(text);
create function public.resolve_team_login(p_team_name text)
returns text
language sql security definer stable set search_path = '' as $$
  select u.email
  from public.teams t
  join auth.users u on u.id = t.auth_user_id
  where lower(trim(t.team_name)) = lower(trim(p_team_name))
  limit 1;
$$;
revoke all on function public.resolve_team_login(text) from public, anon, authenticated;
grant execute on function public.resolve_team_login(text) to service_role;

create or replace function public.register_team_account(
  p_auth_user_id uuid,
  p_team_name text,
  p_participant1_name text,
  p_participant2_name text,
  p_login_email text,
  p_secondary_email text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_confirmed_at timestamptz;
  v_auth_email text;
  v_team_id uuid;
begin
  if length(trim(p_team_name)) not between 2 and 48
     or length(trim(p_participant1_name)) not between 1 and 80
     or length(trim(p_participant2_name)) not between 1 and 80
     or p_login_email !~ '^crew-[a-f0-9]{64}@teams\.orbitalbreach\.invalid$'
     or p_secondary_email !~ '^member-[a-f0-9]{64}@teams\.orbitalbreach\.invalid$' then
    raise exception 'INVALID_REGISTRATION_DETAILS';
  end if;

  if not coalesce((select es.registration_open from public.event_settings es where es.id = 1), false) then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  select u.email, u.email_confirmed_at into v_auth_email, v_confirmed_at
    from auth.users u where u.id = p_auth_user_id;
  if v_auth_email is null or lower(v_auth_email) <> lower(p_login_email) or v_confirmed_at is null then
    raise exception 'INVALID_AUTH_ACCOUNT';
  end if;

  insert into public.teams(auth_user_id, team_name, participant1_name, participant1_email, participant2_name, participant2_email)
    values (p_auth_user_id, trim(p_team_name), trim(p_participant1_name), p_login_email, trim(p_participant2_name), p_secondary_email)
    returning id into v_team_id;

  insert into public.team_emails(email, team_id)
    values (p_login_email, v_team_id), (p_secondary_email, v_team_id);
  return true;
end;
$$;
revoke all on function public.register_team_account(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.register_team_account(uuid,text,text,text,text,text) to service_role;

