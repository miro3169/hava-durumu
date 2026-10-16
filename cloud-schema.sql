BEGIN;
create table if not exists public.favorites (
 id bigint generated always as identity primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 80),
 country text not null default '' check(char_length(country)<=60),
 lat double precision not null check(lat between -90 and 90),
 lon double precision not null check(lon between -180 and 180),
 created_at timestamptz not null default now(), unique(user_id,lat,lon)
);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon, authenticated;
grant select,insert,delete on public.favorites to authenticated;
grant usage,select on sequence public.favorites_id_seq to authenticated;
create policy "Read own favorites" on public.favorites for select to authenticated using((select auth.uid())=user_id);
create policy "Create own favorites" on public.favorites for insert to authenticated with check((select auth.uid())=user_id);
create policy "Delete own favorites" on public.favorites for delete to authenticated using((select auth.uid())=user_id);
create table public.hava_cache (key text primary key, body jsonb not null, expires_at timestamptz not null);
create table public.hava_budget (key text primary key, count integer not null, reset_at timestamptz not null);
alter table public.hava_cache enable row level security;
alter table public.hava_budget enable row level security;
revoke all on public.hava_cache,public.hava_budget from public,anon,authenticated;
grant all on public.hava_cache,public.hava_budget to service_role;
create function public.hava_take_budget(budget_key text, max_count integer, window_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare used integer;
begin
 insert into public.hava_budget as b(key,count,reset_at) values(budget_key,1,now()+make_interval(secs=>window_seconds))
 on conflict(key) do update set count=case when b.reset_at<=now() then 1 else b.count+1 end,
 reset_at=case when b.reset_at<=now() then now()+make_interval(secs=>window_seconds) else b.reset_at end
 returning count into used;
 return used<=max_count;
end;$$;
revoke all on function public.hava_take_budget(text,integer,integer) from public,anon,authenticated;
grant execute on function public.hava_take_budget(text,integer,integer) to service_role;
COMMIT;
SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public';
