create table if not exists devices (
  id text primary key,
  name text not null,
  type text not null,
  location text,
  status text not null default 'offline',
  control_mode text,
  metadata jsonb not null default '{}'::jsonb,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists locker_zones (
  id text primary key,
  zone_id text not null,
  device_id text,
  product_id text,
  status text not null,
  door_status text,
  stock_quantity integer not null default 0,
  expected_unit_weight numeric(12,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists secure_pickup_sessions (
  id text primary key,
  payment_id text,
  order_id text,
  customer_id text,
  device_id text,
  status text not null,
  pin_hash text,
  pin_expires_at timestamptz,
  correlation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists secure_pickup_items (
  id text primary key,
  pickup_session_id text not null,
  product_id text,
  zone_id text,
  quantity numeric(12,3),
  status text not null,
  expected_weight numeric(12,3),
  actual_weight numeric(12,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_devices_type on devices(type);
create index if not exists idx_devices_status on devices(status);
create index if not exists idx_locker_zones_device_id on locker_zones(device_id);
create index if not exists idx_locker_zones_status on locker_zones(status);
create index if not exists idx_secure_pickup_sessions_status on secure_pickup_sessions(status);
create index if not exists idx_secure_pickup_sessions_correlation_id on secure_pickup_sessions(correlation_id);
create index if not exists idx_secure_pickup_items_session_id on secure_pickup_items(pickup_session_id);
create index if not exists idx_secure_pickup_items_status on secure_pickup_items(status);
