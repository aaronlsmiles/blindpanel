-- blindpanel: opt-in submissions for public rating studies.
--
-- Apply once per Supabase project (SQL editor, or psql as postgres), then add
-- `blindpanel` to the project's exposed schemas (Settings > API). Re-running is
-- safe. Only the server-side secret key (service_role) can read or write; the
-- browser never talks to the database.
--
-- Nothing personal is stored: a random session id, the answers, the order the
-- visitor saw, delivery facts (autoplay, keyboard, a rounded duration, the UI
-- version), flags, and the day it arrived. No IP, user agent, cookie or time.

create schema if not exists blindpanel;

create table if not exists blindpanel.submissions (
  id           bigint generated always as identity primary key,
  study        text   not null check (study ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  instrument   text   not null check (length(instrument) between 1 and 32),
  session      uuid   not null,
  item_order   jsonb  not null check (jsonb_typeof(item_order) = 'object' and pg_column_size(item_order) < 4096),
  answers      jsonb  not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 8192),
  delivery     jsonb  not null check (jsonb_typeof(delivery) = 'object' and pg_column_size(delivery) < 1024),
  -- flags mark rows for the tally to leave out; they never reject a row
  flags        text[] not null default '{}' check (flags <@ array['straightline', 'too_fast']::text[]),
  received_day date   not null default current_date,
  unique (study, session)
);

create index if not exists submissions_received_day_idx on blindpanel.submissions (received_day);

comment on table blindpanel.submissions is
  'Opt-in rating sessions. Append-only for the service role: no update or delete, so a leaked key cannot alter collected ratings.';

-- Caps against slow-burn spam, with no personal data to rate-limit on.
create table if not exists blindpanel.settings (
  key   text primary key check (key in ('daily_cap', 'total_cap')),
  value integer not null check (value >= 0)
);
insert into blindpanel.settings (key, value)
values ('daily_cap', 500), ('total_cap', 20000)
on conflict (key) do nothing;

create or replace function blindpanel.enforce_caps() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily integer;
  total integer;
begin
  -- one insert at a time, so two sessions cannot both take the last slot
  perform pg_advisory_xact_lock(hashtext('blindpanel.submissions'));
  new.received_day := current_date;  -- the client never chooses the day
  select value into daily from blindpanel.settings where key = 'daily_cap';
  select value into total from blindpanel.settings where key = 'total_cap';
  if (select count(*) from blindpanel.submissions s where s.received_day = new.received_day) >= coalesce(daily, 500) then
    raise exception 'blindpanel daily cap reached' using errcode = 'PT429';  -- PostgREST answers 429
  end if;
  if (select count(*) from blindpanel.submissions) >= coalesce(total, 20000) then
    raise exception 'blindpanel total cap reached' using errcode = 'PT429';
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_enforce_caps on blindpanel.submissions;
create trigger submissions_enforce_caps
  before insert on blindpanel.submissions
  for each row execute function blindpanel.enforce_caps();

-- Per item and question: how many unflagged sessions chose each scale point.
-- Cells with fewer than p_min_n answers are left out. Mirrors tallyRows() in
-- src/server/stores/tally.ts; tests/sql.test.ts checks the two agree.
create or replace function blindpanel.tally(p_study text, p_min_n integer default 5) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with kept as (
    select s.answers from blindpanel.submissions s
    where s.study = p_study and cardinality(s.flags) = 0
  ),
  cells as (
    select item.key as code, q.key as question, q.value::integer as v
    from kept
    cross join lateral (
      select * from jsonb_each(coalesce(kept.answers -> 'baseline', '{}'::jsonb))
      union all
      select * from jsonb_each(coalesce(kept.answers -> 'clips', '{}'::jsonb))
    ) as item
    -- a malformed row (only possible by hand) is skipped rather than breaking the tally
    cross join lateral jsonb_each_text(case when jsonb_typeof(item.value) = 'object' then item.value else '{}'::jsonb end) as q
    where q.value ~ '^[1-5]$'
  ),
  agg as (
    select code, question, count(*)::integer as n,
      jsonb_build_array(
        count(*) filter (where v = 1), count(*) filter (where v = 2), count(*) filter (where v = 3),
        count(*) filter (where v = 4), count(*) filter (where v = 5)) as counts
    from cells
    group by code, question
    having count(*) >= p_min_n
  ),
  per_item as (
    select code, jsonb_object_agg(question, jsonb_build_object('n', n, 'counts', counts)) as qs
    from agg group by code
  )
  select jsonb_build_object(
    'study', p_study,
    'n_sessions', (select count(*) from kept),
    'items', coalesce((select jsonb_object_agg(code, qs) from per_item), '{}'::jsonb));
$$;

-- Row-level security on and forced, with no policies: the public roles see
-- nothing. service_role bypasses RLS (it is the server's key), so it relies on
-- the privileges below.
alter table blindpanel.submissions enable row level security;
alter table blindpanel.submissions force row level security;
alter table blindpanel.settings enable row level security;
alter table blindpanel.settings force row level security;

revoke all on schema blindpanel from public, anon, authenticated;
revoke all on all tables in schema blindpanel from public, anon, authenticated, service_role;
revoke all on all sequences in schema blindpanel from public, anon, authenticated, service_role;
-- functions are executable by PUBLIC by default; take that back too
revoke execute on all functions in schema blindpanel from public, anon, authenticated, service_role;

grant usage on schema blindpanel to service_role;
grant select, insert on blindpanel.submissions to service_role;
grant execute on function blindpanel.tally(text, integer) to service_role;

notify pgrst, 'reload schema';
