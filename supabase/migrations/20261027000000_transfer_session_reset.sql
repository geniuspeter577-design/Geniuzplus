create or replace function public.reset_device_transfer_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;
  if not public.has_active_membership(auth.uid()) then
    raise exception 'MEMBERSHIP_REQUIRED';
  end if;

  update public.transfer_sessions
    set sender_user_id = null,
        sender_permit_hash = null,
        status = 'waiting',
        content_id = null,
        item_type = null,
        parent_series_id = null,
        file_name = null,
        title = null,
        file_size_bytes = null,
        file_sha256 = null,
        next_chunk = 0,
        received_bytes = 0,
        expires_at = now() + interval '2 hours',
        completed_at = null
    where id = p_session_id
      and receiver_user_id = auth.uid()
      and status = 'completed'
      and expires_at > now();

  if not found then
    raise exception 'TRANSFER_SESSION_RESET_UNAVAILABLE';
  end if;
end;
$$;

revoke all on function public.reset_device_transfer_session(uuid) from public, anon;
grant execute on function public.reset_device_transfer_session(uuid) to authenticated;