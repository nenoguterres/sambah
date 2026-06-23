create table if not exists lgpd_requests (
  id text primary key,
  request_type text not null,
  status text not null,
  requester text,
  customer_id text,
  reason text,
  channel text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create table if not exists critical_logs (
  id text primary key,
  source text not null,
  domain text not null,
  severity text not null,
  type text not null,
  status text,
  correlation_id text,
  causation_id text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lgpd_requests_status on lgpd_requests(status);
create index if not exists idx_lgpd_requests_created_at on lgpd_requests(created_at);
create index if not exists idx_critical_logs_domain on critical_logs(domain);
create index if not exists idx_critical_logs_severity on critical_logs(severity);
create index if not exists idx_critical_logs_type on critical_logs(type);
create index if not exists idx_critical_logs_correlation_id on critical_logs(correlation_id);
create index if not exists idx_critical_logs_causation_id on critical_logs(causation_id);
create index if not exists idx_critical_logs_created_at on critical_logs(created_at);
