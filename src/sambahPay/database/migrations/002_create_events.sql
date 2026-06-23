create table if not exists events (
  id text primary key,
  type text not null,
  source text not null,
  aggregate_type text,
  aggregate_id text,
  correlation_id text not null,
  causation_id text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists event_outbox (
  id text primary key,
  event_id text not null,
  type text not null,
  correlation_id text not null,
  causation_id text,
  status text not null default 'pending',
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists event_dead_letter (
  id text primary key,
  event_id text not null,
  type text not null,
  correlation_id text not null,
  causation_id text,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_events_type on events(type);
create index if not exists idx_events_status on events(status);
create index if not exists idx_events_correlation_id on events(correlation_id);
create index if not exists idx_events_causation_id on events(causation_id);
create index if not exists idx_events_created_at on events(created_at);
create index if not exists idx_event_outbox_status on event_outbox(status);
create index if not exists idx_event_outbox_correlation_id on event_outbox(correlation_id);
create index if not exists idx_event_dead_letter_type on event_dead_letter(type);
create index if not exists idx_event_dead_letter_correlation_id on event_dead_letter(correlation_id);

-- Futuro: avaliar particionamento mensal de events e event_outbox por created_at.
