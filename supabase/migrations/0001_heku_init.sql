create table public.characters (
  user_id text primary key check (user_id ~ '^(w:0x[0-9a-f]{40}|g:[0-9a-f]{12})$'),
  callsign text not null check (callsign ~ '^[A-Za-z0-9_\- ]{3,16}$'),
  chassis text not null check (chassis in ('astronautA','astronautB')),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index characters_callsign_lower on public.characters (lower(callsign));
alter table public.characters enable row level security;
create policy "characters are publicly readable" on public.characters for select to anon, authenticated using (true);
create table public.auth_nonces (address text primary key, nonce text not null, expires_at timestamptz not null);
alter table public.auth_nonces enable row level security;   -- service role only (no policies, intentional)
create table public.app_secrets (k text primary key, v text not null);
alter table public.app_secrets enable row level security;   -- service role only (no policies, intentional)
insert into public.app_secrets (k, v) values ('session_hmac', encode(gen_random_bytes(32), 'hex'));
revoke all on public.auth_nonces, public.app_secrets from anon, authenticated;
