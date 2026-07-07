-- Customer Review & Feedback Insight Miner schema.
-- Additive only. Stores raw post-order / imported review text, plus the
-- weekly LLM-mined insight snapshots the admin dashboard reads.

create table order_feedback (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  rating int check (rating between 1 and 5),
  comment text,
  source text not null default 'post_order' check (source in ('post_order', 'google')),
  created_at timestamptz not null default now(),
  -- A row is only useful if it carries a rating or a comment.
  check (rating is not null or (comment is not null and length(btrim(comment)) > 0))
);

create table feedback_insights (
  id uuid primary key default gen_random_uuid(),
  window_start timestamptz,
  window_end timestamptz,
  feedback_count int not null default 0,
  avg_rating numeric(3,2),
  summary text not null,
  themes jsonb not null default '[]',        -- [{ label, count, sentiment }]
  top_issues jsonb not null default '[]',     -- [{ category, issue, severity, evidence_count }]
  suggestions jsonb not null default '[]',    -- [{ action, rationale }]
  source text not null default 'fallback' check (source in ('openrouter', 'fallback')),
  model text,
  generated_at timestamptz not null default now()
);

create index order_feedback_created_idx on order_feedback(created_at desc);
create index order_feedback_source_idx on order_feedback(source);
create index feedback_insights_generated_idx on feedback_insights(generated_at desc);

alter table order_feedback enable row level security;
alter table feedback_insights enable row level security;

-- Staff (authenticated) can read both; writes only ever happen server-side
-- through the service-role key, so no anon/insert policies are exposed.
create policy "staff read order_feedback" on order_feedback
  for select to authenticated using (true);
create policy "staff read feedback_insights" on feedback_insights
  for select to authenticated using (true);

grant select on order_feedback, feedback_insights to authenticated;
grant all on order_feedback, feedback_insights to service_role;

alter publication supabase_realtime add table order_feedback;
alter publication supabase_realtime add table feedback_insights;
