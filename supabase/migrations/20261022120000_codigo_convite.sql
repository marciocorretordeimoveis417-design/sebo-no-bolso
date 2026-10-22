alter table public.sebos add column if not exists codigo_convite text;

create unique index if not exists sebos_codigo_convite_key
  on public.sebos (codigo_convite)
  where codigo_convite is not null;
