create table if not exists payments (
  id text primary key,
  amount numeric(12,2) not null default 0,
  currency text not null default 'BRL',
  status text not null,
  channel text,
  source text,
  customer_id text,
  operator_id text,
  provider text,
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallets (
  id text primary key,
  customer_id text not null,
  status text not null default 'active',
  balance numeric(12,2) not null default 0,
  currency text not null default 'BRL',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallet_movements (
  id text primary key,
  wallet_id text not null,
  customer_id text not null,
  type text not null,
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  reference_type text,
  reference_id text,
  operator_id text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_status on payments(status);
create index if not exists idx_payments_customer_id on payments(customer_id);
create index if not exists idx_payments_created_at on payments(created_at);
create index if not exists idx_wallets_customer_id on wallets(customer_id);
create index if not exists idx_wallet_movements_wallet_id on wallet_movements(wallet_id);
create index if not exists idx_wallet_movements_created_at on wallet_movements(created_at);
