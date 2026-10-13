alter table public.memberships drop constraint if exists memberships_source_check;
alter table public.memberships add constraint memberships_source_check check (source in ('paystack', 'flutterwave', 'admin'));
