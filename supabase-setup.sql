-- Ejecutar esto en Supabase: Editor SQL -> pegar todo -> Run

create table configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  config jsonb not null,
  updated_at timestamptz default now()
);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  day text,
  exercise_id text,
  exercise_name text,
  unilateral boolean default false,
  weight numeric,
  reps int,
  weight_r numeric,
  reps_r int,
  weight_l numeric,
  reps_l int,
  created_at timestamptz default now()
);

create table bodyweight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  weight numeric,
  waist numeric,
  created_at timestamptz default now()
);

alter table configs enable row level security;
alter table workout_logs enable row level security;
alter table bodyweight_logs enable row level security;

create policy "own_configs" on configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_workout_logs" on workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_bodyweight_logs" on bodyweight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
