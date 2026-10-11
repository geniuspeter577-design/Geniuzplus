create table if not exists public.transfer_short_codes (
  code text primary key check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$'),
  session_id uuid not null references public.transfer_sessions(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  ip text not null check (ip ~ '^([0-9]{1,3}[.]){3}[0-9]{1,3}$'),
  port integer not null check (port between 1 and 65535),
  session_token text not null check (session_token ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists transfer_short_codes_session_idx on public.transfer_short_codes (session_id);
alter table public.transfer_short_codes enable row level security;
revoke all on public.transfer_short_codes from public, anon, authenticated;

create table if not exists public.transfer_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists transfer_code_attempts_user_idx on public.transfer_code_attempts (user_id, attempted_at desc);
alter table public.transfer_code_attempts enable row level security;
revoke all on public.transfer_code_attempts from public, anon, authenticated;

create or replace function public.register_transfer_code(
  p_code text, p_session_id uuid, p_ip text, p_port integer, p_session_token text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_expires timestamptz;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not public.has_active_membership(auth.uid()) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;
  select least(s.expires_at, now() + interval '30 minutes') into v_expires
  from public.transfer_sessions s
  where s.id = p_session_id
    and s.receiver_user_id = auth.uid()
    and s.status not in ('expired', 'canceled')
    and s.expires_at > now();
  if v_expires is null then
    raise exception 'TRANSFER_SESSION_UNAVAILABLE';
  end if;
  delete from public.transfer_short_codes where session_id = p_session_id or expires_at < now();
  insert into public.transfer_short_codes (code, session_id, receiver_user_id, ip, port, session_token, expires_at)
  values (p_code, p_session_id, auth.uid(), p_ip, p_port, p_session_token, v_expires);
  return p_code;
end;
$$;
revoke all on function public.register_transfer_code(text, uuid, text, integer, text) from public, anon;
grant execute on function public.register_transfer_code(text, uuid, text, integer, text) to authenticated;

create or replace function public.lookup_transfer_code(p_code text)
returns table (ip text, port integer, session_id uuid, session_token text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_failed integer;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not public.has_active_membership(auth.uid()) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;
  delete from public.transfer_code_attempts where attempted_at < now() - interval '1 day';
  select count(*) into v_failed from public.transfer_code_attempts
  where user_id = auth.uid() and attempted_at > now() - interval '10 minutes';
  if v_failed >= 8 then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;
  return query
  select c.ip, c.port, c.session_id, c.session_token
  from public.transfer_short_codes c
  join public.transfer_sessions s on s.id = c.session_id
  where c.code = upper(p_code)
    and c.expires_at > now()
    and s.expires_at > now()
    and s.status not in ('expired', 'canceled');
  if not found then
    insert into public.transfer_code_attempts (user_id) values (auth.uid());
  end if;
end;
$$;
revoke all on function public.lookup_transfer_code(text) from public, anon;
grant execute on function public.lookup_transfer_code(text) to authenticated;
