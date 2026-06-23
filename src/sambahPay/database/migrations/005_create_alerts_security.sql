create table if not exists machine_alerts (
  id text primary key,
  device_id text,
  release_token_id text,
  severity text not null,
  type text not null,
  message text,
  status text not null default 'open',
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists security_incidents (
  id text primary key,
  source text not null,
  module text not null,
  event_type text not null,
  severity text not null,
  status text not null,
  correlation_id text not null,
  causation_id text,
  device_id text,
  zone_id text,
  customer_id text,
  payment_id text,
  pickup_session_id text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  recommended_action text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create table if not exists security_actions (
  id text primary key,
  incident_id text not null,
  action text not null,
  status text,
  actor text,
  note text,
  mocked boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_machine_alerts_type on machine_alerts(type);
create index if not exists idx_machine_alerts_status on machine_alerts(status);
create index if not exists idx_machine_alerts_severity on machine_alerts(severity);
create index if not exists idx_security_incidents_event_type on security_incidents(event_type);
create index if not exists idx_security_incidents_severity on security_incidents(severity);
create index if not exists idx_security_incidents_status on security_incidents(status);
create index if not exists idx_security_incidents_correlation_id on security_incidents(correlation_id);
create index if not exists idx_security_incidents_causation_id on security_incidents(causation_id);
create index if not exists idx_security_incidents_created_at on security_incidents(created_at);
create index if not exists idx_security_actions_incident_id on security_actions(incident_id);
