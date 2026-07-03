create table if not exists operational_alerts (
  id text primary key,
  type text not null,
  severity text not null,
  message text,
  event_id text,
  correlation_id text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create table if not exists traces (
  id text primary key,
  event_id text,
  correlation_id text not null,
  causation_id text,
  stage text not null,
  context jsonb not null default '{}'::jsonb,
  timestamp timestamptz not null default now()
);

create table if not exists metrics_snapshots (
  id text primary key,
  key text not null,
  value numeric(14,4),
  dimensions jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists idx_operational_alerts_type on operational_alerts(type);
create index if not exists idx_operational_alerts_severity on operational_alerts(severity);
create index if not exists idx_operational_alerts_status on operational_alerts(status);
create index if not exists idx_operational_alerts_correlation_id on operational_alerts(correlation_id);
create index if not exists idx_traces_correlation_id on traces(correlation_id);
create index if not exists idx_traces_causation_id on traces(causation_id);
create index if not exists idx_traces_timestamp on traces(timestamp);
create index if not exists idx_metrics_snapshots_key on metrics_snapshots(key);
create index if not exists idx_metrics_snapshots_captured_at on metrics_snapshots(captured_at);
