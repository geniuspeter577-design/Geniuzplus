create table if not exists public.football_match_notification_state (
  match_id text primary key check (match_id ~ '^[0-9]+$'),
  match_status text not null check (match_status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  home_score integer,
  away_score integer,
  live_notified boolean not null default false,
  updated_at timestamptz not null default now(),
  check (home_score is null or home_score >= 0),
  check (away_score is null or away_score >= 0)
);

alter table public.football_match_notification_state enable row level security;
revoke all on table public.football_match_notification_state from public, anon, authenticated;
grant select, insert, update on table public.football_match_notification_state to service_role;

create or replace function public.process_football_score_notifications(p_matches jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match_payload jsonb;
  v_match_id text;
  v_match_status text;
  v_home_team text;
  v_away_team text;
  v_incoming_home_score integer;
  v_incoming_away_score integer;
  v_next_home_score integer;
  v_next_away_score integer;
  v_current_state public.football_match_notification_state%rowtype;
  v_should_notify_live boolean;
  v_should_notify_goal boolean;
  v_notification_title text;
  v_notification_body text;
begin
  if p_matches is null or jsonb_typeof(p_matches) is distinct from 'array' then
    raise exception 'p_matches must be a JSON array';
  end if;

  for v_match_payload in
    select value
    from jsonb_array_elements(p_matches) as matches(value)
    order by value->>'id'
  loop
    v_match_id := nullif(btrim(v_match_payload->>'id'), '');
    v_match_status := nullif(v_match_payload->>'status', '');
    v_home_team := nullif(btrim(v_match_payload->'homeTeam'->>'name'), '');
    v_away_team := nullif(btrim(v_match_payload->'awayTeam'->>'name'), '');

    if v_match_id is null
      or v_match_id !~ '^[0-9]+$'
      or v_match_status is null
      or v_match_status not in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')
      or v_home_team is null
      or v_away_team is null
    then
      continue;
    end if;

    v_incoming_home_score := nullif(v_match_payload->>'homeScore', '')::integer;
    v_incoming_away_score := nullif(v_match_payload->>'awayScore', '')::integer;
    if (v_incoming_home_score is not null and v_incoming_home_score < 0)
      or (v_incoming_away_score is not null and v_incoming_away_score < 0)
    then
      continue;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('football:' || v_match_id, 0));
    select *
    into v_current_state
    from public.football_match_notification_state
    where football_match_notification_state.match_id = v_match_id
    for update;

    if not found then
      insert into public.football_match_notification_state (
        match_id,
        match_status,
        home_score,
        away_score,
        live_notified
      )
      values (
        v_match_id,
        v_match_status,
        v_incoming_home_score,
        v_incoming_away_score,
        v_match_status = 'live'
      );

      if v_match_status = 'live' then
        v_notification_title := 'Match is live';
        v_notification_body := format(
          '%s %s–%s %s has kicked off.',
          v_home_team,
          coalesce(v_incoming_home_score, 0),
          coalesce(v_incoming_away_score, 0),
          v_away_team
        );
        with created_notifications as (
          insert into public.notifications (user_id, type, title, body, content_id)
          select distinct tokens.user_id, 'personal', v_notification_title, v_notification_body, null
          from public.device_push_tokens as tokens
          returning id, user_id
        )
        insert into public.notification_push_queue (notification_id, user_id, title, body, content_id)
        select id, user_id, v_notification_title, v_notification_body, null
        from created_notifications;
      end if;

      continue;
    end if;

    v_next_home_score := coalesce(v_incoming_home_score, v_current_state.home_score);
    v_next_away_score := coalesce(v_incoming_away_score, v_current_state.away_score);
    v_should_notify_live := v_match_status = 'live' and not v_current_state.live_notified;
    v_should_notify_goal := v_match_status = 'live'
      and v_current_state.live_notified
      and (
        coalesce(v_next_home_score, 0) > coalesce(v_current_state.home_score, 0)
        or coalesce(v_next_away_score, 0) > coalesce(v_current_state.away_score, 0)
      );

    update public.football_match_notification_state
    set match_status = v_match_status,
        home_score = v_next_home_score,
        away_score = v_next_away_score,
        live_notified = v_current_state.live_notified or v_match_status = 'live',
        updated_at = now()
    where football_match_notification_state.match_id = v_match_id;

    if v_should_notify_live then
      v_notification_title := 'Match is live';
      v_notification_body := format(
        '%s %s–%s %s has kicked off.',
        v_home_team,
        coalesce(v_next_home_score, 0),
        coalesce(v_next_away_score, 0),
        v_away_team
      );
    elsif v_should_notify_goal then
      v_notification_title := 'Goal!';
      v_notification_body := format(
        '%s %s–%s %s',
        v_home_team,
        coalesce(v_next_home_score, 0),
        coalesce(v_next_away_score, 0),
        v_away_team
      );
    else
      continue;
    end if;

    with created_notifications as (
      insert into public.notifications (user_id, type, title, body, content_id)
      select distinct tokens.user_id, 'personal', v_notification_title, v_notification_body, null
      from public.device_push_tokens as tokens
      returning id, user_id
    )
    insert into public.notification_push_queue (notification_id, user_id, title, body, content_id)
    select id, user_id, v_notification_title, v_notification_body, null
    from created_notifications;
  end loop;
end;
$$;

revoke all on function public.process_football_score_notifications(jsonb) from public, anon, authenticated;
grant execute on function public.process_football_score_notifications(jsonb) to service_role;
