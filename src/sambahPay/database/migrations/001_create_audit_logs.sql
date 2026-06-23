create table if not exists audit_logs (
  id uuid primary key,
  type text not null,
  status text not null,
  source text not null,
  message text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_type on audit_logs(type);
create index if not exists idx_audit_logs_status on audit_logs(status);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at);

-- Futuro: avaliar particionamento mensal por created_at para crescimento de auditoria.
