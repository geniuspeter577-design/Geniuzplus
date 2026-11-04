do $$
begin
  update storage.buckets
  set file_size_limit = 52428800
  where id = 'reels';

  if not found then
    raise exception 'Supabase Storage bucket reels does not exist.';
  end if;
end;
$$;
