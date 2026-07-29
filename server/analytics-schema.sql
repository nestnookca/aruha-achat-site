-- Analytics schema for ארוחה אחת
-- How to use: open your Supabase project -> SQL Editor -> New query,
-- paste this whole file, and click Run. Safe to run once.

create table if not exists analytics_events (
  id bigserial primary key,
  visitor_id uuid not null,          -- anonymous, client-generated, stored in localStorage (not tied to any personal identity)
  session_id uuid not null,          -- regenerated each browser session, lets us distinguish "visits" from "unique visitors"
  event_type text not null check (event_type in ('pageview', 'click', 'conversion')),
  event_name text,                   -- e.g. 'donate_hero_button', 'impact_cta_120', 'donation_success'
  page_path text not null,           -- e.g. '/index.html', '/donate.html'
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  device_type text,                  -- 'mobile' | 'tablet' | 'desktop'
  browser text,                      -- 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'Other'
  country text,                      -- 2-letter code, resolved server-side from the request IP; the IP itself is never stored
  amount numeric,                    -- donation amount, only set on 'conversion' events
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_created_at on analytics_events (created_at);
create index if not exists idx_analytics_visitor_id on analytics_events (visitor_id);
create index if not exists idx_analytics_event_type on analytics_events (event_type);
create index if not exists idx_analytics_utm_source on analytics_events (utm_source);

alter table analytics_events enable row level security;

-- Only the server's service_role key can write (it bypasses RLS by design,
-- so no INSERT policy is needed for it — and none exists for anon/authenticated,
-- which means the public frontend can never write directly to this table).

-- Only someone logged in through Supabase Auth (i.e. you, on the dashboard)
-- can read the data.
create policy "Allow authenticated read access"
  on analytics_events for select
  using (auth.role() = 'authenticated');
