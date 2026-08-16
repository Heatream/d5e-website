alter table public.player_tamers
  add column if not exists money bigint not null default 0;

alter table public.player_tamers
  drop constraint if exists player_tamers_money_nonnegative;

alter table public.player_tamers
  add constraint player_tamers_money_nonnegative check (money >= 0);
