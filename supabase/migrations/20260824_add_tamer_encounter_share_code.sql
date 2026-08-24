create extension if not exists pgcrypto;

alter table public.player_tamers
  add column if not exists encounter_share_code text;

update public.player_tamers
set encounter_share_code = encode(gen_random_bytes(18), 'hex')
where encounter_share_code is null;

alter table public.player_tamers
  alter column encounter_share_code set default encode(gen_random_bytes(18), 'hex'),
  alter column encounter_share_code set not null;

create unique index if not exists player_tamers_encounter_share_code_key
  on public.player_tamers (encounter_share_code);

