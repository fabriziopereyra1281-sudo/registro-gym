// Coach semanal automático. No lo dispara nadie abriendo la app: la llama un
// cron externo gratuito (ver instrucciones en el PR) una vez por semana, vía
// HTTP GET con una clave secreta. Por cada usuario: junta los últimos 14 días
// desde Supabase, arma el mismo resumen que ya calcula computeCoach() en
// App.jsx, le pide a una IA gratuita una lectura con criterio en vez de solo
// "subió/bajó", y la guarda en coach_notes para que la app la muestre. Si
// TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID están configurados, también la manda
// por Telegram — si no están, no hace nada ahí (opcional).
//
// Proveedor de IA: Gemini como principal, GLM (Zhipu/z.ai) como respaldo si
// Gemini falla o se quedó sin cupo gratis ese día — las dos tienen capa
// gratuita real. La cadena de fallback (generateNote, en ./_ai-providers.js)
// es compartida con /api/daily-suggestion.js, así que agregar un proveedor
// nuevo ahí alcanza para que lo usen las dos funciones.
//
// Aviso: los nombres de modelo gratuitos y sus límites cambian seguido en
// ambos proveedores. GEMINI_MODEL y ZAI_MODEL son variables de entorno
// justamente para poder ajustarlos sin tocar código si el que viene por
// default deja de ser gratis — confirmá el estado actual en Google AI Studio
// y en el panel de z.ai antes de depender de esto a largo plazo.
//
// Vercel detecta sola cualquier archivo bajo /api como funcion serverless,
// accesible en /api/coach-weekly — no hace falta declararla en ningun lado.
// Es una funcion HTTP comun (no usa el sistema de Cron Jobs propio de Vercel)
// por la misma razon que en la version anterior para Netlify: no se pudo
// verificar su sintaxis exacta sin acceso a la documentacion en vivo desde
// este entorno. El cron vive afuera, apuntando a esta URL.
//
// Por que pide clave: sin ella, cualquiera que encuentre la URL podria
// disparar llamadas a la IA a tu costa (aunque sea gratis, sigue consumiendo
// tu cupo). Sin COACH_CRON_SECRET configurada, la funcion se niega a correr
// (ver chequeo mas abajo).
//
// Variables de entorno que necesita (Vercel → Project Settings → Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  (obligatoria — NUNCA la anon key; esta sí
//     puede leer y escribir cualquier usuario, por eso nunca va en el
//     navegador, solo acá)
//   SUPABASE_URL               (si no está, usa VITE_SUPABASE_URL — ya la
//     tenés configurada, no hace falta duplicarla)
//   GEMINI_API_KEY             (clave gratuita de Google AI Studio —
//     aistudio.google.com/apikey. Al menos una de GEMINI_API_KEY/ZAI_API_KEY
//     tiene que estar cargada)
//   GEMINI_MODEL               (opcional — por defecto gemini-flash-latest)
//   ZAI_API_KEY                (clave gratuita de z.ai — usada como respaldo
//     si falla Gemini, o como única IA si no cargás GEMINI_API_KEY)
//   ZAI_MODEL                  (opcional — por defecto glm-4.5-flash)
//   COACH_CRON_SECRET          (obligatoria — clave que vos inventás; el
//     cron externo la manda como ?key=... en la URL)
//   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID  (opcionales, los dos juntos)

import { createClient } from "@supabase/supabase-js";
import { generateNote } from "./_ai-providers.js";

// ---------------------------------------------------------------------------
// Helpers de fecha — mismo criterio que App.jsx (ventanas en UTC: a nivel
// semanal un dia de diferencia por huso horario no cambia el resultado).
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function daysAgoISO(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
export function weekStartISO() {
  // Lunes de la semana actual (UTC) — clave de coach_notes.unique(user_id, week_start).
  const d = new Date();
  const day = d.getUTCDay(); // 0 = domingo
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
export function avg(arr) {
  const vals = arr.filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
export function inWindow(dateISO, fromISO, toISOEnd) {
  return dateISO >= fromISO && dateISO <= toISOEnd;
}
export function round(n, d = 1) {
  if (n == null) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Los mismos bloques que arma computeCoach() en App.jsx, pero como datos
// planos para mandarle a la IA — la nota tiene que hablar de los mismos
// números que ya ve el usuario en "Panel de control", no de otra cosa.
export function buildWeeklySummary({ bwLogs, logs, activityLogs, checkins, mealLogs, targets, supplements, supplementLogs }) {
  const today = todayISO();
  const w1Start = daysAgoISO(6);
  const w2Start = daysAgoISO(13);
  const w2End = daysAgoISO(7);

  const thisWeekBw = bwLogs.filter((b) => inWindow(b.date, w1Start, today));
  const prevWeekBw = bwLogs.filter((b) => inWindow(b.date, w2Start, w2End));
  const weightNow = avg(thisWeekBw.map((b) => b.weight));
  const weightPrev = avg(prevWeekBw.map((b) => b.weight));
  const waistNow = avg(thisWeekBw.map((b) => b.waist));
  const waistPrev = avg(prevWeekBw.map((b) => b.waist));

  const thisWeekSets = logs.filter((l) => inWindow(l.date, w1Start, today));
  const prevWeekSets = logs.filter((l) => inWindow(l.date, w2Start, w2End));
  const rirNow = avg(thisWeekSets.map((l) => l.rir));

  const thisWeekAct = activityLogs.filter((a) => inWindow(a.date, w1Start, today));
  const prevWeekAct = activityLogs.filter((a) => inWindow(a.date, w2Start, w2End));
  const minutesNow = thisWeekAct.reduce((s, a) => s + (a.duration_min || 0), 0);
  const minutesPrev = prevWeekAct.reduce((s, a) => s + (a.duration_min || 0), 0);

  const thisWeekChk = checkins.filter((c) => inWindow(c.date, w1Start, today));
  const energyNow = avg(thisWeekChk.map((c) => c.energy));
  const sorenessNow = avg(thisWeekChk.map((c) => c.soreness));
  const painFlags = thisWeekChk.flatMap((c) => Object.entries(c.pain || {}).filter(([, v]) => v >= 6));

  const thisWeekMeals = mealLogs.filter((m) => inWindow(m.date, w1Start, today));
  const mealDays = Array.from(new Set(thisWeekMeals.map((m) => m.date)));
  const caloriesAvg = avg(mealDays.map((d) => thisWeekMeals.filter((m) => m.date === d).reduce((s, m) => s + (m.calories || 0), 0)));

  const activeSupplementIds = (supplements || []).filter((s) => s.active).map((s) => s.id);
  const takenThisWeek = (supplementLogs || []).filter(
    (l) => activeSupplementIds.includes(l.supplement_id) && inWindow(l.date, w1Start, today)
  ).length;

  return {
    peso_kg: { esta_semana: round(weightNow, 2), semana_anterior: round(weightPrev, 2) },
    cintura_cm: { esta_semana: round(waistNow, 2), semana_anterior: round(waistPrev, 2) },
    entrenamiento: { sets_esta_semana: thisWeekSets.length, sets_semana_anterior: prevWeekSets.length, rir_promedio: round(rirNow, 1) },
    actividad_extra_minutos: { esta_semana: minutesNow, semana_anterior: minutesPrev },
    recuperacion: {
      energia_promedio_0a5: round(energyNow, 1),
      fatiga_promedio_0a5: round(sorenessNow, 1),
      chequeos_con_dolor_alto: painFlags.length,
    },
    nutricion: {
      dias_con_comidas_registradas: mealDays.length,
      calorias_promedio: caloriesAvg != null ? Math.round(caloriesAvg) : null,
      objetivo_calorias: targets?.calories ?? null,
    },
    suplementos: {
      tomas_esta_semana: takenThisWeek,
      tomas_posibles: activeSupplementIds.length * 7,
      cantidad_activos: activeSupplementIds.length,
    },
  };
}

export function hasAnyRealData(summary) {
  return Object.values(summary).some((group) => Object.values(group).some((v) => v != null && v !== 0));
}

const SYSTEM_PROMPT = `Sos el coach personal de un usuario de gimnasio que entrena fuerza y cuida su nutrición. Cada domingo recibís un resumen de su semana (datos ya calculados, en JSON) y escribís una nota breve para el lunes.

Reglas:
- Español rioplatense, tono cercano y directo, sin vueltas.
- Entre 100 y 180 palabras, en prosa corrida (sin viñetas ni títulos).
- Usá solo los números que te paso — no inventes datos que no están.
- Si un dato falta (null o en cero), no lo trates como un problema de rendimiento — es que falta el registro, señalalo como tal si es relevante.
- Cerrá siempre con UNA sola prioridad concreta para la semana que arranca, en una frase.
- No repitas el formato "esto subió, esto bajó" tal cual — eso ya lo ve en la app arriba de tu nota. Dale una lectura con criterio: qué es lo que importa de verdad esta semana y por qué.`;

async function writeWeeklyNote({ supabase, geminiKey, geminiModel, zaiKey, zaiModel, userId }) {
  const from = daysAgoISO(13);

  const [bw, logs, activity, checkins, meals, targetsRes, supplements, supplementLogs] = await Promise.all([
    supabase.from("bodyweight_logs").select("date, weight, waist").eq("user_id", userId).gte("date", from),
    supabase.from("workout_logs").select("date, rir").eq("user_id", userId).gte("date", from),
    supabase.from("activity_logs").select("date, duration_min").eq("user_id", userId).gte("date", from),
    supabase.from("daily_checkins").select("date, energy, soreness, pain").eq("user_id", userId).gte("date", from),
    supabase.from("meal_logs").select("date, calories").eq("user_id", userId).gte("date", from),
    supabase.from("nutrition_targets").select("calories").eq("user_id", userId).maybeSingle(),
    supabase.from("supplements").select("id, active").eq("user_id", userId),
    supabase.from("supplement_logs").select("supplement_id, date").eq("user_id", userId).gte("date", from),
  ]);

  const summary = buildWeeklySummary({
    bwLogs: bw.data || [],
    logs: logs.data || [],
    activityLogs: activity.data || [],
    checkins: checkins.data || [],
    mealLogs: meals.data || [],
    targets: targetsRes.data || {},
    supplements: supplements.data || [],
    supplementLogs: supplementLogs.data || [],
  });

  // Sin nada cargado esta ventana no tiene sentido gastar en una nota vacia.
  if (!hasAnyRealData(summary)) return { skipped: "sin_datos" };

  const userPrompt = `Resumen de la semana (últimos 7 días vs. los 7 anteriores):\n\n${JSON.stringify(summary, null, 2)}`;
  const { text, provider } = await generateNote({ geminiKey, geminiModel, zaiKey, zaiModel, systemPrompt: SYSTEM_PROMPT, userPrompt });
  if (!text) return { skipped: "sin_respuesta" };

  const { error } = await supabase
    .from("coach_notes")
    .upsert(
      { user_id: userId, week_start: weekStartISO(), text, model: provider, tone: "ai" },
      { onConflict: "user_id,week_start" }
    );
  if (error) throw new Error(`Supabase upsert: ${error.message}`);

  return { skipped: false, text };
}

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // opcional — sin configurar, no hace nada
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `🏋️ Tu coach semanal:\n\n${text}` }),
  });
  if (!res.ok) console.error("Telegram respondió", res.status, await res.text());
}

// Firma clasica de las Serverless Functions (runtime Node) de Vercel para un
// proyecto no-Next.js: export default, (req, res) al estilo Node, con
// req.query para el query string y res.status(...).json/send(...) para
// responder. A diferencia de Netlify no hace falta envolver nada ni declarar
// la ruta en ningun archivo de configuracion.
export default async function handler(req, res) {
  const cronSecret = process.env.COACH_CRON_SECRET;
  const providedKey = req.query?.key;
  if (!cronSecret || providedKey !== cronSecret) {
    // 401 generico: no distinguir "falta configurar" de "clave incorrecta"
    // para no darle pistas a quien intente adivinar la clave desde afuera.
    res.status(401).send("No autorizado.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const zaiKey = process.env.ZAI_API_KEY;
  const zaiModel = process.env.ZAI_MODEL || "glm-4.5-flash";

  if (!supabaseUrl || !serviceKey) {
    console.error("Coach semanal: faltan variables de entorno (SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
    res.status(500).send("Faltan variables de entorno.");
    return;
  }
  if (!geminiKey && !zaiKey) {
    console.error("Coach semanal: falta al menos una clave de IA (GEMINI_API_KEY o ZAI_API_KEY).");
    res.status(500).send("Falta configurar un proveedor de IA (GEMINI_API_KEY o ZAI_API_KEY).");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: usersPage, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error("Coach semanal: no se pudo listar usuarios:", usersError.message);
    res.status(500).send(usersError.message);
    return;
  }

  const results = [];
  for (const user of usersPage.users) {
    try {
      const result = await writeWeeklyNote({ supabase, geminiKey, geminiModel, zaiKey, zaiModel, userId: user.id });
      results.push({ userId: user.id, ...result });
      if (!result.skipped) await notifyTelegram(result.text);
    } catch (err) {
      console.error(`Coach semanal: fallo para ${user.id}:`, err.message);
      results.push({ userId: user.id, error: err.message });
    }
  }

  console.log("Coach semanal:", JSON.stringify(results));
  res.status(200).json({ ok: true, processed: results.length });
}
