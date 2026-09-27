-- Ejecutar esto en Supabase: Editor SQL -> pegar todo -> Run
-- Es seguro volver a correr este archivo entero mas adelante (usa IF NOT EXISTS):
-- las tablas y columnas nuevas se agregan sin tocar los datos que ya tengas.

create table if not exists configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  config jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists workout_logs (
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

-- RIR (repeticiones en reserva) del set: cuanto le quedaba en el tanque.
alter table workout_logs add column if not exists rir int;

create table if not exists bodyweight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  weight numeric,
  waist numeric,
  created_at timestamptz default now()
);

-- Actividades libres fuera del split de pesas: boxeo, krav maga, cardio suelto, etc.
-- used_watch marca si la duracion/intensidad viene del reloj (FC real) o es estimada
-- a mano (RPE), asi el motor de decisiones puede tratarlas distinto.
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  name text not null,
  duration_min int,
  intensity_rpe int,
  used_watch boolean default false,
  avg_hr int,
  notes text,
  created_at timestamptz default now()
);

-- Chequeo diario: energia, fatiga muscular y dolor por zona (0-10 cada una).
-- Una sola fila por dia por usuario (unique), para poder actualizarla si se
-- carga mas de una vez el mismo dia.
create table if not exists daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  energy int,
  soreness int,
  pain jsonb default '{}'::jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, date)
);

alter table configs enable row level security;
alter table workout_logs enable row level security;
alter table bodyweight_logs enable row level security;
alter table activity_logs enable row level security;
alter table daily_checkins enable row level security;

drop policy if exists "own_configs" on configs;
create policy "own_configs" on configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_workout_logs" on workout_logs;
create policy "own_workout_logs" on workout_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_bodyweight_logs" on bodyweight_logs;
create policy "own_bodyweight_logs" on bodyweight_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_activity_logs" on activity_logs;
create policy "own_activity_logs" on activity_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_daily_checkins" on daily_checkins;
create policy "own_daily_checkins" on daily_checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
