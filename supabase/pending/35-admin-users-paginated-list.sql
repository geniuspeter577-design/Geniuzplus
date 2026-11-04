-- Run after the account, profile, membership, and push-token migrations.
-- Returns one bounded user page instead of downloading the user directory to the API.

create or replace function public.admin_list_users(
  p_search text default '',
  p_members_only boolean default false,
  p_page integer default 1,
  p_page_size integer default 50,
  p_sort text default 'newest'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  search_term text := lower(left(trim(coalesce(p_search, '')), 100));
begin
  if auth.role() <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  if p_page is null or p_page < 1 or p_page > 10000 then
    raise exception 'INVALID_PAGE';
  end if;
  if p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'INVALID_PAGE_SIZE';
  end if;
  if p_sort not in ('newest', 'oldest') then
    raise exception 'INVALID_SORT';
  end if;

  return (
    with candidates as materialized (
      select
        account.id,
        account.email,
        profile.display_name,
        profile.public_id,
        account.created_at as joined_at,
        account.last_sign_in_at,
        coalesce(membership.status, 'none') as membership_status,
        membership.current_period_end as membership_ends,
        (
          (membership.status = 'active' and membership.current_period_end > now())
          or (membership.status = 'grace' and membership.grace_until > now())
        ) as has_badge
      from auth.users account
      left join public.profiles profile on profile.id = account.id
      left join public.memberships membership on membership.user_id = account.id
      where (
        search_term = ''
        or position(search_term in lower(coalesce(account.email, ''))) > 0
        or position(search_term in lower(coalesce(profile.display_name, ''))) > 0
        or position(search_term in lower(coalesce(profile.username, ''))) > 0
        or position(search_term in lower(coalesce(profile.public_id, ''))) > 0
      )
        and (
          not p_members_only
          or (membership.status = 'active' and membership.current_period_end > now())
          or (membership.status = 'grace' and membership.grace_until > now())
        )
    )
    select jsonb_build_object(
      'total', (select count(*) from candidates),
      'appStats', jsonb_build_object(
        'signedInAccounts', (select count(*) from auth.users),
        'signedInPhones', (select count(distinct token.expo_push_token) from public.device_push_tokens token),
        'visitorPhones', (select count(distinct token.expo_push_token) from public.guest_push_tokens token)
      ),
      'page', p_page,
      'pageSize', p_page_size,
      'users', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', page_user.id,
            'email', page_user.email,
            'displayName', page_user.display_name,
            'publicId', page_user.public_id,
            'joinedAt', page_user.joined_at,
            'lastSignInAt', page_user.last_sign_in_at,
            'membershipStatus', page_user.membership_status,
            'membershipEnds', page_user.membership_ends,
            'hasBadge', coalesce(page_user.has_badge, false)
          )
          order by
            case when p_sort = 'newest' then page_user.joined_at end desc,
            case when p_sort = 'oldest' then page_user.joined_at end asc,
            page_user.id asc
        )
        from (
          select *
          from candidates
          order by
            case when p_sort = 'newest' then joined_at end desc,
            case when p_sort = 'oldest' then joined_at end asc,
            id asc
          limit p_page_size
          offset (p_page - 1) * p_page_size
        ) page_user
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.admin_list_users(text, boolean, integer, integer, text) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, boolean, integer, integer, text) to service_role;
