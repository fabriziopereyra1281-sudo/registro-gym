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

-- Objetivos diarios de nutricion (una fila por usuario, se actualiza in place).
create table if not exists nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  calories int,
  protein numeric,
  carbs numeric,
  fat numeric,
  updated_at timestamptz default now()
);

-- Datos para estimar % de grasa corporal (metodo US Navy) y la meta fisica:
-- altura y contorno de cuello (fijos, se cargan una vez) mas el rango de
-- grasa corporal objetivo que el usuario quiere alcanzar.
alter table nutrition_targets add column if not exists height_cm numeric;
alter table nutrition_targets add column if not exists neck_cm numeric;
alter table nutrition_targets add column if not exists target_bf_low numeric;
alter table nutrition_targets add column if not exists target_bf_high numeric;

-- Datos para el calculo de gasto calorico por formula de Mifflin-St Jeor
-- (BMR real segun peso/altura/edad/sexo, en vez de la regla practica de
-- 33 kcal/kg). Opcionales: sin esto, el calculo automatico de objetivos
-- sigue funcionando con la regla practica de antes.
alter table nutrition_targets add column if not exists age int;
alter table nutrition_targets add column if not exists sex text;
alter table nutrition_targets add column if not exists activity_level text;

-- Comidas registradas, con sus macros. meal_type es texto libre (desayuno,
-- almuerzo, merienda, cena, pre-entreno, post-entreno, otro) para no atarse
-- a un enum rigido.
create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  meal_type text,
  name text not null,
  calories int,
  protein numeric,
  carbs numeric,
  fat numeric,
  notes text,
  created_at timestamptz default now()
);

-- Fotos de progreso: cada fila referencia un archivo en el bucket de Storage
-- "progress-photos" (privado). weight/waist quedan pegados a la foto para
-- poder mostrar el numero de ese dia sin ir a buscarlo a otra tabla.
create table if not exists progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  storage_path text not null,
  weight numeric,
  waist numeric,
  notes text,
  created_at timestamptz default now()
);

-- Catalogo de suplementos que toma el usuario: nombre, dosis y horario
-- habitual en texto libre (ej. "Mañana", "Post-entreno").
create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  dose text,
  timing text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Marca de "tomado" por dia: una fila por suplemento y dia en que se tomo.
-- Tomar/destomar hoy es simplemente insertar o borrar la fila del dia.
create table if not exists supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  supplement_id uuid references supplements on delete cascade not null,
  date date not null,
  created_at timestamptz default now(),
  unique (supplement_id, date)
);

alter table configs enable row level security;
alter table workout_logs enable row level security;
alter table bodyweight_logs enable row level security;
alter table activity_logs enable row level security;
alter table daily_checkins enable row level security;
alter table nutrition_targets enable row level security;
alter table meal_logs enable row level security;
alter table progress_photos enable row level security;
alter table supplements enable row level security;
alter table supplement_logs enable row level security;

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

drop policy if exists "own_nutrition_targets" on nutrition_targets;
create policy "own_nutrition_targets" on nutrition_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_meal_logs" on meal_logs;
create policy "own_meal_logs" on meal_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_progress_photos" on progress_photos;
create policy "own_progress_photos" on progress_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bucket privado para las fotos en si (los archivos, no las filas de arriba).
-- No es publico: cada foto se lee con una URL firmada que expira, generada
-- desde la app solo para el dueno de la cuenta.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- Cada archivo se guarda como "<user_id>/archivo.jpg": estas policies
-- restringen el bucket a que cada usuario solo pueda tocar su propia carpeta.
drop policy if exists "own_progress_photos_select" on storage.objects;
create policy "own_progress_photos_select" on storage.objects
  for select using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_progress_photos_insert" on storage.objects;
create policy "own_progress_photos_insert" on storage.objects
  for insert with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_progress_photos_delete" on storage.objects;
create policy "own_progress_photos_delete" on storage.objects
  for delete using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_supplements" on supplements;
create policy "own_supplements" on supplements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_supplement_logs" on supplement_logs;
create policy "own_supplement_logs" on supplement_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Nota semanal del Coach generada por IA: la escribe la funcion programada de
-- Netlify (con la service role key, que no pasa por RLS) y la lee la app
-- normalmente con la clave anonima + RLS, igual que el resto de las tablas.
-- Una fila por usuario y semana (unique) para que volver a correr la funcion
-- la misma semana actualice la nota en vez de duplicarla.
create table if not exists coach_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  week_start date not null,
  tone text,
  text text not null,
  model text,
  created_at timestamptz default now(),
  unique (user_id, week_start)
);

alter table coach_notes enable row level security;

drop policy if exists "own_coach_notes" on coach_notes;
create policy "own_coach_notes" on coach_notes
  for select using (auth.uid() = user_id);

-- Sugerencia del dia generada por IA a demanda (boton "¿Como va mi dia?" en
-- Nutricion, ver /api/daily-suggestion.js) -- a diferencia de coach_notes,
-- esta la escribe el propio navegador del usuario con su clave anonima (no
-- hay cron ni service role de por medio), por eso la policy permite
-- insert/update ademas de select. meals_hash guarda un hash de las comidas
-- de hoy usadas para generarla, asi la app sabe si hay que volver a llamar
-- a la IA o si alcanza con mostrar lo ya guardado (no gastar cupo gratis de
-- mas si no cambio nada desde la ultima vez). Una fila por usuario y dia.
create table if not exists daily_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  date date not null,
  meals_hash text not null,
  text text not null,
  model text,
  created_at timestamptz default now(),
  unique (user_id, date)
);

alter table daily_suggestions enable row level security;

drop policy if exists "own_daily_suggestions" on daily_suggestions;
create policy "own_daily_suggestions" on daily_suggestions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
