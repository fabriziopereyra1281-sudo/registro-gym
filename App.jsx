import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Dumbbell, TrendingUp, History, Plus, Trash2, ChevronDown, X, Check, Pencil, LogOut, Activity, Utensils, Sparkles,
  Camera, Bell, Pause, Play, Timer,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "./supabaseClient.js";

// ---------------------------------------------------------------------------
const DAY_ORDER = ["lun", "mar", "mie", "jue", "vie"];
const DAY_LABELS = { lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves", vie: "Viernes" };

function defaultTemplate() {
  return {
    lun: {
      focus: "Espalda y tríceps",
      note: "",
      exercises: [
        { id: uid(), name: "Dominadas (+lastre)", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Remo con barra", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Jalón al pecho", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Extensión de tríceps (polea)", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Press francés", unilateral: false, sets: "", reps: "" },
      ],
    },
    mar: {
      focus: "Pecho y bíceps",
      note: "",
      exercises: [
        { id: uid(), name: "Press de banca", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Press inclinado con mancuernas", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Aperturas con mancuernas", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Curl con barra", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Curl martillo", unilateral: false, sets: "", reps: "" },
      ],
    },
    mie: {
      focus: "Hombros y femorales",
      note: "",
      exercises: [
        { id: uid(), name: "Press militar", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Elevaciones laterales", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Peso muerto rumano", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Curl femoral acostado", unilateral: false, sets: "", reps: "" },
      ],
    },
    jue: {
      focus: "Brazos (bíceps y tríceps)",
      note: "Foco extra en el brazo derecho — trabajo unilateral",
      exercises: [
        { id: uid(), name: "Curl con mancuerna", unilateral: true, sets: "", reps: "" },
        { id: uid(), name: "Extensión de tríceps con mancuerna", unilateral: true, sets: "", reps: "" },
        { id: uid(), name: "Curl martillo", unilateral: true, sets: "", reps: "" },
        { id: uid(), name: "Press francés / fondos en banco", unilateral: false, sets: "", reps: "" },
      ],
    },
    vie: {
      focus: "Cuádriceps y pantorrilla",
      note: "",
      exercises: [
        { id: uid(), name: "Sentadilla", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Prensa", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Extensión de cuádriceps", unilateral: false, sets: "", reps: "" },
        { id: uid(), name: "Elevación de pantorrilla", unilateral: false, sets: "", reps: "" },
      ],
    },
  };
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}
function defaultDayKey() {
  const wd = new Date().getDay();
  const map = { 1: "lun", 2: "mar", 3: "mie", 4: "jue", 5: "vie" };
  return map[wd] || "lun";
}
function fmtDateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dias[dt.getDay()]} ${dt.getDate()} ${meses[dt.getMonth()]}`;
}
function fmtShort(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
// Dia de la semana (0=domingo) de una fecha "YYYY-MM-DD", en hora local --
// igual que fmtDateLabel, evita el corrimiento de dia que da parsear el ISO
// directo con new Date() (lo interpreta en UTC).
function weekdayOfISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}
// Dias enteros transcurridos desde una fecha "YYYY-MM-DD" hasta hoy, en hora
// local (mismo criterio que weekdayOfISO). Se usa para los recordatorios de
// peso/cintura/fotos: cuantos dias pasaron desde el ultimo registro.
function daysSinceISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86400000);
}
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.floor(Math.random() * 1000);
}

// Numeros con decimales: se acepta coma o punto indistintamente ("82,5" y "82.5").
function sanitizeDecimal(v) {
  let s = String(v ?? "").replace(/[^\d.,]/g, "");
  const sep = s.search(/[.,]/);
  if (sep !== -1) s = s.slice(0, sep + 1) + s.slice(sep + 1).replace(/[.,]/g, "");
  return s;
}
function sanitizeInt(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function fmtNum(n) {
  if (n === null || n === undefined || n === "") return "\u2013";
  return String(Number(n)).replace(".", ",");
}
function toInput(n) {
  if (n === null || n === undefined) return "";
  return String(n).replace(".", ",");
}
// 1RM estimado (formula de Epley): cuanto podrias levantar a 1 repeticion,
// a partir del peso y las reps de un set cualquiera. Mas comparable que el
// peso crudo cuando las reps varian de un set a otro (80kgx5 vs 85kgx3 no se
// pueden comparar directo por peso, pero si por 1RM estimado). Sin reps
// cargadas no hay forma de estimar mejor que el peso mismo, asi que cae en
// eso (no es una invencion, es simplemente no tener mas informacion).
function estimate1RM(weight, reps) {
  if (weight == null) return null;
  if (!reps || reps <= 1) return Math.round(weight * 10) / 10;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}
function targetText(ex) {
  const sets = String(ex.sets ?? "").trim();
  const reps = String(ex.reps ?? "").trim();
  if (sets && reps) return `${sets} \u00d7 ${reps}`;
  if (sets) return `${sets} series`;
  if (reps) return `${reps} reps`;
  return "";
}

function mapLogRow(row) {
  return {
    id: row.id,
    date: row.date,
    day: row.day,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    unilateral: row.unilateral,
    weight: row.weight,
    reps: row.reps,
    weightR: row.weight_r,
    repsR: row.reps_r,
    weightL: row.weight_l,
    repsL: row.reps_l,
    rir: row.rir,
  };
}
function mapBwRow(row) {
  return { id: row.id, date: row.date, weight: row.weight, waist: row.waist };
}
function mapActivityRow(row) {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    durationMin: row.duration_min,
    intensityRpe: row.intensity_rpe,
    usedWatch: row.used_watch,
    avgHr: row.avg_hr,
    notes: row.notes,
  };
}
function mapCheckinRow(row) {
  return {
    id: row.id,
    date: row.date,
    energy: row.energy,
    soreness: row.soreness,
    pain: row.pain || {},
    notes: row.notes,
  };
}
function mapTargetsRow(row) {
  if (!row) return null;
  return {
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    heightCm: row.height_cm,
    neckCm: row.neck_cm,
    targetBfLow: row.target_bf_low,
    targetBfHigh: row.target_bf_high,
  };
}
function mapSupplementRow(row) {
  return { id: row.id, name: row.name, dose: row.dose, timing: row.timing, active: row.active };
}
function mapSupplementLogRow(row) {
  return { id: row.id, supplementId: row.supplement_id, date: row.date };
}
function mapCoachNoteRow(row) {
  if (!row) return null;
  return { id: row.id, weekStart: row.week_start, text: row.text, model: row.model, createdAt: row.created_at };
}
function mapPhotoRow(row) {
  return {
    id: row.id,
    date: row.date,
    storagePath: row.storage_path,
    weight: row.weight,
    waist: row.waist,
    notes: row.notes,
  };
}
function mapMealRow(row) {
  return {
    id: row.id,
    date: row.date,
    mealType: row.meal_type,
    name: row.name,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    notes: row.notes,
  };
}

const MEAL_TYPES = ["Desayuno", "Almuerzo", "Merienda", "Cena", "Pre-entreno", "Post-entreno", "Otro"];

// Base de alimentos comunes y faciles de conseguir, con sus macros. "unit"
// marca si la cantidad se carga por porcion habitual (ej: 1 huevo, 1 scoop)
// en vez de por gramos -- en ese caso kcal/protein/carbs/fat ya son los de
// UNA de esas porciones, no de 100g. Es lo que permite calcular solo, sin
// que el usuario tenga que saber cuanta proteina tiene nada.
const FOOD_DB = [
  { id: "pollo", name: "Pechuga de pollo", cat: "Proteínas", unit: false, kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: "carne_magra", name: "Carne magra (nalga/lomo)", cat: "Proteínas", unit: false, kcal: 190, protein: 29, carbs: 0, fat: 8 },
  { id: "carne_picada", name: "Carne picada magra", cat: "Proteínas", unit: false, kcal: 210, protein: 26, carbs: 0, fat: 11 },
  { id: "asado", name: "Asado / carne vacuna a la parrilla", cat: "Proteínas", unit: false, kcal: 250, protein: 26, carbs: 0, fat: 16 },
  { id: "cerdo", name: "Bife de cerdo", cat: "Proteínas", unit: false, kcal: 210, protein: 26, carbs: 0, fat: 11 },
  { id: "huevo", name: "Huevo entero", cat: "Proteínas", unit: true, unitWord: "unidad", unitWordPlural: "unidades", kcal: 70, protein: 6, carbs: 0.5, fat: 5 },
  { id: "clara_huevo", name: "Clara de huevo", cat: "Proteínas", unit: true, unitWord: "unidad", unitWordPlural: "unidades", kcal: 17, protein: 3.6, carbs: 0.2, fat: 0.1 },
  { id: "atun", name: "Atún al natural", cat: "Proteínas", unit: false, kcal: 116, protein: 26, carbs: 0, fat: 1 },
  { id: "pescado", name: "Merluza / pescado blanco", cat: "Proteínas", unit: false, kcal: 90, protein: 19, carbs: 0, fat: 1 },
  { id: "yogur_griego", name: "Yogur griego natural", cat: "Proteínas", unit: false, kcal: 65, protein: 10, carbs: 4, fat: 2 },
  { id: "queso_cottage", name: "Queso cottage / fresco", cat: "Proteínas", unit: false, kcal: 98, protein: 11, carbs: 3, fat: 4 },
  { id: "queso_blanco_0", name: "Queso blanco descremado (0% grasa)", cat: "Proteínas", unit: true, unitWord: "cucharada", unitWordPlural: "cucharadas", kcal: 7, protein: 1.2, carbs: 0.6, fat: 0 },
  { id: "whey", name: "Whey proteína", cat: "Proteínas", unit: true, unitWord: "scoop", unitWordPlural: "scoops", kcal: 120, protein: 24, carbs: 3, fat: 1 },
  { id: "arroz", name: "Arroz blanco cocido", cat: "Carbohidratos", unit: false, kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: "avena", name: "Avena", cat: "Carbohidratos", unit: true, unitWord: "porción de 40 g", unitWordPlural: "porciones de 40 g", kcal: 150, protein: 5, carbs: 27, fat: 3 },
  { id: "papa", name: "Papa cocida", cat: "Carbohidratos", unit: false, kcal: 87, protein: 2, carbs: 20, fat: 0 },
  { id: "batata", name: "Batata cocida", cat: "Carbohidratos", unit: false, kcal: 86, protein: 1.6, carbs: 20, fat: 0.1 },
  { id: "pan_integral", name: "Pan integral", cat: "Carbohidratos", unit: true, unitWord: "rebanada", unitWordPlural: "rebanadas", kcal: 75, protein: 3, carbs: 13, fat: 1 },
  { id: "pan_lactal", name: "Pan lactal blanco", cat: "Carbohidratos", unit: true, unitWord: "rebanada", unitWordPlural: "rebanadas", kcal: 65, protein: 2, carbs: 12, fat: 1 },
  { id: "fideos", name: "Fideos cocidos", cat: "Carbohidratos", unit: false, kcal: 158, protein: 5.8, carbs: 31, fat: 0.9 },
  { id: "galleta_arroz", name: "Galleta de arroz", cat: "Carbohidratos", unit: true, unitWord: "unidad", unitWordPlural: "unidades", kcal: 35, protein: 0.7, carbs: 7.5, fat: 0.3 },
  { id: "banana", name: "Banana", cat: "Carbohidratos", unit: true, unitWord: "unidad", unitWordPlural: "unidades", kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { id: "manzana", name: "Manzana", cat: "Carbohidratos", unit: true, unitWord: "unidad", unitWordPlural: "unidades", kcal: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  { id: "aceite_oliva", name: "Aceite de oliva", cat: "Grasas", unit: true, unitWord: "cucharada", unitWordPlural: "cucharadas", kcal: 120, protein: 0, carbs: 0, fat: 14 },
  { id: "palta", name: "Palta", cat: "Grasas", unit: true, unitWord: "mitad", unitWordPlural: "mitades", kcal: 160, protein: 2, carbs: 8.5, fat: 15 },
  { id: "almendras", name: "Almendras / nueces", cat: "Grasas", unit: true, unitWord: "puñado de 20 g", unitWordPlural: "puñados de 20 g", kcal: 120, protein: 4, carbs: 4, fat: 11 },
  { id: "mani", name: "Manteca de maní", cat: "Grasas", unit: true, unitWord: "cucharada", unitWordPlural: "cucharadas", kcal: 95, protein: 4, carbs: 3, fat: 8 },
  { id: "zanahoria", name: "Zanahoria cocida", cat: "Verduras", unit: false, kcal: 35, protein: 0.8, carbs: 8, fat: 0.2 },
  { id: "zapallo_anco", name: "Zapallo (anco / brasilero) cocido", cat: "Verduras", unit: false, kcal: 40, protein: 1, carbs: 10, fat: 0.1 },
  { id: "zapallo_verde", name: "Zapallo verde / zapallito cocido", cat: "Verduras", unit: false, kcal: 20, protein: 1.2, carbs: 3.5, fat: 0.3 },
  { id: "verduras_mixtas", name: "Verduras mixtas / ensalada", cat: "Verduras", unit: false, kcal: 22, protein: 1, carbs: 4, fat: 0.2 },
  { id: "brocoli", name: "Brócoli cocido", cat: "Verduras", unit: false, kcal: 35, protein: 2.4, carbs: 7, fat: 0.4 },
  { id: "espinaca", name: "Espinaca cocida", cat: "Verduras", unit: false, kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
];

function computeFoodMacros(foodId, qty) {
  const food = FOOD_DB.find((f) => f.id === foodId);
  if (!food || !qty || qty <= 0) return null;
  const factor = food.unit ? qty : qty / 100;
  return {
    kcal: Math.round(food.kcal * factor),
    protein: Number((food.protein * factor).toFixed(1)),
    carbs: Number((food.carbs * factor).toFixed(1)),
    fat: Number((food.fat * factor).toFixed(1)),
  };
}

// Banco curado de combinaciones comida casera argentina, sin IA: para cada
// proteina (de las que tiene sentido elegir "tengo esto en la heladera"),
// una lista de platos concretos con su carbohidrato y verdura. No inventa
// recetas nuevas ni interpreta texto libre -- es una lista fija que se
// filtra por lo que el usuario tilda. Portion por defecto para estimar
// macros: 150g de proteina, 150g de carbohidrato cocido, 100g de verdura.
const MEAL_COMBO_PORTIONS = { protein: 150, carb: 150, veg: 100 };
const MEAL_COMBOS = {
  pollo: [
    { carb: "arroz", veg: "verduras_mixtas", title: "Pollo revuelto con arroz y verduras salteadas", prep: "Pollo en tiras salteado con un chorrito de aceite, verduras salteadas aparte, arroz blanco de base." },
    { carb: "papa", veg: "brocoli", title: "Pollo al horno con papas y brócoli", prep: "Pechuga al horno con especias, papas en gajos, brócoli al vapor." },
    { carb: "fideos", veg: "zapallo_verde", title: "Pollo con fideos y zapallito salteado", prep: "Pollo salteado, fideos simples, zapallito salteado con ajo." },
  ],
  cerdo: [
    { carb: "papa", veg: "verduras_mixtas", title: "Bife de cerdo a la plancha con puré y ensalada", prep: "Cerdo a la plancha, papa pisada, ensalada mixta al costado." },
    { carb: "arroz", veg: "zanahoria", title: "Cerdo salteado con arroz y zanahoria", prep: "Cerdo en tiras salteado, arroz blanco, zanahoria cocida." },
    { carb: "batata", veg: "brocoli", title: "Cerdo al horno con batata y brócoli", prep: "Cerdo al horno, batata en rodajas, brócoli al vapor." },
  ],
  carne_magra: [
    { carb: "papa", veg: "verduras_mixtas", title: "Lomo a la plancha con papas y ensalada", prep: "Lomo a la plancha, papas hervidas o al horno, ensalada mixta." },
    { carb: "arroz", veg: "zapallo_anco", title: "Lomo salteado con arroz y zapallo", prep: "Lomo en tiras salteado, arroz blanco, zapallo cocido." },
    { carb: "fideos", veg: "espinaca", title: "Lomo con fideos y espinaca salteada", prep: "Lomo a la plancha cortado en tiras, fideos simples, espinaca salteada con ajo." },
  ],
  asado: [
    { carb: "papa", veg: "verduras_mixtas", title: "Asado con papas al horno y ensalada", prep: "Asado a la parrilla, papas al horno, ensalada mixta." },
    { carb: "batata", veg: "zapallo_anco", title: "Asado con batata y zapallo al horno", prep: "Asado a la parrilla, batata y zapallo al horno." },
  ],
  carne_picada: [
    { carb: "fideos", veg: "verduras_mixtas", title: "Salsa boloñesa casera con fideos", prep: "Carne picada salteada con salsa de tomate casera, sobre fideos, ensalada al costado." },
    { carb: "papa", veg: "zapallo_verde", title: "Carne picada con puré y zapallito", prep: "Carne picada salteada con cebolla, puré de papa, zapallito salteado." },
  ],
  pescado: [
    { carb: "arroz", veg: "brocoli", title: "Merluza al horno con arroz y brócoli", prep: "Pescado al horno con limón, arroz blanco, brócoli al vapor." },
    { carb: "papa", veg: "zanahoria", title: "Pescado a la plancha con papas y zanahoria", prep: "Pescado a la plancha, papas hervidas, zanahoria cocida." },
  ],
  atun: [
    { carb: "arroz", veg: "verduras_mixtas", title: "Atún con arroz y ensalada", prep: "Atún al natural escurrido, mezclado con arroz y verduras mixtas, un chorrito de aceite de oliva." },
    { carb: "fideos", veg: "zapallo_verde", title: "Ensalada de atún con fideos fríos", prep: "Fideos fríos con atún al natural, zapallito salteado, condimentado a gusto." },
  ],
  huevo: [
    { carb: "pan_integral", veg: "verduras_mixtas", title: "Huevos revueltos con pan integral y ensalada", prep: "Huevos revueltos, pan integral tostado, ensalada mixta al costado." },
    { carb: "papa", veg: "espinaca", title: "Tortilla de papa y espinaca", prep: "Tortilla de huevo con papa y espinaca salteada adentro." },
  ],
};

// Elige una combinacion para la proteina dada. seed cambia el resultado de
// forma predecible (ej. por fecha) para no mostrar siempre la primera —
// no es random puro, asi que no "titila" en cada render.
function pickMealCombo(proteinId, seed) {
  const options = MEAL_COMBOS[proteinId];
  if (!options || options.length === 0) return null;
  const idx = Math.abs(seed) % options.length;
  return { proteinId, ...options[idx] };
}

// Macros totales estimados de la combinacion con las porciones por defecto.
function computeComboMacros(combo) {
  const parts = [
    computeFoodMacros(combo.proteinId, MEAL_COMBO_PORTIONS.protein),
    computeFoodMacros(combo.carb, MEAL_COMBO_PORTIONS.carb),
    combo.veg ? computeFoodMacros(combo.veg, MEAL_COMBO_PORTIONS.veg) : null,
  ].filter(Boolean);
  return parts.reduce(
    (acc, m) => ({ kcal: acc.kcal + m.kcal, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

// Un entero estable por fecha + texto, para variar la sugerencia dia a dia
// sin que sea random puro (mismo dia, misma seleccion -> misma sugerencia).
function seedFromString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// Banco curado de meriendas, pre y post-entreno -- misma logica que
// MEAL_COMBOS (sin IA, alimentos de FOOD_DB) pero mas simples: no son un
// plato con proteina+carbo+verdura, son 2-3 alimentos concretos con su
// cantidad. Pensado para el objetivo del usuario (deficit calorico, 180g de
// proteina/dia): las meriendas no son solo carbohidrato vacio, y el
// pre/post-entreno prioriza carbohidratos rapidos y proteina de absorcion
// rapida en vez de comida pesada que cueste digerir cerca de entrenar.
function foodQty(id, qty) {
  return { id, qty };
}
const SNACK_COMBOS = {
  merienda: [
    { title: "Yogur griego con banana y almendras", prep: "Mezclá el yogur con la banana en rodajas y un puñado de almendras encima.", items: [foodQty("yogur_griego", 200), foodQty("banana", 1), foodQty("almendras", 1)] },
    { title: "Tostadas con queso blanco y manzana", prep: "Tostadas con queso blanco descremado untado, manzana aparte.", items: [foodQty("pan_integral", 2), foodQty("queso_blanco_0", 4), foodQty("manzana", 1)] },
    { title: "Huevo duro con pan y fruta", prep: "Huevos duros, pan lactal, banana.", items: [foodQty("huevo", 2), foodQty("pan_lactal", 2), foodQty("banana", 1)] },
  ],
  pre_entreno: [
    { title: "Banana con un scoop de whey", prep: "Licuado rápido o banana + batido de whey, 30-45 min antes de entrenar: carbohidrato rápido + proteína de absorción rápida, bajo en grasa para que no te pese.", items: [foodQty("banana", 1), foodQty("whey", 1)] },
    { title: "Tostadas con banana", prep: "Pan lactal con banana en rodajas — carbohidrato simple, liviano, ideal si entrenás pronto.", items: [foodQty("pan_lactal", 2), foodQty("banana", 1)] },
    { title: "Avena con banana", prep: "Avena con banana — un poco más de fibra, mejor si falta 60-90 min para entrenar (no inmediatamente antes).", items: [foodQty("avena", 1), foodQty("banana", 1)] },
  ],
  post_entreno: [
    { title: "Whey con banana", prep: "Batido de whey con banana apenas terminás — repone glucógeno y manda proteína rápido al músculo.", items: [foodQty("whey", 1), foodQty("banana", 1)] },
    { title: "Atún con arroz", prep: "Atún al natural con arroz blanco — comida real, alta en proteína, buen carbohidrato para reponer.", items: [foodQty("atun", 100), foodQty("arroz", 150)] },
    { title: "Yogur griego con avena y banana", prep: "Yogur griego con avena y banana — proteína y carbohidrato de recuperación, fácil de preparar.", items: [foodQty("yogur_griego", 200), foodQty("avena", 1), foodQty("banana", 1)] },
  ],
};

function computeItemsMacros(items) {
  return items.reduce(
    (acc, it) => {
      const m = computeFoodMacros(it.id, it.qty);
      if (!m) return acc;
      return { kcal: acc.kcal + m.kcal, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}
function itemsLabel(items) {
  return items
    .map((it) => {
      const f = FOOD_DB.find((x) => x.id === it.id);
      if (!f) return null;
      const qtyTxt = f.unit ? `${fmtNum(it.qty)} ${it.qty === 1 ? f.unitWord : f.unitWordPlural}` : `${fmtNum(it.qty)}g`;
      return `${qtyTxt} de ${f.name}`;
    })
    .filter(Boolean)
    .join(" · ");
}

const PAIN_ZONES = [
  { key: "codo_d", label: "Codo der." },
  { key: "codo_i", label: "Codo izq." },
  { key: "hombro_d", label: "Hombro der." },
  { key: "hombro_i", label: "Hombro izq." },
  { key: "rodilla_d", label: "Rodilla der." },
  { key: "rodilla_i", label: "Rodilla izq." },
  { key: "lumbar", label: "Lumbar" },
  { key: "talon", label: "Talón" },
];

// ---------------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [tab, setTab] = useState("hoy");
  const [selectedDay, setSelectedDay] = useState(defaultDayKey());
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [bwLogs, setBwLogs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [nutritionTargets, setNutritionTargets] = useState(null);
  const [mealLogs, setMealLogs] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [photoUrls, setPhotoUrls] = useState({});
  const [supplements, setSupplements] = useState([]);
  const [supplementLogs, setSupplementLogs] = useState([]);
  const [coachNote, setCoachNote] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [openForm, setOpenForm] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1600);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Supabase entrega el link del mail de "olvidé mi contraseña" como una
      // sesion temporal con este evento: se muestra el formulario de nueva
      // contraseña en vez de entrar directo a la app con esa sesion.
      if (_event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(sess);
      if (!sess) {
        setConfig(null);
        setLogs([]);
        setBwLogs([]);
        setActivityLogs([]);
        setCheckins([]);
        setNutritionTargets(null);
        setMealLogs([]);
        setPhotos([]);
        setPhotoUrls({});
        setSupplements([]);
        setSupplementLogs([]);
        setDataLoaded(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user?.id) loadAllData(session.user.id);
  }, [session?.user?.id]);

  async function loadAllData(userId) {
    setDataLoaded(false);
    const { data: cfgRow } = await supabase.from("configs").select("config").eq("user_id", userId).maybeSingle();
    let cfg = cfgRow?.config;
    if (!cfg) {
      cfg = defaultTemplate();
      await supabase.from("configs").insert({ user_id: userId, config: cfg });
    }
    const { data: logRows } = await supabase
      .from("workout_logs").select("*").eq("user_id", userId).order("date", { ascending: true });
    const { data: bwRows } = await supabase
      .from("bodyweight_logs").select("*").eq("user_id", userId).order("date", { ascending: true });
    const { data: activityRows } = await supabase
      .from("activity_logs").select("*").eq("user_id", userId).order("date", { ascending: true });
    const { data: checkinRows } = await supabase
      .from("daily_checkins").select("*").eq("user_id", userId).order("date", { ascending: true });
    const { data: targetsRow } = await supabase
      .from("nutrition_targets").select("*").eq("user_id", userId).maybeSingle();
    const { data: mealRows } = await supabase
      .from("meal_logs").select("*").eq("user_id", userId).order("date", { ascending: true });
    const { data: photoRows } = await supabase
      .from("progress_photos").select("*").eq("user_id", userId).order("date", { ascending: true });
    const { data: supplementRows } = await supabase
      .from("supplements").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    const { data: supplementLogRows } = await supabase
      .from("supplement_logs").select("*").eq("user_id", userId).order("date", { ascending: true });
    // La escribe la funcion /api/coach-weekly (ver ese archivo), disparada por un cron externo;
    // acá solo se lee la última, nunca se inserta desde el navegador.
    const { data: noteRow } = await supabase
      .from("coach_notes").select("*").eq("user_id", userId).order("week_start", { ascending: false }).limit(1).maybeSingle();

    setConfig(cfg);
    setLogs((logRows || []).map(mapLogRow));
    setBwLogs((bwRows || []).map(mapBwRow));
    setActivityLogs((activityRows || []).map(mapActivityRow));
    setCheckins((checkinRows || []).map(mapCheckinRow));
    setNutritionTargets(mapTargetsRow(targetsRow));
    setMealLogs((mealRows || []).map(mapMealRow));
    setPhotos((photoRows || []).map(mapPhotoRow));
    setSupplements((supplementRows || []).map(mapSupplementRow));
    setSupplementLogs((supplementLogRows || []).map(mapSupplementLogRow));
    setCoachNote(mapCoachNoteRow(noteRow));
    setDataLoaded(true);
  }

  async function persistConfig(next) {
    setConfig(next);
    await supabase.from("configs").upsert(
      { user_id: session.user.id, config: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  }

  async function addLog(entry) {
    const row = {
      user_id: session.user.id,
      date: entry.date,
      day: entry.day,
      exercise_id: entry.exerciseId,
      exercise_name: entry.exerciseName,
      unilateral: entry.unilateral,
      weight: entry.weight ?? null,
      reps: entry.reps ?? null,
      weight_r: entry.weightR ?? null,
      reps_r: entry.repsR ?? null,
      weight_l: entry.weightL ?? null,
      reps_l: entry.repsL ?? null,
      rir: entry.rir ?? null,
    };
    const { data, error } = await supabase.from("workout_logs").insert(row).select().single();
    if (!error && data) {
      setLogs((prev) => [...prev, mapLogRow(data)]);
      showToast(entry.prLabel ? `🏆 ¡Nuevo PR! ${entry.prLabel}` : "Set guardado");
    }
  }

  async function updateLog(id, patch) {
    const row = {
      weight: patch.weight ?? null,
      reps: patch.reps ?? null,
      weight_r: patch.weightR ?? null,
      reps_r: patch.repsR ?? null,
      weight_l: patch.weightL ?? null,
      reps_l: patch.repsL ?? null,
      rir: patch.rir ?? null,
    };
    const { data, error } = await supabase.from("workout_logs").update(row).eq("id", id).select().single();
    if (!error && data) {
      setLogs((prev) => prev.map((l) => (l.id === id ? mapLogRow(data) : l)));
      showToast("Registro actualizado");
    }
  }

  async function deleteLog(id) {
    await supabase.from("workout_logs").delete().eq("id", id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  async function addBw(entry) {
    const row = { user_id: session.user.id, date: entry.date, weight: entry.weight, waist: entry.waist ?? null };
    const { data, error } = await supabase.from("bodyweight_logs").insert(row).select().single();
    if (!error && data) {
      setBwLogs((prev) => [...prev, mapBwRow(data)]);
      showToast("Peso registrado");
    }
  }

  async function addActivity(entry) {
    const row = {
      user_id: session.user.id,
      date: entry.date,
      name: entry.name,
      duration_min: entry.durationMin ?? null,
      intensity_rpe: entry.intensityRpe ?? null,
      used_watch: !!entry.usedWatch,
      avg_hr: entry.avgHr ?? null,
      notes: entry.notes || null,
    };
    const { data, error } = await supabase.from("activity_logs").insert(row).select().single();
    if (!error && data) {
      setActivityLogs((prev) => [...prev, mapActivityRow(data)]);
      showToast("Actividad guardada");
    }
  }

  async function deleteActivity(id) {
    await supabase.from("activity_logs").delete().eq("id", id);
    setActivityLogs((prev) => prev.filter((a) => a.id !== id));
  }

  async function saveCheckin(entry) {
    const row = {
      user_id: session.user.id,
      date: entry.date,
      energy: entry.energy ?? null,
      soreness: entry.soreness ?? null,
      pain: entry.pain || {},
      notes: entry.notes || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("daily_checkins").upsert(row, { onConflict: "user_id,date" }).select().single();
    if (!error && data) {
      setCheckins((prev) => {
        const rest = prev.filter((c) => c.date !== data.date);
        return [...rest, mapCheckinRow(data)].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
      showToast("Chequeo guardado");
    }
  }

  async function saveTargets(entry) {
    // Se combina con lo que ya habia guardado: cada tarjeta (objetivos,
    // meta fisica) manda solo sus propios campos, y esto evita que una
    // pise los datos que guardo la otra en la misma fila.
    const merged = { ...nutritionTargets, ...entry };
    const row = {
      user_id: session.user.id,
      calories: merged.calories ?? null,
      protein: merged.protein ?? null,
      carbs: merged.carbs ?? null,
      fat: merged.fat ?? null,
      height_cm: merged.heightCm ?? null,
      neck_cm: merged.neckCm ?? null,
      target_bf_low: merged.targetBfLow ?? null,
      target_bf_high: merged.targetBfHigh ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("nutrition_targets").upsert(row, { onConflict: "user_id" }).select().single();
    if (!error && data) {
      setNutritionTargets(mapTargetsRow(data));
      showToast("Objetivos guardados");
    }
  }

  async function addMeal(entry) {
    const row = {
      user_id: session.user.id,
      date: entry.date,
      meal_type: entry.mealType || null,
      name: entry.name,
      calories: entry.calories ?? null,
      protein: entry.protein ?? null,
      carbs: entry.carbs ?? null,
      fat: entry.fat ?? null,
      notes: entry.notes || null,
    };
    const { data, error } = await supabase.from("meal_logs").insert(row).select().single();
    if (!error && data) {
      setMealLogs((prev) => [...prev, mapMealRow(data)]);
      showToast("Comida guardada");
      return true;
    }
    showToast("No se pudo guardar: " + (error?.message || "error desconocido"));
    return false;
  }

  async function deleteMeal(id) {
    await supabase.from("meal_logs").delete().eq("id", id);
    setMealLogs((prev) => prev.filter((m) => m.id !== id));
  }

  async function addPhoto(entry) {
    const ext = (entry.file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${session.user.id}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("progress-photos").upload(path, entry.file);
    if (upErr) { showToast("No se pudo subir la foto"); return; }
    const row = {
      user_id: session.user.id,
      date: entry.date,
      storage_path: path,
      weight: entry.weight ?? null,
      waist: entry.waist ?? null,
      notes: entry.notes || null,
    };
    const { data, error } = await supabase.from("progress_photos").insert(row).select().single();
    if (!error && data) {
      setPhotos((prev) => [...prev, mapPhotoRow(data)]);
      showToast("Foto guardada");
    } else {
      await supabase.storage.from("progress-photos").remove([path]);
      showToast("No se pudo guardar la foto");
    }
  }

  async function deletePhoto(id, storagePath) {
    await supabase.storage.from("progress-photos").remove([storagePath]);
    await supabase.from("progress_photos").delete().eq("id", id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setPhotoUrls((prev) => {
      const next = { ...prev };
      delete next[storagePath];
      return next;
    });
  }

  useEffect(() => {
    const missing = photos.filter((p) => !photoUrls[p.storagePath]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (p) => {
          const { data } = await supabase.storage.from("progress-photos").createSignedUrl(p.storagePath, 3600);
          return [p.storagePath, data?.signedUrl || null];
        })
      );
      if (cancelled) return;
      setPhotoUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([path, url]) => { if (url) next[path] = url; });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [photos]);

  async function addSupplement(entry) {
    const row = {
      user_id: session.user.id,
      name: entry.name,
      dose: entry.dose || null,
      timing: entry.timing || null,
      active: true,
    };
    const { data, error } = await supabase.from("supplements").insert(row).select().single();
    if (!error && data) {
      setSupplements((prev) => [...prev, mapSupplementRow(data)]);
      showToast("Suplemento agregado");
    }
  }

  async function toggleSupplementActive(id, active) {
    const { data, error } = await supabase.from("supplements").update({ active }).eq("id", id).select().single();
    if (!error && data) {
      setSupplements((prev) => prev.map((s) => (s.id === id ? mapSupplementRow(data) : s)));
    }
  }

  async function deleteSupplement(id) {
    await supabase.from("supplements").delete().eq("id", id);
    setSupplements((prev) => prev.filter((s) => s.id !== id));
    setSupplementLogs((prev) => prev.filter((l) => l.supplementId !== id));
  }

  async function toggleSupplementToday(supplementId) {
    const today = todayISO();
    const existing = supplementLogs.find((l) => l.supplementId === supplementId && l.date === today);
    if (existing) {
      await supabase.from("supplement_logs").delete().eq("id", existing.id);
      setSupplementLogs((prev) => prev.filter((l) => l.id !== existing.id));
    } else {
      const { data, error } = await supabase
        .from("supplement_logs")
        .insert({ user_id: session.user.id, supplement_id: supplementId, date: today })
        .select().single();
      if (!error && data) {
        setSupplementLogs((prev) => [...prev, mapSupplementLogRow(data)]);
      }
    }
  }

  // Respaldo descargable: junta todo lo del usuario directo de Supabase (no
  // lo que ya esta en memoria, por si hay algo que el estado local no tiene
  // cargado) y arma un .json para bajar. No incluye los archivos de las
  // fotos de progreso -- son binarios en Storage, solo se bajan sus datos
  // (fecha, peso, cintura, el path del archivo).
  async function exportAllData() {
    const userId = session.user.id;
    const [workouts, bw, activities, checkinsRes, meals, targetsRes, supplementsRes, supplementLogsRes, photosRes, coachNotesRes] = await Promise.all([
      supabase.from("workout_logs").select("*").eq("user_id", userId).order("date", { ascending: true }),
      supabase.from("bodyweight_logs").select("*").eq("user_id", userId).order("date", { ascending: true }),
      supabase.from("activity_logs").select("*").eq("user_id", userId).order("date", { ascending: true }),
      supabase.from("daily_checkins").select("*").eq("user_id", userId).order("date", { ascending: true }),
      supabase.from("meal_logs").select("*").eq("user_id", userId).order("date", { ascending: true }),
      supabase.from("nutrition_targets").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("supplements").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabase.from("supplement_logs").select("*").eq("user_id", userId).order("date", { ascending: true }),
      supabase.from("progress_photos").select("*").eq("user_id", userId).order("date", { ascending: true }),
      supabase.from("coach_notes").select("*").eq("user_id", userId).order("week_start", { ascending: true }),
    ]);

    const payload = {
      exportado_el: new Date().toISOString(),
      cuenta: session.user.email,
      rutina: config,
      entrenamientos: workouts.data || [],
      peso_corporal: bw.data || [],
      actividad_extra: activities.data || [],
      chequeos_diarios: checkinsRes.data || [],
      comidas: meals.data || [],
      objetivos_nutricion: targetsRes.data || null,
      suplementos: supplementsRes.data || [],
      tomas_suplementos: supplementLogsRes.data || [],
      fotos_progreso: (photosRes.data || []).map((p) => ({ ...p, nota: "solo los datos -- la imagen en si no se incluye, se descarga aparte desde Progreso" })),
      notas_coach: coachNotesRes.data || [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registro-gym-backup-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Backup descargado");
  }

  function lastEntryFor(exerciseId) {
    const matches = logs.filter((l) => l.exerciseId === exerciseId).sort((a, b) => (a.date < b.date ? 1 : -1));
    return matches[0] || null;
  }

  // Mejor marca historica de un ejercicio: el peso mas alto cargado alguna
  // vez (no el ultimo set, el mejor de todos). En unilaterales, cada lado
  // tiene su propio record porque pueden progresar distinto.
  function bestEntryFor(exerciseId) {
    let weight = null, date = null, weightR = null, weightL = null;
    for (const l of logs) {
      if (l.exerciseId !== exerciseId) continue;
      if (l.weight != null && (weight == null || l.weight > weight)) { weight = l.weight; date = l.date; }
      if (l.weightR != null && (weightR == null || l.weightR > weightR)) weightR = l.weightR;
      if (l.weightL != null && (weightL == null || l.weightL > weightL)) weightL = l.weightL;
    }
    if (weight == null && weightR == null && weightL == null) return null;
    return { weight, date, weightR, weightL };
  }

  function updateFocus(dayKey, text) {
    persistConfig({ ...config, [dayKey]: { ...config[dayKey], focus: text } });
  }
  function updateNote(dayKey, text) {
    persistConfig({ ...config, [dayKey]: { ...config[dayKey], note: text } });
  }
  function addExercise(dayKey) {
    const ex = { id: uid(), name: "Nuevo ejercicio", unilateral: false, sets: "", reps: "" };
    persistConfig({ ...config, [dayKey]: { ...config[dayKey], exercises: [...config[dayKey].exercises, ex] } });
  }
  function updateExercise(dayKey, exId, patch) {
    persistConfig({
      ...config,
      [dayKey]: {
        ...config[dayKey],
        exercises: config[dayKey].exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)),
      },
    });
  }
  function removeExercise(dayKey, exId) {
    persistConfig({
      ...config,
      [dayKey]: { ...config[dayKey], exercises: config[dayKey].exercises.filter((e) => e.id !== exId) },
    });
  }

  const allExercises = useMemo(() => {
    if (!config) return [];
    return DAY_ORDER.flatMap((dk) => config[dk].exercises.map((e) => ({ ...e, day: dk })));
  }, [config]);

  if (recoveryMode) {
    return (
      <div className="shell">
        <style>{CSS}</style>
        <ResetPasswordScreen onDone={() => setRecoveryMode(false)} />
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="shell">
        <style>{CSS}</style>
        <div className="frame"><div className="empty" style={{ margin: "auto" }}>Cargando…</div></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="shell">
        <style>{CSS}</style>
        <AuthScreen />
      </div>
    );
  }

  if (!dataLoaded || !config) {
    return (
      <div className="shell">
        <style>{CSS}</style>
        <div className="frame"><div className="empty" style={{ margin: "auto" }}>Cargando tus datos…</div></div>
      </div>
    );
  }

  return (
    <div className="shell">
      <style>{CSS}</style>
      <div className="frame">
        <TopBar email={session.user.email} />
        <Header day={config[selectedDay]} dayName={DAY_LABELS[selectedDay]} />

        <main className="main">
          {tab === "hoy" ? (
            <HoyTab
              config={config}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              openForm={openForm}
              setOpenForm={setOpenForm}
              lastEntryFor={lastEntryFor}
              bestEntryFor={bestEntryFor}
              addLog={addLog}
              editMode={editMode}
              setEditMode={setEditMode}
              updateFocus={updateFocus}
              updateNote={updateNote}
              addExercise={addExercise}
              updateExercise={updateExercise}
              removeExercise={removeExercise}
              bwLogs={bwLogs}
              addBw={addBw}
              photos={photos}
              setTab={setTab}
            />
          ) : tab === "progreso" ? (
            <ProgresoTab
              logs={logs}
              bwLogs={bwLogs}
              addBw={addBw}
              config={config}
              allExercises={allExercises}
              photos={photos}
              photoUrls={photoUrls}
              addPhoto={addPhoto}
              deletePhoto={deletePhoto}
            />
          ) : tab === "historial" ? (
            <HistorialTab logs={logs} deleteLog={deleteLog} updateLog={updateLog} />
          ) : tab === "mas" ? (
            <MasTab
              activityLogs={activityLogs}
              addActivity={addActivity}
              deleteActivity={deleteActivity}
              checkins={checkins}
              saveCheckin={saveCheckin}
              supplements={supplements}
              supplementLogs={supplementLogs}
              addSupplement={addSupplement}
              toggleSupplementActive={toggleSupplementActive}
              deleteSupplement={deleteSupplement}
              toggleSupplementToday={toggleSupplementToday}
              onExport={exportAllData}
            />
          ) : tab === "nutricion" ? (
            <NutricionTab
              targets={nutritionTargets}
              saveTargets={saveTargets}
              mealLogs={mealLogs}
              addMeal={addMeal}
              deleteMeal={deleteMeal}
              bwLogs={bwLogs}
              logs={logs}
              config={config}
              activityLogs={activityLogs}
            />
          ) : (
            <CoachTab
              bwLogs={bwLogs}
              logs={logs}
              activityLogs={activityLogs}
              checkins={checkins}
              mealLogs={mealLogs}
              targets={nutritionTargets}
              supplements={supplements}
              supplementLogs={supplementLogs}
              coachNote={coachNote}
            />
          )}
        </main>

        {toast && <div className="toast"><Check size={14} strokeWidth={3} /> {toast}</div>}

        <nav className="tabbar">
          <TabBtn icon={<Dumbbell size={20} />} label="Hoy" active={tab === "hoy"} onClick={() => setTab("hoy")} />
          <TabBtn icon={<TrendingUp size={20} />} label="Progreso" active={tab === "progreso"} onClick={() => setTab("progreso")} />
          <TabBtn icon={<History size={20} />} label="Historial" active={tab === "historial"} onClick={() => setTab("historial")} />
          <TabBtn icon={<Activity size={20} />} label="Más" active={tab === "mas"} onClick={() => setTab("mas")} />
          <TabBtn icon={<Utensils size={20} />} label="Nutrición" active={tab === "nutricion"} onClick={() => setTab("nutricion")} />
          <TabBtn icon={<Sparkles size={20} />} label="Coach" active={tab === "coach"} onClick={() => setTab("coach")} />
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  async function recuperar() {
    setError(""); setInfo("");
    if (!email) { setError("Escribí tu mail arriba y tocá de nuevo \"¿Olvidaste tu contraseña?\"."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) setError(traducirError(error.message));
      else setInfo("Te mandamos un mail para elegir una contraseña nueva. Revisá la bandeja de entrada (y spam).");
    } catch (err) {
      setError("No se pudo conectar. Probá de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    setError(""); setInfo("");
    if (!email || !password) { setError("Completá mail y contraseña."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(traducirError(error.message));
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(traducirError(error.message));
        else setInfo("Cuenta creada. Si pide confirmación, revisá tu mail.");
      }
    } catch (err) {
      setError("No se pudo conectar. Probá de nuevo en un momento.");
    } finally {
      setLoading(false);
    }
  }

  function traducirError(msg) {
    if (/already registered/i.test(msg)) return "Ese mail ya tiene una cuenta — probá iniciar sesión.";
    if (/invalid login/i.test(msg)) return "Mail o contraseña incorrectos.";
    if (/password/i.test(msg) && /6/i.test(msg)) return "La contraseña necesita al menos 6 caracteres.";
    return msg;
  }

  return (
    <div className="auth-shell">
      <div className="eyebrow">Registro de entrenamiento</div>
      <div className="auth-title">{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</div>
      <div className="auth-card">
        <input className="input" type="email" placeholder="Mail" value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" />
        <input className="input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="save-btn" onClick={submit} disabled={loading}>
          {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </div>
      <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setInfo(""); }}>
        {mode === "login" ? "¿No tenés cuenta? Creá una" : "¿Ya tenés cuenta? Iniciá sesión"}
      </button>
      {mode === "login" && (
        <button className="auth-forgot" onClick={recuperar} disabled={loading}>
          {loading ? "Enviando…" : "¿Olvidaste tu contraseña?"}
        </button>
      )}
      {error && <div className="auth-error">{error}</div>}
      {info && <div className="auth-info">{info}</div>}
    </div>
  );
}

// Pantalla que se muestra al volver del mail de recuperacion: en vez de entrar
// directo a la app con la sesion temporal que manda Supabase, pide elegir una
// contraseña nueva y recien despues sigue.
function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (password.length < 6) { setError("La contraseña necesita al menos 6 caracteres."); return; }
    if (password !== confirm) { setError("Las dos contraseñas no coinciden."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <div className="auth-shell">
      <div className="eyebrow">Registro de entrenamiento</div>
      <div className="auth-title">Nueva contraseña</div>
      <div className="auth-card">
        <input className="input" type="password" placeholder="Contraseña nueva" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className="input" type="password" placeholder="Repetí la contraseña" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <div className="auth-error">{error}</div>}
        <button className="save-btn" onClick={submit} disabled={loading}>
          {loading ? "Un momento…" : "Guardar contraseña"}
        </button>
      </div>
    </div>
  );
}

function TopBar({ email }) {
  return (
    <div className="topbar">
      <span className="topbar-email mono">{email}</span>
      <button className="manage-btn" onClick={() => supabase.auth.signOut()}>
        <LogOut size={15} />
      </button>
    </div>
  );
}

function Header({ day, dayName }) {
  return (
    <header className="header">
      <div className="eyebrow">Registro de entrenamiento</div>
      <div className="day-title">{dayName}</div>
      <div className="day-focus">{day.focus}</div>
      {day.note && <div className="day-note">{day.note}</div>}
    </header>
  );
}

function TabBtn({ icon, label, active, onClick }) {
  return (
    <button className={"tabbtn" + (active ? " active" : "")} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}

// Input numerico en texto plano: evita que el navegador descarte los decimales
// y deja escribir la coma del teclado en espanol.
function NumInput({ value, onChange, placeholder, decimal = true, className = "input" }) {
  return (
    <input
      className={className}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      autoComplete="off"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(decimal ? sanitizeDecimal(e.target.value) : sanitizeInt(e.target.value))}
    />
  );
}

// Cada cuantos dias sin registrar se considera atrasado -- semanal, mismo
// criterio que ya usa el Coach para comparar "esta semana vs. la anterior".
// Ajustable si hace falta cambiar la frecuencia.
const CHECKIN_REMINDER_DAYS = 7;

// Recordatorio de peso/cintura/fotos: aparece arriba de "Hoy" cuando pasaron
// CHECKIN_REMINDER_DAYS o mas desde el ultimo registro de cada cosa (o nunca
// se cargo). Deja completar peso y cintura ahi mismo sin salir de la
// pestaña; para las fotos manda a "Progreso", que es donde vive esa carga.
// El cuello no tiene fecha propia (se carga una sola vez en Nutricion ->
// Meta fisica, no es un registro periodico como peso/cintura), asi que solo
// se deja la nota fija en vez de calcularle un "hace X dias".
function CheckInReminder({ bwLogs, addBw, photos, setTab }) {
  const [weightInput, setWeightInput] = useState("");
  const [waistInput, setWaistInput] = useState("");
  const [saving, setSaving] = useState(false);

  const lastWeightDate = useMemo(() => {
    const withWeight = [...bwLogs].filter((b) => b.weight != null).sort((a, b) => (a.date < b.date ? 1 : -1));
    return withWeight[0]?.date ?? null;
  }, [bwLogs]);
  const lastWaistDate = useMemo(() => {
    const withWaist = [...bwLogs].filter((b) => b.waist != null).sort((a, b) => (a.date < b.date ? 1 : -1));
    return withWaist[0]?.date ?? null;
  }, [bwLogs]);
  const lastPhotoDate = useMemo(() => {
    const sorted = [...(photos || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    return sorted[0]?.date ?? null;
  }, [photos]);

  const daysWeight = lastWeightDate ? daysSinceISO(lastWeightDate) : null;
  const daysWaist = lastWaistDate ? daysSinceISO(lastWaistDate) : null;
  const daysPhoto = lastPhotoDate ? daysSinceISO(lastPhotoDate) : null;

  const weightDue = daysWeight == null || daysWeight >= CHECKIN_REMINDER_DAYS;
  const waistDue = daysWaist == null || daysWaist >= CHECKIN_REMINDER_DAYS;
  const photoDue = daysPhoto == null || daysPhoto >= CHECKIN_REMINDER_DAYS;

  if (!weightDue && !waistDue && !photoDue) return null;

  function dueText(days, noun) {
    if (days == null) return `nunca cargaste ${noun}`;
    return `hace ${days} día${days === 1 ? "" : "s"} que no cargás ${noun}`;
  }

  const parts = [];
  if (weightDue && waistDue && daysWeight === daysWaist) {
    parts.push(dueText(daysWeight, "peso ni cintura"));
  } else {
    if (weightDue) parts.push(dueText(daysWeight, "peso"));
    if (waistDue) parts.push(dueText(daysWaist, "cintura"));
  }
  if (photoDue) parts.push(dueText(daysPhoto, "una foto"));

  async function submit() {
    const w = toNum(weightInput);
    if (w == null || saving) return;
    setSaving(true);
    await addBw({ date: todayISO(), weight: w, waist: toNum(waistInput) });
    setSaving(false);
    setWeightInput(""); setWaistInput("");
  }

  return (
    <section className="card reminder-card">
      <div className="reminder-head">
        <Bell size={15} />
        <span className="section-title" style={{ margin: 0 }}>Toca tu control</span>
      </div>
      <div className="section-sub" style={{ marginBottom: 10 }}>
        {parts.join(" · ")}
      </div>

      {(weightDue || waistDue) && (
        <>
          <div className="side-grid two" style={{ marginBottom: 10 }}>
            <NumInput placeholder="Peso (kg)" value={weightInput} onChange={setWeightInput} />
            <NumInput placeholder="Cintura (cm)" value={waistInput} onChange={setWaistInput} />
          </div>
          <button className="save-btn" style={{ marginTop: 0, marginBottom: photoDue ? 8 : 0 }} disabled={!weightInput || saving} onClick={submit}>
            {saving ? "Guardando…" : "Registrar"}
          </button>
        </>
      )}
      {photoDue && (
        <button className="cancel-btn" style={{ width: "100%" }} onClick={() => setTab("progreso")}>
          <Camera size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Ir a subir una foto
        </button>
      )}
      <div className="reminder-note">¿Cambió tu contorno de cuello? Actualizalo en Nutrición → Meta física.</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Barra fija de descanso: cuenta regresiva + beep al llegar a 0. El AudioContext
// se recibe ya creado desde HoyTab (ver startRestTimer), porque crearlo aca
// adentro -- despues de que paso un tick de setInterval -- llegaria tarde para
// las politicas de autoplay del navegador.
function RestTimerBar({ seconds, setSeconds, audioCtx, onClose }) {
  const [paused, setPaused] = useState(false);
  const beepedRef = useRef(false);

  useEffect(() => {
    if (seconds == null) return;
    if (seconds > 0) {
      beepedRef.current = false;
      if (paused) return;
      const id = setTimeout(() => setSeconds((s) => (s != null ? s - 1 : s)), 1000);
      return () => clearTimeout(id);
    }
    if (!beepedRef.current) {
      beepedRef.current = true;
      playBeep(audioCtx);
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
    }
  }, [paused, seconds, audioCtx, setSeconds]);

  function playBeep(ctx) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch {}
  }

  function adjust(delta) {
    beepedRef.current = false;
    setSeconds((s) => Math.max(0, (s || 0) + delta));
  }

  const done = seconds <= 0;
  const mm = String(Math.floor(Math.max(seconds, 0) / 60)).padStart(2, "0");
  const ss = String(Math.max(seconds, 0) % 60).padStart(2, "0");

  return (
    <div className={"rest-timer-bar" + (done ? " done" : "")}>
      <Timer size={18} />
      <div className="rest-timer-time mono">{mm}:{ss}</div>
      <div className="rest-timer-actions">
        <button type="button" className="rest-timer-btn" onClick={() => adjust(-15)}>-15s</button>
        <button type="button" className="rest-timer-btn" onClick={() => adjust(15)}>+15s</button>
        <button type="button" className="rest-timer-btn" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button type="button" className="rest-timer-btn" onClick={onClose}><X size={14} /></button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function HoyTab({
  config, selectedDay, setSelectedDay, openForm, setOpenForm, lastEntryFor, bestEntryFor, addLog,
  editMode, setEditMode, updateFocus, updateNote, addExercise, updateExercise, removeExercise,
  bwLogs, addBw, photos, setTab,
}) {
  const day = config[selectedDay];

  // Timer de descanso: vive en Hoy (no en cada tarjeta) para que quede fijo
  // arriba sin importar que ejercicio tengas abierto. El AudioContext se crea
  // en startRestTimer(), que se llama synchronicamente desde el click de
  // "Guardar set" -- hace falta que sea asi (no despues de un await) para
  // que el beep final pueda sonar: los navegadores bloquean el audio que
  // arranca sin un gesto del usuario de por medio.
  const [restDuration, setRestDurationState] = useState(() => {
    try { return Number(localStorage.getItem("restDuration")) || 90; } catch { return 90; }
  });
  const [restSeconds, setRestSeconds] = useState(null); // null = sin timer activo
  const audioCtxRef = useRef(null);

  function setRestDuration(sec) {
    setRestDurationState(sec);
    try { localStorage.setItem("restDuration", String(sec)); } catch {}
  }

  function startRestTimer() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current && Ctx) audioCtxRef.current = new Ctx();
      else if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    } catch {}
    setRestSeconds(restDuration);
  }

  return (
    <div className="tabpane">
      {restSeconds != null && (
        <RestTimerBar
          seconds={restSeconds}
          setSeconds={setRestSeconds}
          audioCtx={audioCtxRef.current}
          onClose={() => setRestSeconds(null)}
        />
      )}

      <CheckInReminder bwLogs={bwLogs} addBw={addBw} photos={photos} setTab={setTab} />

      <div className="chiprow">
        {DAY_ORDER.map((k) => (
          <button key={k} className={"chip" + (k === selectedDay ? " chip-active" : "")} onClick={() => setSelectedDay(k)}>
            {DAY_LABELS[k].slice(0, 3)}
          </button>
        ))}
      </div>

      <button className="edit-toggle" onClick={() => setEditMode(!editMode)}>
        {editMode ? <><Check size={14} /> Listo</> : <><Pencil size={14} /> Editar rutina</>}
      </button>

      {editMode ? (
        <div className="cardlist">
          <div className="card">
            <div className="edit-label">Grupo muscular / foco</div>
            <input className="input" value={day.focus} onChange={(e) => updateFocus(selectedDay, e.target.value)} placeholder="Ej: Espalda y tríceps" />
            <div className="edit-label" style={{ marginTop: 10 }}>Nota (opcional)</div>
            <input className="input" value={day.note} onChange={(e) => updateNote(selectedDay, e.target.value)} placeholder="Ej: foco extra en el brazo derecho" />
          </div>

          {day.exercises.map((ex) => (
            <div key={ex.id} className="card ex-edit">
              <div className="edit-row">
                <input className="input edit-name" value={ex.name} onChange={(e) => updateExercise(selectedDay, ex.id, { name: e.target.value })} placeholder="Nombre del ejercicio" />
                <label className="uni-toggle">
                  <input type="checkbox" checked={ex.unilateral} onChange={(e) => updateExercise(selectedDay, ex.id, { unilateral: e.target.checked })} />
                  <span>Der/Izq</span>
                </label>
                <button className="del-btn" onClick={() => removeExercise(selectedDay, ex.id)}><Trash2 size={15} /></button>
              </div>
              <div className="target-row">
                <label className="target-field">
                  <span className="target-cap">Series</span>
                  <NumInput className="input target-input" decimal={false} value={ex.sets ?? ""} placeholder="4"
                    onChange={(v) => updateExercise(selectedDay, ex.id, { sets: v })} />
                </label>
                <label className="target-field">
                  <span className="target-cap">Reps</span>
                  <input className="input target-input" type="text" autoComplete="off" value={ex.reps ?? ""} placeholder="8-10"
                    onChange={(e) => updateExercise(selectedDay, ex.id, { reps: e.target.value })} />
                </label>
              </div>
            </div>
          ))}

          <button className="add-exercise-btn" onClick={() => addExercise(selectedDay)}><Plus size={15} /> Agregar ejercicio</button>
        </div>
      ) : (
        <div className="cardlist">
          {day.exercises.length === 0 ? (
            <div className="empty">Este día todavía no tiene ejercicios. Tocá "Editar rutina" para agregarlos.</div>
          ) : (
            day.exercises.map((ex) => (
              <ExerciseCard
                key={ex.id} exercise={ex} day={selectedDay} last={lastEntryFor(ex.id)} best={bestEntryFor(ex.id)}
                isOpen={openForm === ex.id}
                onToggle={() => setOpenForm(openForm === ex.id ? null : ex.id)}
                onSave={(entry) => { addLog(entry); setOpenForm(null); }}
                restDuration={restDuration}
                setRestDuration={setRestDuration}
                onRestStart={startRestTimer}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({ exercise, day, last, best, isOpen, onToggle, onSave, restDuration, setRestDuration, onRestStart }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [weightR, setWeightR] = useState("");
  const [repsR, setRepsR] = useState("");
  const [weightL, setWeightL] = useState("");
  const [repsL, setRepsL] = useState("");
  const [rir, setRir] = useState("");

  const target = targetText(exercise);

  function lastLabel() {
    if (!last) return "Sin registros todavía";
    const rirTxt = last.rir != null ? ` · RIR ${last.rir}` : "";
    if (exercise.unilateral) {
      return `Último — Der: ${fmtNum(last.weightR)}kg×${fmtNum(last.repsR)} · Izq: ${fmtNum(last.weightL)}kg×${fmtNum(last.repsL)}${rirTxt}`;
    }
    return `Último: ${fmtNum(last.weight)}kg × ${fmtNum(last.reps)} reps${rirTxt} · ${fmtShort(last.date)}`;
  }

  // Mejor marca historica, para mostrarla siempre visible en la tarjeta (no
  // solo cuando se festeja un PR nuevo al guardar).
  function bestLabel() {
    if (!best) return null;
    if (exercise.unilateral) {
      if (best.weightR == null && best.weightL == null) return null;
      const r = best.weightR != null ? `Der ${fmtNum(best.weightR)}kg` : null;
      const l = best.weightL != null ? `Izq ${fmtNum(best.weightL)}kg` : null;
      return [r, l].filter(Boolean).join(" · ");
    }
    return best.weight != null ? `${fmtNum(best.weight)}kg` : null;
  }

  function submit() {
    // onRestStart() tiene que llamarse de forma sincronica, en la misma
    // cadena del click de "Guardar set" (ver startRestTimer en HoyTab):
    // es lo que permite que el beep final del timer pueda sonar pese a las
    // restricciones de autoplay de audio del navegador.
    onRestStart?.();
    const rirNum = toNum(rir);
    if (exercise.unilateral) {
      const wR = toNum(weightR), wL = toNum(weightL);
      if (wR == null && wL == null) return;
      // Cada lado puede marcar PR por separado -- un lado mas fuerte que el
      // otro no deberia opacar que el lado mas flojo tambien mejoro.
      const prR = wR != null && (best?.weightR == null || wR > best.weightR);
      const prL = wL != null && (best?.weightL == null || wL > best.weightL);
      let prLabel = null;
      if (prR && prL) prLabel = `${exercise.name} (Der y Izq)`;
      else if (prR) prLabel = `${exercise.name} (Der)`;
      else if (prL) prLabel = `${exercise.name} (Izq)`;
      onSave({
        date: todayISO(), day, exerciseId: exercise.id, exerciseName: exercise.name, unilateral: true,
        weightR: wR, repsR: toNum(repsR), weightL: wL, repsL: toNum(repsL), rir: rirNum, prLabel,
      });
      setWeightR(""); setRepsR(""); setWeightL(""); setRepsL(""); setRir("");
    } else {
      const w = toNum(weight);
      if (w == null) return;
      const isPR = w != null && (best?.weight == null || w > best.weight);
      onSave({
        date: todayISO(), day, exerciseId: exercise.id, exerciseName: exercise.name, unilateral: false,
        weight: w, reps: toNum(reps), rir: rirNum, prLabel: isPR ? exercise.name : null,
      });
      setWeight(""); setReps(""); setRir("");
    }
  }

  const bestTxt = bestLabel();

  return (
    <div className="card">
      <button className="card-head" onClick={onToggle}>
        <div>
          <div className="ex-name">{exercise.name}</div>
          {target && <div className="target-badge mono">{target}</div>}
          {bestTxt && <div className="ex-pr mono">🏆 {bestTxt}</div>}
          <div className="ex-last">{lastLabel()}</div>
        </div>
        <div className={"card-icon" + (isOpen ? " open" : "")}>{isOpen ? <X size={16} /> : <Plus size={16} />}</div>
      </button>

      {isOpen && (
        <div className="card-form">
          {exercise.unilateral ? (
            <div className="side-grid">
              <div className="side-col">
                <div className="side-label accent">Derecho</div>
                <NumInput placeholder="kg" value={weightR} onChange={setWeightR} />
                <NumInput placeholder="reps" decimal={false} value={repsR} onChange={setRepsR} />
              </div>
              <div className="side-col">
                <div className="side-label accent2">Izquierdo</div>
                <NumInput placeholder="kg" value={weightL} onChange={setWeightL} />
                <NumInput placeholder="reps" decimal={false} value={repsL} onChange={setRepsL} />
              </div>
            </div>
          ) : (
            <div className="side-grid two">
              <NumInput placeholder="Peso (kg)" value={weight} onChange={setWeight} />
              <NumInput placeholder="Reps" decimal={false} value={reps} onChange={setReps} />
            </div>
          )}
          <NumInput placeholder="RIR (opcional, 0-10)" decimal={false} value={rir} onChange={setRir} />
          {setRestDuration && (
            <div className="chiprow rest-chiprow">
              {[60, 90, 120].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={"chip" + (restDuration === sec ? " chip-active" : "")}
                  onClick={() => setRestDuration(sec)}
                >
                  {sec}s
                </button>
              ))}
            </div>
          )}
          <button className="save-btn" onClick={submit}>Guardar set</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProgresoTab({ logs, bwLogs, addBw, config, allExercises, photos, photoUrls, addPhoto, deletePhoto }) {
  const [selectedExerciseId, setSelectedExerciseId] = useState(allExercises[0]?.id || null);
  const [bwInput, setBwInput] = useState("");
  const [waistInput, setWaistInput] = useState("");
  const [liftMetric, setLiftMetric] = useState("peso"); // "peso" | "1rm"

  useEffect(() => {
    if (allExercises.length && !allExercises.find((e) => e.id === selectedExerciseId)) {
      setSelectedExerciseId(allExercises[0].id);
    }
  }, [allExercises]);

  const exerciseInfo = allExercises.find((e) => e.id === selectedExerciseId);

  // Mejor marca de cada ejercicio que ya tenga al menos un set cargado,
  // ordenados por dia de rutina. Mismo criterio que bestEntryFor() en Hoy:
  // el peso mas alto de todos los que se cargaron, no el ultimo.
  const prList = useMemo(() => {
    return allExercises
      .map((ex) => {
        let weight = null, date = null, weightR = null, dateR = null, weightL = null, dateL = null;
        for (const l of logs) {
          if (l.exerciseId !== ex.id) continue;
          if (l.weight != null && (weight == null || l.weight > weight)) { weight = l.weight; date = l.date; }
          if (l.weightR != null && (weightR == null || l.weightR > weightR)) { weightR = l.weightR; dateR = l.date; }
          if (l.weightL != null && (weightL == null || l.weightL > weightL)) { weightL = l.weightL; dateL = l.date; }
        }
        if (weight == null && weightR == null && weightL == null) return null;
        return { id: ex.id, name: ex.name, day: ex.day, unilateral: ex.unilateral, weight, date, weightR, dateR, weightL, dateL };
      })
      .filter(Boolean)
      .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
  }, [allExercises, logs]);

  const liftData = useMemo(() => {
    return logs.filter((l) => l.exerciseId === selectedExerciseId).sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((l) => ({
        date: fmtShort(l.date),
        Peso: l.unilateral ? null : l.weight,
        Derecho: l.unilateral ? l.weightR : null,
        Izquierdo: l.unilateral ? l.weightL : null,
        "1RM": l.unilateral ? null : estimate1RM(l.weight, l.reps),
        "1RM Der": l.unilateral ? estimate1RM(l.weightR, l.repsR) : null,
        "1RM Izq": l.unilateral ? estimate1RM(l.weightL, l.repsL) : null,
      }));
  }, [logs, selectedExerciseId]);

  const bwData = useMemo(() => [...bwLogs].sort((a, b) => (a.date > b.date ? 1 : -1)).map((b) => ({ date: fmtShort(b.date), Peso: b.weight })), [bwLogs]);
  const startWeight = bwData.length ? bwData[0].Peso : null;
  const currentWeight = bwData.length ? bwData[bwData.length - 1].Peso : null;
  const delta = startWeight != null && currentWeight != null ? Number((currentWeight - startWeight).toFixed(2)) : null;

  // La cintura va en su propio grafico: son cm, no kg, y no comparten escala.
  const waistData = useMemo(
    () => [...bwLogs].filter((b) => b.waist != null).sort((a, b) => (a.date > b.date ? 1 : -1)).map((b) => ({ date: fmtShort(b.date), Cintura: b.waist })),
    [bwLogs]
  );
  const startWaist = waistData.length ? waistData[0].Cintura : null;
  const currentWaist = waistData.length ? waistData[waistData.length - 1].Cintura : null;
  const waistDelta = startWaist != null && currentWaist != null ? Number((currentWaist - startWaist).toFixed(2)) : null;

  function saveBw() {
    const w = toNum(bwInput);
    if (w == null) return;
    addBw({ date: todayISO(), weight: w, waist: toNum(waistInput) });
    setBwInput(""); setWaistInput("");
  }

  const unilateralExercises = allExercises.filter((e) => e.unilateral);
  const armData = unilateralExercises.map((ex) => {
    const entries = logs.filter((l) => l.exerciseId === ex.id).sort((a, b) => (a.date < b.date ? 1 : -1));
    return { exercise: ex.name, last: entries[0] || null };
  });
  const hasArmData = armData.some((a) => a.last);

  if (allExercises.length === 0) {
    return <div className="tabpane"><div className="empty">Todavía no hay ejercicios cargados. Andá a "Hoy" → "Editar rutina" para agregarlos.</div></div>;
  }

  return (
    <div className="tabpane">
      <section className="card">
        <div className="section-title">Peso corporal</div>
        <div className="side-grid two">
          <NumInput placeholder="Peso hoy (kg)" value={bwInput} onChange={setBwInput} />
          <NumInput placeholder="Cintura (cm)" value={waistInput} onChange={setWaistInput} />
        </div>
        <button className="save-btn" onClick={saveBw}>Registrar</button>

        {bwData.length === 0 ? (
          <div className="empty small">Registrá tu primer peso para empezar a ver la curva acá.</div>
        ) : (
          <>
            {delta != null && (
              <div className="delta-row">
                <span className="mono">{fmtNum(startWeight)} kg</span><span className="arrow">→</span><span className="mono">{fmtNum(currentWeight)} kg</span>
                <span className={"delta " + (delta <= 0 ? "down" : "up")}>{delta <= 0 ? "" : "+"}{fmtNum(delta)} kg</span>
              </div>
            )}
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={bwData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333B44" />
                  <XAxis dataKey="date" stroke="#8B93A0" fontSize={11} />
                  <YAxis stroke="#8B93A0" fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${fmtNum(v)} kg`, "Peso"]} />
                  <Line type="monotone" dataKey="Peso" stroke="#C08A3E" strokeWidth={2.5} dot={{ r: 3, fill: "#C08A3E" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      {waistData.length > 0 && (
        <section className="card">
          <div className="section-title">Cintura</div>
          {waistDelta != null && waistData.length > 1 && (
            <div className="delta-row">
              <span className="mono">{fmtNum(startWaist)} cm</span><span className="arrow">→</span><span className="mono">{fmtNum(currentWaist)} cm</span>
              <span className={"delta " + (waistDelta <= 0 ? "down" : "up")}>{waistDelta <= 0 ? "" : "+"}{fmtNum(waistDelta)} cm</span>
            </div>
          )}
          {waistData.length === 1 && (
            <div className="delta-row"><span className="mono">{fmtNum(currentWaist)} cm</span><span className="section-sub" style={{ margin: 0 }}>— cargá otra medición para ver la tendencia</span></div>
          )}
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={waistData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333B44" />
                <XAxis dataKey="date" stroke="#8B93A0" fontSize={11} />
                <YAxis stroke="#8B93A0" fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${fmtNum(v)} cm`, "Cintura"]} />
                <Line type="monotone" dataKey="Cintura" stroke={SERIE_2} strokeWidth={2.5} dot={{ r: 3, fill: SERIE_2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {prList.length > 0 && (
        <section className="card">
          <div className="section-title">Récords personales</div>
          <div className="section-sub">Tu mejor marca de peso en cada ejercicio</div>
          <div className="cardlist" style={{ marginTop: 8 }}>
            {prList.map((pr) => (
              <div key={pr.id} className="hist-row">
                <div>
                  <div className="hist-ex">{pr.name}</div>
                  <div className="hist-detail mono">
                    {pr.unilateral
                      ? [
                          pr.weightR != null ? `Der ${fmtNum(pr.weightR)}kg${pr.dateR ? ` (${fmtShort(pr.dateR)})` : ""}` : null,
                          pr.weightL != null ? `Izq ${fmtNum(pr.weightL)}kg${pr.dateL ? ` (${fmtShort(pr.dateL)})` : ""}` : null,
                        ].filter(Boolean).join(" · ")
                      : `${fmtNum(pr.weight)}kg${pr.date ? ` · ${fmtShort(pr.date)}` : ""}`}
                  </div>
                </div>
                <span style={{ fontSize: 17 }}>🏆</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="section-title">Progresión de levantamientos</div>
        <div className="select-wrap">
          <select className="select" value={selectedExerciseId || ""} onChange={(e) => setSelectedExerciseId(e.target.value)}>
            {DAY_ORDER.map((dk) => (
              <optgroup key={dk} label={DAY_LABELS[dk]}>
                {config[dk].exercises.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={16} className="select-chevron" />
        </div>

        {liftData.length === 0 ? (
          <div className="empty small">Todavía no cargaste sets de este ejercicio.</div>
        ) : (
          <>
            <div className="chiprow" style={{ marginTop: 10, marginBottom: 2 }}>
              <button className={"chip" + (liftMetric === "peso" ? " chip-active" : "")} onClick={() => setLiftMetric("peso")}>Peso</button>
              <button className={"chip" + (liftMetric === "1rm" ? " chip-active" : "")} onClick={() => setLiftMetric("1rm")}>1RM estimado</button>
            </div>
            {liftMetric === "1rm" && (
              <div className="section-sub" style={{ marginTop: 6, marginBottom: 0 }}>
                Estimación (fórmula de Epley) de cuánto levantarías a 1 repetición, a partir del peso y las reps de cada set — más comparable que el peso solo cuando las reps varían de un set a otro.
              </div>
            )}
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={liftData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333B44" />
                  <XAxis dataKey="date" stroke="#8B93A0" fontSize={11} />
                  <YAxis stroke="#8B93A0" fontSize={11} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`${fmtNum(v)} kg`, name]} />
                  {/* El texto de la leyenda va en tinta neutra: la identidad la carga la marca de color de al lado. */}
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(value) => <span style={{ color: "#8B93A0" }}>{value}</span>} />
                  {exerciseInfo?.unilateral ? (
                    <>
                      <Line type="monotone" dataKey={liftMetric === "1rm" ? "1RM Der" : "Derecho"} stroke="#C08A3E" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey={liftMetric === "1rm" ? "1RM Izq" : "Izquierdo"} stroke={SERIE_2} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    </>
                  ) : (
                    <Line type="monotone" dataKey={liftMetric === "1rm" ? "1RM" : "Peso"} stroke="#C08A3E" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="section-title">Balance de lados</div>
        <div className="section-sub">Derecho vs. izquierdo — último set cargado de cada ejercicio unilateral</div>
        {!hasArmData ? (
          <div className="empty small">Todavía no registraste sets unilaterales. Marcá un ejercicio como "Der/Izq" en Editar rutina y cargá un set.</div>
        ) : (
          <div className="arm-list">
            {armData.map(({ exercise, last }) => {
              if (!last) return null;
              const r = last.weightR || 0;
              const l = last.weightL || 0;
              const scale = Math.max(r, l, 1) * 1.15;
              const gap = Number(Math.abs(r - l).toFixed(2));
              const leader = r === l ? null : r > l ? "Derecho" : "Izquierdo";
              return (
                <div key={exercise} className="arm-block">
                  <div className="arm-ex-name">{exercise}</div>
                  <BarRow label="Der" value={r} scale={scale} colorClass="bar-accent" />
                  <BarRow label="Izq" value={l} scale={scale} colorClass="bar-accent2" />
                  <div className="gap-label">{gap === 0 ? "Parejo — sin brecha" : `Brecha: ${fmtNum(gap)} kg (adelante: ${leader})`}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <PhotosSection photos={photos} photoUrls={photoUrls} addPhoto={addPhoto} deletePhoto={deletePhoto} />
    </div>
  );
}

function BarRow({ label, value, scale, colorClass }) {
  const pct = Math.min(100, (value / scale) * 100);
  return (
    <div className="bar-row">
      <span className="bar-label mono">{label}</span>
      <div className="bar-track"><div className={"bar-fill " + colorClass} style={{ width: `${pct}%` }} /></div>
      <span className="bar-value mono">{value ? `${fmtNum(value)}kg` : "–"}</span>
    </div>
  );
}

function PhotosSection({ photos, photoUrls, addPhoto, deletePhoto }) {
  const sorted = useMemo(() => [...photos].sort((a, b) => (a.date < b.date ? 1 : -1)), [photos]);
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);

  useEffect(() => {
    if (sorted.length >= 2) {
      if (!compareA) setCompareA(sorted[sorted.length - 1].id);
      if (!compareB) setCompareB(sorted[0].id);
    }
  }, [sorted.length]);

  const photoA = sorted.find((p) => p.id === compareA) || null;
  const photoB = sorted.find((p) => p.id === compareB) || null;

  return (
    <section className="card">
      <div className="section-title">Fotos de progreso</div>
      <div className="section-sub">Una foto de frente, misma luz y pose, cada 1-2 semanas — vale más que la balanza sola</div>

      <PhotoUploadForm onSave={addPhoto} />

      {sorted.length === 0 ? (
        <div className="empty small">Todavía no subiste ninguna foto.</div>
      ) : (
        <>
          <div className="photo-grid">
            {sorted.map((p) => (
              <div key={p.id} className="photo-thumb">
                {photoUrls[p.storagePath] ? (
                  <img src={photoUrls[p.storagePath]} alt={p.date} />
                ) : (
                  <div className="photo-placeholder" />
                )}
                <div className="photo-thumb-date mono">{fmtShort(p.date)}</div>
                <button className="photo-del" onClick={() => deletePhoto(p.id, p.storagePath)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          {sorted.length >= 2 && (
            <div className="photo-compare">
              <div className="edit-label" style={{ marginTop: 14 }}>Comparar</div>
              <div className="side-grid two">
                <div className="select-wrap">
                  <select className="select" value={compareA || ""} onChange={(e) => setCompareA(e.target.value)}>
                    {sorted.map((p) => <option key={p.id} value={p.id}>{fmtDateLabel(p.date)}</option>)}
                  </select>
                  <ChevronDown size={16} className="select-chevron" />
                </div>
                <div className="select-wrap">
                  <select className="select" value={compareB || ""} onChange={(e) => setCompareB(e.target.value)}>
                    {sorted.map((p) => <option key={p.id} value={p.id}>{fmtDateLabel(p.date)}</option>)}
                  </select>
                  <ChevronDown size={16} className="select-chevron" />
                </div>
              </div>
              <div className="photo-compare-grid">
                <PhotoCompareCard photo={photoA} url={photoA ? photoUrls[photoA.storagePath] : null} />
                <PhotoCompareCard photo={photoB} url={photoB ? photoUrls[photoB.storagePath] : null} />
              </div>
              {(() => {
                const verdict = photoVerdict(photoA, photoB);
                return verdict ? (
                  <div className={"verdict-badge tone-" + verdict.tone}>{verdict.text}</div>
                ) : null;
              })()}
              {photoA && photoB && photoA.weight != null && photoB.weight != null && (
                <div className="delta-row">
                  <span className="mono">{fmtNum(photoA.weight)} kg</span><span className="arrow">→</span><span className="mono">{fmtNum(photoB.weight)} kg</span>
                  <span className={"delta " + (photoB.weight - photoA.weight <= 0 ? "down" : "up")}>
                    {photoB.weight - photoA.weight <= 0 ? "" : "+"}{fmtNum(Number((photoB.weight - photoA.weight).toFixed(2)))} kg
                  </span>
                </div>
              )}
              {photoA && photoB && photoA.waist != null && photoB.waist != null && (
                <div className="delta-row">
                  <span className="mono">{fmtNum(photoA.waist)} cm</span><span className="arrow">→</span><span className="mono">{fmtNum(photoB.waist)} cm</span>
                  <span className={"delta " + (photoB.waist - photoA.waist <= 0 ? "down" : "up")}>
                    {photoB.waist - photoA.waist <= 0 ? "" : "+"}{fmtNum(Number((photoB.waist - photoA.waist).toFixed(2)))} cm
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PhotoCompareCard({ photo, url }) {
  if (!photo) return <div className="photo-compare-card empty small">Elegí una fecha</div>;
  return (
    <div className="photo-compare-card">
      {url ? <img src={url} alt={photo.date} /> : <div className="photo-placeholder" />}
      <div className="photo-thumb-date mono">{fmtDateLabel(photo.date)}</div>
    </div>
  );
}

// Las fotos de iPhone salen pesadas (3-5MB, a veces HEIC). Se redimensionan a
// un ancho maximo y se reconvierten a JPEG en el navegador antes de subir:
// para comparar composicion corporal no hace falta la resolucion original, y
// asi el bucket gratuito de Supabase (1GB) rinde para años de fotos.
function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round((height / width) * maxDim); width = maxDim; }
        else { width = Math.round((width / height) * maxDim); height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error("no-blob")); return; }
          resolve(new File([blob], "progreso.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}

function PhotoUploadForm({ onSave }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);

  async function onPick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCompressing(true);
    try {
      const compressed = await compressImage(f);
      setFile(compressed);
      setPreview(URL.createObjectURL(compressed));
    } catch {
      // Si algo falla comprimiendo (formato raro, etc.), subimos el original tal cual.
      setFile(f);
      setPreview(URL.createObjectURL(f));
    } finally {
      setCompressing(false);
    }
  }

  async function submit() {
    if (!file || saving) return;
    setSaving(true);
    await onSave({ file, date, weight: toNum(weight), waist: toNum(waist), notes: notes.trim() });
    setSaving(false);
    setFile(null); setPreview(null); setWeight(""); setWaist(""); setNotes("");
  }

  return (
    <div className="card-form" style={{ marginBottom: 14 }}>
      <label className="photo-upload-btn">
        <Camera size={18} />
        <span>{compressing ? "Optimizando…" : file ? "Cambiar foto" : "Elegir foto"}</span>
        <input type="file" accept="image/*" onChange={onPick} style={{ display: "none" }} disabled={compressing} />
      </label>

      {preview && (
        <div className="photo-preview"><img src={preview} alt="preview" /></div>
      )}

      <div className="side-grid two">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <NumInput placeholder="Peso (kg, opcional)" value={weight} onChange={setWeight} />
      </div>
      <NumInput placeholder="Cintura (cm, opcional)" value={waist} onChange={setWaist} />
      <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" />
      <button className="save-btn" disabled={!file || saving || compressing} onClick={submit}>{saving ? "Subiendo…" : "Guardar foto"}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function HistorialTab({ logs, deleteLog, updateLog }) {
  const [editingId, setEditingId] = useState(null);
  const grouped = useMemo(() => {
    const byDate = {};
    [...logs].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((l) => {
      if (!byDate[l.date]) byDate[l.date] = [];
      byDate[l.date].push(l);
    });
    return Object.entries(byDate);
  }, [logs]);

  if (grouped.length === 0) {
    return <div className="tabpane"><div className="empty">Todavía no hay sets registrados. Andá a la pestaña "Hoy" y cargá el primero.</div></div>;
  }

  return (
    <div className="tabpane">
      {grouped.map(([date, entries]) => (
        <div key={date} className="hist-group">
          <div className="hist-date">{fmtDateLabel(date)}</div>
          <div className="cardlist">
            {entries.map((l) =>
              editingId === l.id ? (
                <HistEditRow
                  key={l.id}
                  log={l}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => { updateLog(l.id, patch); setEditingId(null); }}
                />
              ) : (
                <div key={l.id} className="hist-row">
                  <div>
                    <div className="hist-ex">{l.exerciseName}</div>
                    <div className="hist-detail mono">
                      {l.unilateral
                        ? `Der ${fmtNum(l.weightR)}kg×${fmtNum(l.repsR)} · Izq ${fmtNum(l.weightL)}kg×${fmtNum(l.repsL)}`
                        : `${fmtNum(l.weight)}kg${l.reps ? ` × ${l.reps} reps` : ""}`}
                      {l.rir != null ? ` · RIR ${l.rir}` : ""}
                    </div>
                  </div>
                  <div className="hist-actions">
                    <button className="del-btn" onClick={() => setEditingId(l.id)}><Pencil size={15} /></button>
                    <button className="del-btn" onClick={() => deleteLog(l.id)}><Trash2 size={15} /></button>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistEditRow({ log, onCancel, onSave }) {
  const [weight, setWeight] = useState(toInput(log.weight));
  const [reps, setReps] = useState(toInput(log.reps));
  const [weightR, setWeightR] = useState(toInput(log.weightR));
  const [repsR, setRepsR] = useState(toInput(log.repsR));
  const [weightL, setWeightL] = useState(toInput(log.weightL));
  const [repsL, setRepsL] = useState(toInput(log.repsL));
  const [rir, setRir] = useState(toInput(log.rir));

  function submit() {
    const rirNum = toNum(rir);
    if (log.unilateral) {
      const wR = toNum(weightR), wL = toNum(weightL);
      if (wR == null && wL == null) return;
      onSave({ weightR: wR, repsR: toNum(repsR), weightL: wL, repsL: toNum(repsL), rir: rirNum });
    } else {
      const w = toNum(weight);
      if (w == null) return;
      onSave({ weight: w, reps: toNum(reps), rir: rirNum });
    }
  }

  return (
    <div className="card">
      <div className="hist-ex">{log.exerciseName}</div>
      <div className="card-form">
        {log.unilateral ? (
          <div className="side-grid">
            <div className="side-col">
              <div className="side-label accent">Derecho</div>
              <NumInput placeholder="kg" value={weightR} onChange={setWeightR} />
              <NumInput placeholder="reps" decimal={false} value={repsR} onChange={setRepsR} />
            </div>
            <div className="side-col">
              <div className="side-label accent2">Izquierdo</div>
              <NumInput placeholder="kg" value={weightL} onChange={setWeightL} />
              <NumInput placeholder="reps" decimal={false} value={repsL} onChange={setRepsL} />
            </div>
          </div>
        ) : (
          <div className="side-grid two">
            <div className="side-col">
              <div className="side-label muted">Peso (kg)</div>
              <NumInput placeholder="kg" value={weight} onChange={setWeight} />
            </div>
            <div className="side-col">
              <div className="side-label muted">Reps</div>
              <NumInput placeholder="reps" decimal={false} value={reps} onChange={setReps} />
            </div>
          </div>
        )}
        <NumInput placeholder="RIR (opcional, 0-10)" decimal={false} value={rir} onChange={setRir} />
        <div className="edit-actions">
          <button className="cancel-btn" onClick={onCancel}>Cancelar</button>
          <button className="save-btn" onClick={submit}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const RPE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ENERGY_LABELS = { 1: "Muy baja", 2: "Baja", 3: "Media", 4: "Buena", 5: "Muy buena" };

// Respaldo descargable de todo el historial (ver exportAllData en App()).
// El archivo se arma y descarga del lado del navegador -- no hay servidor
// de por medio, asi que no hace falta nada mas para que esto funcione.
function ExportSection({ onExport }) {
  const [exporting, setExporting] = useState(false);

  async function handleClick() {
    if (exporting) return;
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="card">
      <div className="section-title">Exportar mis datos</div>
      <div className="section-sub">
        Descargá un archivo con todo tu historial (entrenamientos, peso, comidas, suplementos) como respaldo propio. No incluye los archivos de las fotos de progreso, solo sus datos.
      </div>
      <button className="save-btn" style={{ marginTop: 10 }} onClick={handleClick} disabled={exporting}>
        {exporting ? "Preparando…" : "Descargar backup (.json)"}
      </button>
    </section>
  );
}

function MasTab({
  activityLogs, addActivity, deleteActivity, checkins, saveCheckin,
  supplements, supplementLogs, addSupplement, toggleSupplementActive, deleteSupplement, toggleSupplementToday,
  onExport,
}) {
  const todaysCheckin = checkins.find((c) => c.date === todayISO()) || null;
  const recentActivities = useMemo(
    () => [...activityLogs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8),
    [activityLogs]
  );

  return (
    <div className="tabpane">
      <ActivityForm onSave={addActivity} />

      {recentActivities.length > 0 && (
        <section className="card">
          <div className="section-title">Actividades recientes</div>
          <div className="cardlist" style={{ marginTop: 8 }}>
            {recentActivities.map((a) => (
              <div key={a.id} className="hist-row">
                <div>
                  <div className="hist-ex">{a.name}</div>
                  <div className="hist-detail mono">
                    {fmtShort(a.date)} · {a.durationMin ? `${a.durationMin} min` : "sin duración"}
                    {a.intensityRpe != null ? ` · RPE ${a.intensityRpe}` : ""}
                    {a.usedWatch ? " · con reloj" : " · estimado"}
                  </div>
                  {a.notes && <div className="hist-detail" style={{ marginTop: 2 }}>{a.notes}</div>}
                </div>
                <div className="hist-actions">
                  <button className="del-btn" onClick={() => deleteActivity(a.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <CheckinForm existing={todaysCheckin} onSave={saveCheckin} />

      <SupplementsSection
        supplements={supplements}
        supplementLogs={supplementLogs}
        addSupplement={addSupplement}
        toggleSupplementActive={toggleSupplementActive}
        deleteSupplement={deleteSupplement}
        toggleSupplementToday={toggleSupplementToday}
      />

      <ExportSection onExport={onExport} />
    </div>
  );
}

function ActivityForm({ onSave }) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("");
  const [rpe, setRpe] = useState(null);
  const [usedWatch, setUsedWatch] = useState(false);
  const [avgHr, setAvgHr] = useState("");
  const [notes, setNotes] = useState("");

  function quickPick(n) {
    setName(n);
  }

  function submit() {
    if (!name.trim()) return;
    onSave({
      date: todayISO(),
      name: name.trim(),
      durationMin: toNum(duration),
      intensityRpe: rpe,
      usedWatch,
      avgHr: usedWatch ? toNum(avgHr) : null,
      notes: notes.trim(),
    });
    setName(""); setDuration(""); setRpe(null); setUsedWatch(false); setAvgHr(""); setNotes("");
  }

  return (
    <section className="card">
      <div className="section-title">Otra actividad</div>
      <div className="section-sub">Boxeo, krav maga, cardio suelto — lo que no es parte del split de pesas</div>

      <div className="chiprow" style={{ marginBottom: 10 }}>
        {["Boxeo", "Krav Maga", "Cardio"].map((n) => (
          <button key={n} className={"chip" + (name === n ? " chip-active" : "")} onClick={() => quickPick(n)}>{n}</button>
        ))}
      </div>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la actividad" />

      <div className="side-grid two" style={{ marginTop: 10 }}>
        <NumInput placeholder="Duración (min)" decimal={false} value={duration} onChange={setDuration} />
        <label className="uni-toggle" style={{ justifyContent: "center", border: "1px solid rgba(237,234,227,0.14)", borderRadius: 10, padding: "10px 0" }}>
          <input type="checkbox" checked={usedWatch} onChange={(e) => setUsedWatch(e.target.checked)} />
          <span>Llevé el reloj</span>
        </label>
      </div>

      {usedWatch && (
        <div style={{ marginTop: 10 }}>
          <NumInput placeholder="FC promedio (opcional)" decimal={false} value={avgHr} onChange={setAvgHr} />
        </div>
      )}

      <div className="edit-label" style={{ marginTop: 12 }}>Intensidad percibida (RPE 1-10)</div>
      <div className="rpe-row">
        {RPE_OPTIONS.map((n) => (
          <button key={n} className={"rpe-btn" + (rpe === n ? " rpe-active" : "")} onClick={() => setRpe(n)}>{n}</button>
        ))}
      </div>

      <input className="input" style={{ marginTop: 10 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" />
      <button className="save-btn" onClick={submit}>Guardar actividad</button>
    </section>
  );
}

function CheckinForm({ existing, onSave }) {
  const [energy, setEnergy] = useState(existing?.energy ?? null);
  const [soreness, setSoreness] = useState(existing?.soreness ?? null);
  const [pain, setPain] = useState(existing?.pain || {});
  const [notes, setNotes] = useState(existing?.notes || "");

  useEffect(() => {
    setEnergy(existing?.energy ?? null);
    setSoreness(existing?.soreness ?? null);
    setPain(existing?.pain || {});
    setNotes(existing?.notes || "");
  }, [existing?.date]);

  function setPainZone(key, v) {
    setPain((prev) => ({ ...prev, [key]: v === "" ? undefined : Number(v) }));
  }

  function submit() {
    const cleanPain = {};
    Object.entries(pain).forEach(([k, v]) => {
      if (v != null && v !== "" && Number(v) > 0) cleanPain[k] = Number(v);
    });
    onSave({ date: todayISO(), energy, soreness, pain: cleanPain, notes: notes.trim() });
  }

  return (
    <section className="card">
      <div className="section-title">Chequeo de hoy</div>
      <div className="section-sub">Energía, fatiga muscular y dolor por zona — 5 segundos</div>

      <div className="edit-label">Energía</div>
      <div className="rpe-row five">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={"rpe-btn" + (energy === n ? " rpe-active" : "")} onClick={() => setEnergy(n)} title={ENERGY_LABELS[n]}>{n}</button>
        ))}
      </div>

      <div className="edit-label" style={{ marginTop: 12 }}>Fatiga muscular (opcional)</div>
      <div className="rpe-row five">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={"rpe-btn" + (soreness === n ? " rpe-active" : "")} onClick={() => setSoreness(n)}>{n}</button>
        ))}
      </div>

      <div className="edit-label" style={{ marginTop: 12 }}>Dolor por zona (0-10, dejar en blanco si no duele)</div>
      <div className="pain-grid">
        {PAIN_ZONES.map((z) => (
          <label key={z.key} className="pain-field">
            <span className="target-cap">{z.label}</span>
            <NumInput className="input target-input" decimal={false} placeholder="0"
              value={pain[z.key] != null ? String(pain[z.key]) : ""}
              onChange={(v) => setPainZone(z.key, v)} />
          </label>
        ))}
      </div>

      <input className="input" style={{ marginTop: 12 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" />
      <button className="save-btn" onClick={submit}>{existing ? "Actualizar chequeo" : "Guardar chequeo"}</button>
    </section>
  );
}

function SupplementsSection({
  supplements, supplementLogs, addSupplement, toggleSupplementActive, deleteSupplement, toggleSupplementToday,
}) {
  const today = todayISO();
  const active = supplements.filter((s) => s.active);
  const inactive = supplements.filter((s) => !s.active);

  function adherence7(supplementId) {
    const from = daysAgoISO(6);
    return supplementLogs.filter((l) => l.supplementId === supplementId && l.date >= from && l.date <= today).length;
  }

  return (
    <section className="card">
      <div className="section-title">Suplementos</div>
      <div className="section-sub">Marcá lo que tomaste hoy — la adherencia queda como otra señal para el Coach</div>

      <AddSupplementForm onSave={addSupplement} />

      {active.length === 0 ? (
        <div className="empty small">Todavía no agregaste ningún suplemento.</div>
      ) : (
        <div className="cardlist" style={{ marginTop: 8 }}>
          {active.map((s) => {
            const takenToday = supplementLogs.some((l) => l.supplementId === s.id && l.date === today);
            const count7 = adherence7(s.id);
            return (
              <div key={s.id} className="supp-row">
                <label className="supp-check">
                  <input type="checkbox" checked={takenToday} onChange={() => toggleSupplementToday(s.id)} />
                  <div>
                    <div className="hist-ex">{s.name}{s.dose ? ` · ${s.dose}` : ""}</div>
                    <div className="hist-detail mono">{s.timing || "sin horario fijo"} · {count7}/7 últimos días</div>
                  </div>
                </label>
                <div className="hist-actions">
                  <button className="del-btn" title="Pausar" onClick={() => toggleSupplementActive(s.id, false)}><X size={15} /></button>
                  <button className="del-btn" onClick={() => deleteSupplement(s.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {inactive.length > 0 && (
        <>
          <div className="edit-label" style={{ marginTop: 14 }}>Pausados</div>
          <div className="cardlist" style={{ marginTop: 8 }}>
            {inactive.map((s) => (
              <div key={s.id} className="hist-row">
                <div className="hist-ex" style={{ color: "#5C6470" }}>{s.name}{s.dose ? ` · ${s.dose}` : ""}</div>
                <div className="hist-actions">
                  <button className="del-btn" title="Reactivar" onClick={() => toggleSupplementActive(s.id, true)}><Plus size={15} /></button>
                  <button className="del-btn" onClick={() => deleteSupplement(s.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function AddSupplementForm({ onSave }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [timing, setTiming] = useState(null);

  function submit() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), dose: dose.trim(), timing });
    setName(""); setDose(""); setTiming(null);
  }

  return (
    <div className="card-form" style={{ marginBottom: 14 }}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Creatina)" />
      <input className="input" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dosis (ej: 5g, opcional)" />
      <div className="edit-label">Horario habitual</div>
      <div className="chiprow wrap">
        {["Mañana", "Pre-entreno", "Post-entreno", "Noche"].map((t) => (
          <button key={t} className={"chip" + (timing === t ? " chip-active" : "")} onClick={() => setTiming(timing === t ? null : t)}>{t}</button>
        ))}
      </div>
      <button className="save-btn" onClick={submit}>Agregar suplemento</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proteinas seleccionables: las que tienen al menos una combinacion en el
// banco (no tiene sentido ofrecer "whey" o "queso cottage" como "que tengo
// en la heladera para cocinar hoy").
const MEAL_IDEA_PROTEINS = Object.keys(MEAL_COMBOS)
  .map((id) => FOOD_DB.find((f) => f.id === id))
  .filter(Boolean);

// Pestañas de tipo de comida: cada una con su propia logica de sugerencia.
// Cena reusa el flujo original (tildar que proteina tenes -> un plato
// completo). Merienda/pre/post muestran directo las 2-3 opciones del banco
// de SNACK_COMBOS, sin paso de seleccion (son listas cortas, mas rapido
// mostrarlas todas que hacer tildar algo primero).
const MEAL_IDEA_TABS = [
  { key: "cena", label: "Cena" },
  { key: "merienda", label: "Merienda" },
  { key: "pre_entreno", label: "Pre-entreno" },
  { key: "post_entreno", label: "Post-entreno" },
];
const MEAL_IDEA_TITLES = {
  cena: "¿Qué cocino hoy?",
  merienda: "Ideas para la merienda",
  pre_entreno: "Antes de entrenar",
  post_entreno: "Después de entrenar",
};
const MEAL_IDEA_SUBTITLES = {
  cena: "Tildá lo que tenés a mano y te tiro una idea concreta",
  merienda: "Opciones fáciles, sin cocinar",
  pre_entreno: "Carbohidrato rápido + proteína liviana, para no entrenar pesado",
  post_entreno: "Proteína y carbohidrato para recuperar después del entrenamiento",
};

// "Que cocino hoy" / meriendas / pre / post: sin IA, banco curado fijo
// (MEAL_COMBOS y SNACK_COMBOS). En Cena la sugerencia rota por fecha asi no
// es siempre la misma, y "Otra idea" fuerza otra opcion para la misma
// seleccion. No registra nada en Nutricion -- es solo una idea, cargarla
// despues en "Nueva comida" es una accion aparte y deliberada.
function MealIdeaCard({ targets, totals }) {
  const [open, setOpen] = useState(false);
  const [mealType, setMealType] = useState("cena");
  const [selected, setSelected] = useState([]);
  const [cycleSeed, setCycleSeed] = useState(0);

  function toggleProtein(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    setCycleSeed(0); // nueva seleccion, arrancar de la primera idea de nuevo
  }

  const combos = useMemo(() => {
    const today = todayISO();
    return selected.map((proteinId) => pickMealCombo(proteinId, seedFromString(today + proteinId) + cycleSeed)).filter(Boolean);
  }, [selected, cycleSeed]);

  const remainingKcal = targets?.calories != null ? Math.round(targets.calories - totals.calories) : null;
  const remainingProtein = targets?.protein != null ? Math.round((targets.protein - totals.protein) * 10) / 10 : null;
  const remainingNote = remainingKcal != null && (
    <div className="section-sub" style={{ marginTop: 10, marginBottom: 0 }}>
      Hoy te quedan {fmtNum(Math.max(0, remainingKcal))} kcal{remainingProtein != null ? ` y ${fmtNum(Math.max(0, remainingProtein))}g de proteína` : ""} para cubrir.
    </div>
  );

  return (
    <section className="card">
      <button className="card-head" onClick={() => setOpen(!open)}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>{MEAL_IDEA_TITLES[mealType]}</div>
          <div className="section-sub" style={{ marginBottom: 0 }}>{MEAL_IDEA_SUBTITLES[mealType]}</div>
        </div>
        <div className={"card-icon" + (open ? " open" : "")}>{open ? <X size={16} /> : <Plus size={16} />}</div>
      </button>

      {open && (
        <div className="card-form">
          <div className="chiprow wrap" style={{ marginBottom: 4 }}>
            {MEAL_IDEA_TABS.map((t) => (
              <button key={t.key} className={"chip" + (mealType === t.key ? " chip-active" : "")} onClick={() => setMealType(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {mealType === "cena" ? (
            <>
              <div className="chiprow wrap" style={{ marginTop: 10 }}>
                {MEAL_IDEA_PROTEINS.map((f) => (
                  <button key={f.id} className={"chip" + (selected.includes(f.id) ? " chip-active" : "")} onClick={() => toggleProtein(f.id)}>
                    {f.name}
                  </button>
                ))}
              </div>

              {selected.length === 0 ? (
                <div className="empty small">Tildá al menos una proteína que tengas hoy.</div>
              ) : (
                <>
                  <div className="cardlist" style={{ marginTop: 10 }}>
                    {combos.map((combo) => {
                      const m = computeComboMacros(combo);
                      const proteinFood = FOOD_DB.find((f) => f.id === combo.proteinId);
                      const carbFood = FOOD_DB.find((f) => f.id === combo.carb);
                      const vegFood = combo.veg ? FOOD_DB.find((f) => f.id === combo.veg) : null;
                      // Cada plato dice su propia porcion con el nombre exacto
                      // del alimento (no "proteína"/"carbohidrato" generico)
                      // para que el numero se entienda sin tener que adivinar
                      // a que corresponde.
                      const portionParts = [
                        proteinFood ? `${fmtNum(MEAL_COMBO_PORTIONS.protein)}g de ${proteinFood.name}` : null,
                        carbFood ? `${fmtNum(MEAL_COMBO_PORTIONS.carb)}g de ${carbFood.name}` : null,
                        vegFood ? `${fmtNum(MEAL_COMBO_PORTIONS.veg)}g de ${vegFood.name}` : null,
                      ].filter(Boolean);
                      return (
                        <div key={combo.proteinId} className="meal-idea">
                          <div className="hist-ex">{combo.title}</div>
                          <div className="hist-detail" style={{ marginTop: 2 }}>{combo.prep}</div>
                          <div className="hist-detail" style={{ marginTop: 6 }}>{portionParts.join(" · ")}</div>
                          <div className="hist-detail mono" style={{ marginTop: 4 }}>
                            ≈{fmtNum(m.kcal)} kcal · P {fmtNum(Number(m.protein.toFixed(1)))}g · C {fmtNum(Number(m.carbs.toFixed(1)))}g · G {fmtNum(Number(m.fat.toFixed(1)))}g
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="section-sub" style={{ marginTop: 8 }}>Porciones de referencia — ajustá a ojo según tu hambre y lo que te quede del día.</div>
                  <button className="cancel-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setCycleSeed((s) => s + 1)}>
                    Otra idea
                  </button>
                  {remainingNote}
                </>
              )}
            </>
          ) : (
            <>
              <div className="cardlist" style={{ marginTop: 10 }}>
                {SNACK_COMBOS[mealType].map((combo, i) => {
                  const m = computeItemsMacros(combo.items);
                  return (
                    <div key={i} className="meal-idea">
                      <div className="hist-ex">{combo.title}</div>
                      <div className="hist-detail" style={{ marginTop: 2 }}>{combo.prep}</div>
                      <div className="hist-detail" style={{ marginTop: 6 }}>{itemsLabel(combo.items)}</div>
                      <div className="hist-detail mono" style={{ marginTop: 4 }}>
                        ≈{fmtNum(m.kcal)} kcal · P {fmtNum(Number(m.protein.toFixed(1)))}g · C {fmtNum(Number(m.carbs.toFixed(1)))}g · G {fmtNum(Number(m.fat.toFixed(1)))}g
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="section-sub" style={{ marginTop: 8 }}>Cantidades de referencia — ajustá a ojo.</div>
              {remainingNote}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function NutricionTab({ targets, saveTargets, mealLogs, addMeal, deleteMeal, bwLogs, logs, config, activityLogs }) {
  // Que dia se esta viendo/cargando: por defecto hoy, pero se puede mover a
  // cualquier dia anterior (ej. para cargar una cena de madrugada que quedo
  // sin registrar, o completar comidas de ayer). Nunca se permite ir a futuro.
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const isToday = selectedDate === todayISO();

  const latestWeight = useMemo(() => {
    const sorted = [...bwLogs].filter((b) => b.weight != null).sort((a, b) => (a.date < b.date ? 1 : -1));
    return sorted[0]?.weight ?? null;
  }, [bwLogs]);
  const latestWaist = useMemo(() => {
    const sorted = [...bwLogs].filter((b) => b.waist != null).sort((a, b) => (a.date < b.date ? 1 : -1));
    return sorted[0]?.waist ?? null;
  }, [bwLogs]);

  const selectedMeals = useMemo(
    () => mealLogs.filter((m) => m.date === selectedDate),
    [mealLogs, selectedDate]
  );
  const totals = useMemo(() => {
    const raw = selectedMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories || 0),
        protein: acc.protein + (m.protein || 0),
        carbs: acc.carbs + (m.carbs || 0),
        fat: acc.fat + (m.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return {
      calories: Math.round(raw.calories),
      protein: Math.round(raw.protein * 10) / 10,
      carbs: Math.round(raw.carbs * 10) / 10,
      fat: Math.round(raw.fat * 10) / 10,
    };
  }, [selectedMeals]);

  const isRestDay = useMemo(() => !DAY_KEY_BY_WEEKDAY[weekdayOfISO(selectedDate)], [selectedDate]);
  const activityKcal = useMemo(() => {
    return activityLogs
      .filter((a) => a.date === selectedDate)
      .reduce((sum, a) => sum + computeActivityKcal(a, latestWeight), 0);
  }, [activityLogs, latestWeight, selectedDate]);

  const effectiveTargets = useMemo(
    () => computeEffectiveTargets(targets, { isRestDay, activityKcal }),
    [targets, isRestDay, activityKcal]
  );

  const [suggestFoodId, setSuggestFoodId] = useState(null);
  const dayVerdict = useMemo(
    () => computeDayVerdict({ totals, targets: effectiveTargets, logs, config, suggestFoodId, dateISO: selectedDate, isToday }),
    [totals, effectiveTargets, logs, config, suggestFoodId, selectedDate, isToday]
  );

  return (
    <div className="tabpane">
      <TargetsCard targets={targets} onSave={saveTargets} latestWeight={latestWeight} />

      <DayVerdictCard verdict={dayVerdict} onPickFood={setSuggestFoodId} />

      <MealIdeaCard targets={effectiveTargets} totals={totals} />

      <GoalCard
        targets={targets}
        onSave={saveTargets}
        latestWeight={latestWeight}
        latestWaist={latestWaist}
      />

      <section className="card">
        <div className="date-nav">
          <input
            className="input date-nav-input"
            type="date"
            value={selectedDate}
            max={todayISO()}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          />
          {!isToday && (
            <button className="cancel-btn" onClick={() => setSelectedDate(todayISO())}>Volver a hoy</button>
          )}
        </div>
        <div className="section-title" style={{ marginTop: 12 }}>{isToday ? "Hoy" : fmtDateLabel(selectedDate)}</div>
        <div className="section-sub">
          Comidas registradas vs. objetivo diario
          {effectiveTargets?.adjustmentNotes?.length > 0 ? ` (ajustado: ${effectiveTargets.adjustmentNotes.join(", ")})` : ""}
        </div>
        {effectiveTargets ? (
          <div className="cardlist">
            <MacroBar label="Kcal" value={totals.calories} target={effectiveTargets.calories} unit="" colorClass="bar-accent" />
            <MacroBar label="Prot" value={totals.protein} target={effectiveTargets.protein} unit="g" colorClass="bar-accent2" />
            <MacroBar label="Carb" value={totals.carbs} target={effectiveTargets.carbs} unit="g" colorClass="bar-accent" />
            <MacroBar label="Gras" value={totals.fat} target={effectiveTargets.fat} unit="g" colorClass="bar-accent2" />
          </div>
        ) : (
          <div className="empty small">Definí tus objetivos arriba para ver el avance del día.</div>
        )}
      </section>

      <MealForm onSave={addMeal} date={selectedDate} isToday={isToday} />

      {selectedMeals.length > 0 && (
        <section className="card">
          <div className="section-title">{isToday ? "Comidas de hoy" : `Comidas del ${fmtDateLabel(selectedDate)}`}</div>
          <div className="cardlist" style={{ marginTop: 8 }}>
            {selectedMeals.map((m) => (
              <div key={m.id} className="hist-row">
                <div>
                  <div className="hist-ex">{m.mealType ? `${m.mealType} · ` : ""}{m.name}</div>
                  <div className="hist-detail mono">
                    {m.calories != null ? `${fmtNum(m.calories)} kcal` : "kcal ?"}
                    {m.protein != null ? ` · P ${fmtNum(m.protein)}g` : ""}
                    {m.carbs != null ? ` · C ${fmtNum(m.carbs)}g` : ""}
                    {m.fat != null ? ` · G ${fmtNum(m.fat)}g` : ""}
                  </div>
                  {m.notes && <div className="hist-detail" style={{ marginTop: 2 }}>{m.notes}</div>}
                </div>
                <div className="hist-actions">
                  <button className="del-btn" onClick={() => deleteMeal(m.id)}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const DAY_KEY_BY_WEEKDAY = { 1: "lun", 2: "mar", 3: "mie", 4: "jue", 5: "vie" };

// Tope de una porcion realista de una sola vez -- evita sugerir algo como
// "750g de atun" en una sola comida. Si lo que falta supera el tope, se
// sugiere el tope igual y se avisa que es parcial (repartir en mas de una
// comida), en vez de mentir con una porcion gigante.
const MAX_SINGLE_PORTION_G = 300;
const MAX_SINGLE_PORTION_UNITS = 4;

// Calcula cuanto de UN alimento puntual (elegido por el usuario o el mejor
// por defecto) hace falta para cubrir la proteina que falta, respetando el
// tope de porcion realista.
function computeFoodQtyForProtein(foodId, remainingProtein) {
  const food = FOOD_DB.find((f) => f.id === foodId);
  if (!food || remainingProtein <= 0) return null;

  let qty, capped = false;
  if (food.unit) {
    const rawQty = Math.max(1, Math.ceil((remainingProtein / food.protein) * 2) / 2);
    if (rawQty > MAX_SINGLE_PORTION_UNITS) { qty = MAX_SINGLE_PORTION_UNITS; capped = true; }
    else qty = rawQty;
  } else {
    const rawGrams = Math.max(20, Math.round((remainingProtein / food.protein) * 100 / 10) * 10);
    if (rawGrams > MAX_SINGLE_PORTION_G) { qty = MAX_SINGLE_PORTION_G; capped = true; }
    else qty = rawGrams;
  }

  const factor = food.unit ? qty : qty / 100;
  const kcal = Math.round(food.kcal * factor);
  const protein = Number((food.protein * factor).toFixed(1));
  const label = food.unit
    ? `${fmtNum(qty)} ${qty === 1 ? food.unitWord : food.unitWordPlural} de ${food.name}`
    : `${fmtNum(qty)} g de ${food.name}`;

  return { foodId: food.id, label, kcal, protein, capped };
}

// Si no se eligio un alimento puntual, busca en FOOD_DB el mas eficiente
// (mas proteina por kcal) para sugerir algo concreto por defecto.
function bestProteinFoodId() {
  const proteinFoods = FOOD_DB.filter((f) => f.cat === "Proteínas");
  return [...proteinFoods].sort((a, b) => b.protein / b.kcal - a.protein / a.kcal)[0]?.id ?? null;
}

function suggestFoodForProtein(remainingProtein, chosenFoodId) {
  if (remainingProtein <= 0) return null;
  const foodId = chosenFoodId || bestProteinFoodId();
  if (!foodId) return null;
  return computeFoodQtyForProtein(foodId, remainingProtein);
}

// Estimacion gratuita de gasto energetico de una actividad, por METs segun
// el RPE cargado (no depende del reloj) y el peso actual: kcal/min = MET x
// 3.5 x peso(kg) / 200 -- formula estandar de fisiologia del ejercicio.
function metForRpe(rpe) {
  if (rpe == null) return 5;
  if (rpe <= 3) return 3;
  if (rpe <= 6) return 6;
  if (rpe <= 8) return 8;
  return 10;
}
function computeActivityKcal(activity, weightKg) {
  if (!activity?.durationMin || !weightKg) return 0;
  const met = metForRpe(activity.intensityRpe);
  return Math.round((met * 3.5 * weightKg / 200) * activity.durationMin);
}

// Ajusta el objetivo base del dia (el que se guarda fijo en "Objetivos
// diarios") segun el tipo de dia: en descanso baja un poco los carbohidratos
// (la proteina nunca se toca, para no resignar preservacion muscular); si
// hubo actividad extra hoy, suma esas kcal como carbohidratos para reponer
// lo gastado. Nunca modifica lo guardado, solo lo que se muestra hoy.
function computeEffectiveTargets(targets, { isRestDay, activityKcal }) {
  if (!targets) return null;
  let carbs = targets.carbs || 0;
  let calories = targets.calories || 0;
  const notes = [];

  if (isRestDay && carbs > 0) {
    const cut = Math.round(carbs * 0.15);
    carbs = Math.max(0, carbs - cut);
    calories -= cut * 4;
    notes.push(`descanso: -${fmtNum(cut)}g carbos`);
  }
  if (activityKcal > 0) {
    const bonusCarbs = Math.round(activityKcal / 4);
    carbs += bonusCarbs;
    calories += bonusCarbs * 4;
    notes.push(`actividad de hoy: +${fmtNum(bonusCarbs)}g carbos (~${fmtNum(activityKcal)} kcal)`);
  }

  return { ...targets, carbs, calories, adjustmentNotes: notes };
}

// Sugerencia simple y gratuita para compensar un exceso de calorias: una
// caminata a paso rapido (estimacion general ~5 kcal/min) o aligerar la
// proxima comida. No reemplaza un dato real de gasto energetico, es una
// referencia practica.
function suggestFixForExcess(overKcalBy) {
  const walkMin = Math.max(10, Math.round(overKcalBy / 5 / 5) * 5);
  return `Para compensar: una caminata rápida de ~${walkMin} min, o aligerá la próxima comida (menos carbos y grasas).`;
}

// Arma en una frase lo que falta hoy para ir en linea con el objetivo:
// cuanta comida (kcal/proteina) queda por cargar, y si ya se registro el
// entrenamiento del dia (segun el split lunes-viernes; sabado/domingo es
// descanso y no se evalua entrenamiento).
function computeDayVerdict({ totals, targets, logs, config, suggestFoodId, dateISO, isToday }) {
  const dayWord = isToday ? "hoy" : "ese día";
  if (!targets) {
    return { tone: "info", text: `Definí tus objetivos diarios arriba para ver acá qué falta ${dayWord}.` };
  }

  const weekday = weekdayOfISO(dateISO);
  const dayKey = DAY_KEY_BY_WEEKDAY[weekday] || null;
  const isRestDay = !dayKey;
  const trainedThatDay = logs.some((l) => l.date === dateISO && (!dayKey || l.day === dayKey));

  const kcalTarget = targets.calories || 0;
  const proteinTarget = targets.protein || 0;
  const remainingKcal = Math.round(kcalTarget - totals.calories);
  const remainingProtein = Math.round((proteinTarget - totals.protein) * 10) / 10;
  const overKcalBy = -remainingKcal;

  const parts = [];
  let worstTone = "ok";
  let suggestion = null;
  let proteinGapFood = null;

  if (kcalTarget > 0 && overKcalBy > kcalTarget * 0.1) {
    parts.push(`te pasaste por ${fmtNum(overKcalBy)} kcal`);
    worstTone = "danger";
    suggestion = suggestFixForExcess(overKcalBy);
  } else {
    if (remainingKcal > Math.max(50, kcalTarget * 0.05)) {
      parts.push(`te quedan ${fmtNum(remainingKcal)} kcal`);
      if (worstTone === "ok") worstTone = "warn";
    }
    if (remainingProtein > 5) {
      parts.push(`${fmtNum(remainingProtein)}g de proteína`);
      if (worstTone === "ok") worstTone = "warn";
      const food = suggestFoodForProtein(remainingProtein, suggestFoodId);
      if (food) {
        proteinGapFood = food;
        suggestion = `Con ${food.label} (~${fmtNum(food.kcal)} kcal, ${fmtNum(food.protein)}g proteína) ${
          food.capped ? "cubrís una parte — el resto sumalo en otra comida." : "lo cubrís."
        }`;
      }
    }
  }

  if (!isRestDay && !trainedThatDay) {
    const focus = config?.[dayKey]?.focus;
    parts.push(`todavía no cargaste el entrenamiento de ${dayWord}${focus ? ` (${focus})` : ""}`);
    worstTone = worstTone === "danger" ? "danger" : "warn";
  }

  if (parts.length === 0) {
    const trainingBit = isRestDay ? `${dayWord} es descanso` : (isToday ? "ya entrenaste" : "entrenaste ese día");
    return { tone: "ok", text: `Vas perfecto: cumpliste con la comida y ${trainingBit}.`, suggestion: null, proteinGapFood: null };
  }

  const joined =
    parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " y " + parts[parts.length - 1];

  return { tone: worstTone, text: `Te falta: ${joined}.`, suggestion, proteinGapFood };
}

const PROTEIN_FOODS = FOOD_DB.filter((f) => f.cat === "Proteínas");

function DayVerdictCard({ verdict, onPickFood }) {
  return (
    <section className={"card verdict-card verdict-" + verdict.tone}>
      <div className="verdict-text">{verdict.text}</div>
      {verdict.suggestion && <div className="verdict-suggestion">{verdict.suggestion}</div>}
      {verdict.proteinGapFood && (
        <div className="verdict-food-picker">
          <span>¿Tenés otra cosa a mano?</span>
          <div className="select-wrap select-wrap-sm">
            <select
              className="select"
              value={verdict.proteinGapFood.foodId}
              onChange={(e) => onPickFood(e.target.value)}
            >
              {PROTEIN_FOODS.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="select-chevron" />
          </div>
        </div>
      )}
    </section>
  );
}

function MacroBar({ label, value, target, unit, colorClass }) {
  const hasTarget = target && target > 0;
  const pct = hasTarget ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label mono">{label}</span>
      <div className="bar-track">
        {hasTarget && <div className={"bar-fill " + colorClass} style={{ width: `${pct}%` }} />}
      </div>
      <span
        className="bar-value mono"
        style={hasTarget ? { width: 84 } : { width: 108, color: "#8B93A0", fontSize: 10.5 }}
      >
        {hasTarget ? `${fmtNum(value)}${unit} / ${fmtNum(target)}${unit}` : `${fmtNum(value)}${unit} · sin objetivo`}
      </span>
    </div>
  );
}

// Objetivo diario automatico a partir del peso: manteniemiento ~33 kcal/kg
// (moderadamente activo, pesas 5x/semana) menos un deficit leve del 15% para
// bajar grasa sin resignar musculo; proteina alta (2.2 g/kg) para preservar
// masa magra en deficit; grasas en un piso saludable (0.8 g/kg); el resto,
// carbohidratos. Son las mismas cuentas que se usan para sugerir un plan de
// nutricion deportiva estandar -- el usuario puede ajustarlas a mano despues.
function computeAutoTargets(weightKg) {
  if (!weightKg || weightKg <= 0) return null;
  const maintenance = weightKg * 33;
  const calories = Math.round(maintenance * 0.85);
  const protein = Math.round(weightKg * 2.2);
  const fat = Math.round(weightKg * 0.8);
  const carbsKcal = calories - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(carbsKcal / 4));
  return { calories, protein, carbs, fat };
}

function AutoBreakdown({ weight, auto }) {
  const maintenance = Math.round(weight * 33);
  const proteinKcal = auto.protein * 4;
  const fatKcal = auto.fat * 9;
  const carbsKcal = auto.carbs * 4;
  return (
    <div className="breakdown">
      <div className="breakdown-row">
        <span>Mantenimiento estimado</span>
        <span className="mono">{fmtNum(weight)} kg × 33 kcal/kg = {fmtNum(maintenance)} kcal</span>
      </div>
      <div className="breakdown-row">
        <span>Déficit leve (15%)</span>
        <span className="mono">{fmtNum(maintenance)} × 0,85 = {fmtNum(auto.calories)} kcal</span>
      </div>
      <div className="breakdown-row">
        <span>Proteína</span>
        <span className="mono">{fmtNum(weight)} kg × 2,2 g/kg = {fmtNum(auto.protein)} g ({fmtNum(proteinKcal)} kcal)</span>
      </div>
      <div className="breakdown-row">
        <span>Grasas</span>
        <span className="mono">{fmtNum(weight)} kg × 0,8 g/kg = {fmtNum(auto.fat)} g ({fmtNum(fatKcal)} kcal)</span>
      </div>
      <div className="breakdown-row">
        <span>Carbohidratos</span>
        <span className="mono">resto de las kcal ÷ 4 = {fmtNum(auto.carbs)} g ({fmtNum(carbsKcal)} kcal)</span>
      </div>
      <div className="breakdown-note">
        Regla práctica para alguien que entrena pesas ~5 días/semana y quiere bajar grasa preservando músculo. No reemplaza un análisis de un nutricionista, pero es un punto de partida razonable — se recalcula solo cada vez que cargues un peso nuevo.
      </div>
    </div>
  );
}

function TargetsCard({ targets, onSave, latestWeight }) {
  const auto = useMemo(() => computeAutoTargets(latestWeight), [latestWeight]);
  const [calories, setCalories] = useState(targets?.calories != null ? toInput(targets.calories) : auto ? String(auto.calories) : "");
  const [protein, setProtein] = useState(targets?.protein != null ? toInput(targets.protein) : auto ? String(auto.protein) : "");
  const [carbs, setCarbs] = useState(targets?.carbs != null ? toInput(targets.carbs) : auto ? String(auto.carbs) : "");
  const [fat, setFat] = useState(targets?.fat != null ? toInput(targets.fat) : auto ? String(auto.fat) : "");
  const [editing, setEditing] = useState(!targets);
  const [showDetail, setShowDetail] = useState(false);

  function applyAuto() {
    if (!auto) return;
    setCalories(String(auto.calories));
    setProtein(String(auto.protein));
    setCarbs(String(auto.carbs));
    setFat(String(auto.fat));
  }

  function submit() {
    onSave({ calories: toNum(calories), protein: toNum(protein), carbs: toNum(carbs), fat: toNum(fat) });
    setEditing(false);
  }

  if (!editing && targets) {
    return (
      <section className="card">
        <button className="card-head" onClick={() => setEditing(true)}>
          <div>
            <div className="section-title" style={{ marginBottom: 2 }}>Objetivos diarios</div>
            <div className="section-sub mono" style={{ marginBottom: 0 }}>
              {fmtNum(targets.calories)} kcal · P {fmtNum(targets.protein)}g · C {fmtNum(targets.carbs)}g · G {fmtNum(targets.fat)}g
            </div>
          </div>
          <div className="card-icon"><Pencil size={15} /></div>
        </button>
        {auto && (
          <>
            <button className="link-btn" onClick={() => setShowDetail((v) => !v)}>
              {showDetail ? "Ocultar cálculo" : "¿Cómo se calcula esto?"}
            </button>
            {showDetail && <AutoBreakdown weight={latestWeight} auto={auto} />}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="card">
      <div className="section-title">Objetivos diarios</div>
      <div className="section-sub">
        {auto
          ? `Calculado según tu último peso registrado (${fmtNum(latestWeight)} kg) — déficit leve para bajar grasa preservando músculo. Lo podés ajustar.`
          : "Registrá tu peso en \"Progreso\" para poder calcularlo automático — mientras tanto, cargalo a mano."}
      </div>

      {auto && (
        <>
          <button
            className="save-btn"
            style={{ marginBottom: 4, background: "rgba(192,138,62,0.16)", color: "#C08A3E" }}
            onClick={applyAuto}
          >
            Calcular automático según mi peso
          </button>
          <button className="link-btn" onClick={() => setShowDetail((v) => !v)}>
            {showDetail ? "Ocultar cálculo" : "¿Cómo se calcula esto?"}
          </button>
          {showDetail && <AutoBreakdown weight={latestWeight} auto={auto} />}
        </>
      )}

      <div className="side-grid two" style={{ marginTop: 10 }}>
        <NumInput placeholder="Calorías (kcal)" decimal={false} value={calories} onChange={setCalories} />
        <NumInput placeholder="Proteína (g)" value={protein} onChange={setProtein} />
      </div>
      <div className="side-grid two" style={{ marginTop: 10 }}>
        <NumInput placeholder="Carbohidratos (g)" value={carbs} onChange={setCarbs} />
        <NumInput placeholder="Grasas (g)" value={fat} onChange={setFat} />
      </div>
      <button className="save-btn" onClick={submit}>Guardar objetivos</button>
    </section>
  );
}

// Estimacion de % de grasa corporal por el metodo de la Marina de EE.UU.
// (circunferencias: cintura, cuello, altura). No reemplaza un estudio real
// (DEXA/bioimpedancia de calidad), pero es el estandar gratuito mas usado
// cuando no se tiene acceso a eso -- margen de error tipico +-3-4%.
function computeBodyFatNavy({ weightKg, waistCm, neckCm, heightCm }) {
  if (!weightKg || !waistCm || !neckCm || !heightCm || waistCm <= neckCm) return null;
  const bf =
    495 /
      (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) -
    450;
  if (!isFinite(bf)) return null;
  return Math.round(Math.max(3, Math.min(50, bf)) * 10) / 10;
}

// A partir del % de grasa actual y el deficit calorico diario, estima cuanto
// falta (en kg) y cuantas semanas tomaria llegar a cada punta del rango de
// grasa corporal objetivo, asumiendo que la masa magra se mantiene fija
// (que es justamente el objetivo de la proteina alta ya configurada) y que
// 1 kg de grasa equivale a ~7700 kcal.
function computeGoalProgress({ weightKg, waistCm, neckCm, heightCm, targetBfLow, targetBfHigh, dailyDeficitKcal }) {
  const bf = computeBodyFatNavy({ weightKg, waistCm, neckCm, heightCm });
  if (bf == null) return null;

  const fatMass = Math.round(weightKg * (bf / 100) * 10) / 10;
  const leanMass = Math.round((weightKg - fatMass) * 10) / 10;
  const weeklyFatLossKg = dailyDeficitKcal > 0 ? (dailyDeficitKcal * 7) / 7700 : 0;

  function milestone(targetBf) {
    if (!targetBf) return null;
    const targetWeight = leanMass / (1 - targetBf / 100);
    const fatToLose = Math.round(Math.max(0, weightKg - targetWeight) * 10) / 10;
    const weeks = fatToLose > 0 && weeklyFatLossKg > 0 ? fatToLose / weeklyFatLossKg : 0;
    return { targetBf, targetWeight, fatToLose, weeks };
  }

  return {
    bf,
    fatMass,
    leanMass,
    weeklyFatLossKg,
    high: milestone(targetBfHigh), // punta mas alta del rango: primer hito, mas cerca
    low: milestone(targetBfLow), // punta mas baja del rango: meta final
  };
}

function GoalCard({ targets, onSave, latestWeight, latestWaist }) {
  const hasBaseData = targets?.heightCm && targets?.neckCm;
  const [editing, setEditing] = useState(!hasBaseData);
  const [heightCm, setHeightCm] = useState(targets?.heightCm != null ? toInput(targets.heightCm) : "");
  const [neckCm, setNeckCm] = useState(targets?.neckCm != null ? toInput(targets.neckCm) : "");
  const [targetBfLow, setTargetBfLow] = useState(targets?.targetBfLow != null ? toInput(targets.targetBfLow) : "12");
  const [targetBfHigh, setTargetBfHigh] = useState(targets?.targetBfHigh != null ? toInput(targets.targetBfHigh) : "15");

  function submit() {
    onSave({
      heightCm: toNum(heightCm),
      neckCm: toNum(neckCm),
      targetBfLow: toNum(targetBfLow),
      targetBfHigh: toNum(targetBfHigh),
    });
    setEditing(false);
  }

  const maintenance = latestWeight ? latestWeight * 33 : null;
  const dailyDeficitKcal = maintenance && targets?.calories ? maintenance - targets.calories : 0;

  const progress = useMemo(() => {
    if (!hasBaseData || !latestWeight || !latestWaist) return null;
    return computeGoalProgress({
      weightKg: latestWeight,
      waistCm: latestWaist,
      neckCm: targets.neckCm,
      heightCm: targets.heightCm,
      targetBfLow: targets.targetBfLow,
      targetBfHigh: targets.targetBfHigh,
      dailyDeficitKcal,
    });
  }, [hasBaseData, latestWeight, latestWaist, targets, dailyDeficitKcal]);

  if (!editing && hasBaseData) {
    return (
      <section className="card">
        <button className="card-head" onClick={() => setEditing(true)}>
          <div>
            <div className="section-title" style={{ marginBottom: 2 }}>Meta física</div>
            <div className="section-sub mono" style={{ marginBottom: 0 }}>
              {progress ? `${fmtNum(progress.bf)}% grasa estimada · meta ${fmtNum(targets.targetBfLow)}–${fmtNum(targets.targetBfHigh)}%` : "Cargá tu peso y cintura para ver el avance"}
            </div>
          </div>
          <div className="card-icon"><Pencil size={15} /></div>
        </button>

        {progress && (
          <div className="cardlist" style={{ marginTop: 10 }}>
            <div className="breakdown">
              <div className="breakdown-row">
                <span>Composición estimada</span>
                <span className="mono">
                  {fmtNum(progress.fatMass)} kg grasa · {fmtNum(progress.leanMass)} kg magra ({fmtNum(progress.bf)}%)
                </span>
              </div>
              {progress.high && progress.high.fatToLose > 0 && (
                <div className="breakdown-row">
                  <span>Primer hito ({fmtNum(targets.targetBfHigh)}%)</span>
                  <span className="mono">
                    faltan {fmtNum(progress.high.fatToLose)} kg
                    {progress.weeklyFatLossKg > 0 ? ` · ~${Math.ceil(progress.high.weeks)} semanas al ritmo actual` : ""}
                  </span>
                </div>
              )}
              {progress.low && progress.low.fatToLose > 0 && (
                <div className="breakdown-row">
                  <span>Meta final ({fmtNum(targets.targetBfLow)}%)</span>
                  <span className="mono">
                    faltan {fmtNum(progress.low.fatToLose)} kg
                    {progress.weeklyFatLossKg > 0 ? ` · ~${Math.ceil(progress.low.weeks)} semanas al ritmo actual` : ""}
                  </span>
                </div>
              )}
              {progress.low && progress.low.fatToLose <= 0 && (
                <div className="breakdown-note">Ya estás dentro de tu rango objetivo. 🎉</div>
              )}
              {progress.weeklyFatLossKg <= 0 && (
                <div className="breakdown-note">Definí tus objetivos diarios (con déficit) arriba para poder estimar el tiempo.</div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="card">
      <div className="section-title">Meta física</div>
      <div className="section-sub">
        Altura y cuello se usan para estimar tu % de grasa corporal (método US Navy) a partir de tu peso y cintura — se cargan una sola vez.
      </div>
      <div className="side-grid two" style={{ marginTop: 10 }}>
        <NumInput placeholder="Altura (cm)" decimal={false} value={heightCm} onChange={setHeightCm} />
        <NumInput placeholder="Cuello (cm)" value={neckCm} onChange={setNeckCm} />
      </div>
      <div className="section-sub" style={{ marginTop: 12 }}>Rango de grasa corporal al que querés llegar</div>
      <div className="side-grid two" style={{ marginTop: 6 }}>
        <NumInput placeholder="Mínimo (%)" value={targetBfLow} onChange={setTargetBfLow} />
        <NumInput placeholder="Máximo (%)" value={targetBfHigh} onChange={setTargetBfHigh} />
      </div>
      <button className="save-btn" onClick={submit}>Guardar meta</button>
    </section>
  );
}

function MealForm({ onSave, date, isToday }) {
  const [mealType, setMealType] = useState(null);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [pickFoodId, setPickFoodId] = useState(FOOD_DB[0].id);
  const [pickQty, setPickQty] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customKcal, setCustomKcal] = useState("");
  const [customProtein, setCustomProtein] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [customFat, setCustomFat] = useState("");

  const categories = useMemo(() => [...new Set(FOOD_DB.map((f) => f.cat))], []);
  const pickedFood = FOOD_DB.find((f) => f.id === pickFoodId);

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, it) => ({
          kcal: acc.kcal + it.kcal,
          protein: acc.protein + it.protein,
          carbs: acc.carbs + it.carbs,
          fat: acc.fat + it.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [items]
  );

  function addFromDb() {
    const qty = toNum(pickQty);
    const m = computeFoodMacros(pickFoodId, qty);
    if (!m) return;
    const word = qty === 1 ? pickedFood.unitWord : pickedFood.unitWordPlural;
    const label = pickedFood.unit ? `${fmtNum(qty)} ${word} de ${pickedFood.name}` : `${fmtNum(qty)} g de ${pickedFood.name}`;
    setItems((prev) => [...prev, { id: uid(), label, ...m }]);
    setPickQty("");
  }

  function addCustom() {
    if (!customName.trim()) return;
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        label: customName.trim(),
        kcal: toNum(customKcal) || 0,
        protein: toNum(customProtein) || 0,
        carbs: toNum(customCarbs) || 0,
        fat: toNum(customFat) || 0,
      },
    ]);
    setCustomName(""); setCustomKcal(""); setCustomProtein(""); setCustomCarbs(""); setCustomFat(""); setCustomOpen(false);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  const [saving, setSaving] = useState(false);

  async function submit() {
    if (items.length === 0 || saving) return;
    setSaving(true);
    const ok = await onSave({
      date,
      mealType,
      name: items.map((it) => it.label).join(", "),
      calories: Math.round(totals.kcal),
      protein: Number(totals.protein.toFixed(1)),
      carbs: Number(totals.carbs.toFixed(1)),
      fat: Number(totals.fat.toFixed(1)),
      notes: notes.trim(),
    });
    setSaving(false);
    // Solo limpiamos el formulario si realmente se guardo — si fallo, dejamos
    // todo cargado para que el usuario pueda reintentar sin perder lo que puso.
    if (ok) {
      setItems([]); setMealType(null); setNotes("");
    }
  }

  return (
    <section className="card">
      <div className="section-title">{isToday ? "Nueva comida" : `Nueva comida — ${fmtDateLabel(date)}`}</div>
      <div className="section-sub">Elegí el alimento y la cantidad — las calorías y macros se calculan solas</div>

      <div className="chiprow wrap" style={{ marginBottom: 10 }}>
        {MEAL_TYPES.map((t) => (
          <button key={t} className={"chip" + (mealType === t ? " chip-active" : "")} onClick={() => setMealType(t)}>{t}</button>
        ))}
      </div>

      <div className="side-grid two">
        <div className="select-wrap">
          <select className="select" value={pickFoodId} onChange={(e) => setPickFoodId(e.target.value)}>
            {categories.map((cat) => (
              <optgroup key={cat} label={cat}>
                {FOOD_DB.filter((f) => f.cat === cat).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown size={16} className="select-chevron" />
        </div>
        <NumInput
          placeholder={pickedFood.unit ? `Cant. (${pickedFood.unitWordPlural})` : "Gramos"}
          value={pickQty}
          onChange={setPickQty}
        />
      </div>
      <button className="save-btn" style={{ marginTop: 10, background: "rgba(192,138,62,0.16)", color: "#C08A3E" }} onClick={addFromDb}>
        + Agregar a la comida
      </button>

      <button className="link-btn" onClick={() => setCustomOpen((v) => !v)}>
        {customOpen ? "Cancelar" : "¿No está en la lista? Cargar manual"}
      </button>

      {customOpen && (
        <div className="card-form" style={{ marginTop: 2 }}>
          <input className="input" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Nombre del alimento" />
          <div className="side-grid two">
            <NumInput placeholder="Calorías (kcal)" decimal={false} value={customKcal} onChange={setCustomKcal} />
            <NumInput placeholder="Proteína (g)" value={customProtein} onChange={setCustomProtein} />
          </div>
          <div className="side-grid two">
            <NumInput placeholder="Carbohidratos (g)" value={customCarbs} onChange={setCustomCarbs} />
            <NumInput placeholder="Grasas (g)" value={customFat} onChange={setCustomFat} />
          </div>
          <button className="save-btn" onClick={addCustom}>Agregar a la comida</button>
        </div>
      )}

      {items.length > 0 && (
        <div className="cardlist" style={{ marginTop: 12 }}>
          {items.map((it) => (
            <div key={it.id} className="hist-row">
              <div className="hist-ex">{it.label}</div>
              <div className="hist-actions">
                <span className="hist-detail mono" style={{ marginRight: 2 }}>{it.kcal} kcal</span>
                <button className="del-btn" onClick={() => removeItem(it.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          <div className="delta-row" style={{ marginTop: 2 }}>
            <span className="mono">Total {Math.round(totals.kcal)} kcal</span>
            <span className="mono">P {fmtNum(Number(totals.protein.toFixed(1)))}g</span>
            <span className="mono">C {fmtNum(Number(totals.carbs.toFixed(1)))}g</span>
            <span className="mono">G {fmtNum(Number(totals.fat.toFixed(1)))}g</span>
          </div>
        </div>
      )}

      <input className="input" style={{ marginTop: 10 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" />
      <button className="save-btn" disabled={items.length === 0 || saving} onClick={submit}>
        {saving ? "Guardando..." : "Guardar comida"}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Motor de decisiones (Fase 4): reglas fijas, sin IA y sin costo. Corre en el
// cliente cada vez que se abre la pestaña, comparando la ultima semana contra
// la anterior sobre los datos que ya existen en Supabase. No reemplaza el
// analisis mas fino que se puede pedir en el chat — es el chequeo automatico
// de todos los dias.
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}
function avg(arr) {
  const vals = arr.filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function inWindow(dateISO, fromISO, toISOEnd) {
  return dateISO >= fromISO && dateISO <= toISOEnd;
}

// Veredicto automatico entre dos fotos: usa el peso/cintura cargados junto a
// cada una (si estan) para decir avance/retroceso/estable sin que el usuario
// tenga que interpretar los numeros el mismo. No analiza la imagen en si
// (eso necesitaria IA con costo) — mide lo mismo que el resto del motor.
function photoVerdict(older, newer) {
  if (!older || !newer || older.id === newer.id) return null;
  const dW = older.weight != null && newer.weight != null ? Number((newer.weight - older.weight).toFixed(2)) : null;
  const dC = older.waist != null && newer.waist != null ? Number((newer.waist - older.waist).toFixed(2)) : null;
  if (dW == null && dC == null) {
    return { tone: "info", text: "Cargá peso y/o cintura al subir las fotos para que el motor marque avance o retroceso automáticamente entre estas dos." };
  }
  const good = [dW != null && dW < -0.1, dC != null && dC < -0.2].filter(Boolean).length;
  const bad = [dW != null && dW > 0.1, dC != null && dC > 0.2].filter(Boolean).length;
  let label = "Estable";
  let tone = "flat";
  if (good > 0 && bad === 0) { label = "Avance"; tone = "ok"; }
  else if (bad > 0 && good === 0) { label = "Retroceso"; tone = "warn"; }
  else if (good > 0 && bad > 0) { label = "Mixto"; tone = "flat"; }

  const parts = [];
  if (dW != null) parts.push(`peso ${dW <= 0 ? "" : "+"}${fmtNum(dW)} kg`);
  if (dC != null) parts.push(`cintura ${dC <= 0 ? "" : "+"}${fmtNum(dC)} cm`);
  return { tone, label, text: `${label}: ${parts.join(" · ")} entre estas dos fotos.` };
}

function computeCoach({ bwLogs, logs, activityLogs, checkins, mealLogs, targets, supplements, supplementLogs }) {
  const today = todayISO();
  const w1Start = daysAgoISO(6); // esta semana: hoy y los 6 dias anteriores
  const w2Start = daysAgoISO(13);
  const w2End = daysAgoISO(7); // semana anterior

  const thisWeekBw = bwLogs.filter((b) => inWindow(b.date, w1Start, today));
  const prevWeekBw = bwLogs.filter((b) => inWindow(b.date, w2Start, w2End));
  const weightNow = avg(thisWeekBw.map((b) => b.weight));
  const weightPrev = avg(prevWeekBw.map((b) => b.weight));
  const waistNow = avg(thisWeekBw.map((b) => b.waist));
  const waistPrev = avg(prevWeekBw.map((b) => b.waist));

  const thisWeekSets = logs.filter((l) => inWindow(l.date, w1Start, today));
  const prevWeekSets = logs.filter((l) => inWindow(l.date, w2Start, w2End));
  const rirNow = avg(thisWeekSets.map((l) => l.rir));
  const rirPrev = avg(prevWeekSets.map((l) => l.rir));
  const volumeNow = thisWeekSets.length;
  const volumePrev = prevWeekSets.length;

  const thisWeekAct = activityLogs.filter((a) => inWindow(a.date, w1Start, today));
  const prevWeekAct = activityLogs.filter((a) => inWindow(a.date, w2Start, w2End));
  const minutesNow = thisWeekAct.reduce((s, a) => s + (a.durationMin || 0), 0);
  const minutesPrev = prevWeekAct.reduce((s, a) => s + (a.durationMin || 0), 0);

  const thisWeekChk = checkins.filter((c) => inWindow(c.date, w1Start, today));
  const energyNow = avg(thisWeekChk.map((c) => c.energy));
  const sorenessNow = avg(thisWeekChk.map((c) => c.soreness));
  const painFlags = thisWeekChk.flatMap((c) => Object.entries(c.pain || {}).filter(([, v]) => v >= 6));

  const thisWeekMeals = mealLogs.filter((m) => inWindow(m.date, w1Start, today));
  const daysWithMeals = new Set(thisWeekMeals.map((m) => m.date)).size;
  const caloriesAvg = avg(
    Array.from(new Set(thisWeekMeals.map((m) => m.date))).map((d) =>
      thisWeekMeals.filter((m) => m.date === d).reduce((s, m) => s + (m.calories || 0), 0)
    )
  );

  const blocks = [];

  // Composicion corporal
  if (weightNow != null && weightPrev != null) {
    const dW = Number((weightNow - weightPrev).toFixed(2));
    const pct = (dW / weightPrev) * 100;
    blocks.push({
      key: "peso",
      label: "Peso corporal",
      status: dW < -0.05 ? "down" : dW > 0.05 ? "up" : "flat",
      detail: `${fmtNum(weightPrev)} → ${fmtNum(weightNow)} kg (${dW <= 0 ? "" : "+"}${fmtNum(dW)} kg, ${fmtNum(Number(pct.toFixed(1)))}%/sem)`,
    });
  } else {
    blocks.push({ key: "peso", label: "Peso corporal", status: "na", detail: "Necesito 2 semanas de datos para comparar." });
  }
  if (waistNow != null && waistPrev != null) {
    const dC = Number((waistNow - waistPrev).toFixed(2));
    blocks.push({
      key: "cintura",
      label: "Cintura",
      status: dC < -0.1 ? "down" : dC > 0.1 ? "up" : "flat",
      detail: `${fmtNum(waistPrev)} → ${fmtNum(waistNow)} cm (${dC <= 0 ? "" : "+"}${fmtNum(dC)} cm)`,
    });
  }

  // Entrenamiento
  if (volumeNow > 0 || volumePrev > 0) {
    blocks.push({
      key: "entreno",
      label: "Entrenamiento",
      status: volumeNow > volumePrev ? "up" : volumeNow < volumePrev ? "down" : "flat",
      detail:
        `${volumeNow} sets esta semana (antes ${volumePrev})` +
        (rirNow != null ? ` · RIR prom. ${fmtNum(Number(rirNow.toFixed(1)))}` : ""),
    });
  } else {
    blocks.push({ key: "entreno", label: "Entrenamiento", status: "na", detail: "No hay sets cargados esta semana." });
  }

  // Actividad extra / cardio
  blocks.push({
    key: "actividad",
    label: "Actividad extra",
    status: minutesNow > minutesPrev ? "up" : minutesNow < minutesPrev ? "down" : "flat",
    detail: `${minutesNow} min esta semana (antes ${minutesPrev})`,
  });

  // Recuperacion
  if (energyNow != null || sorenessNow != null) {
    const bad = (energyNow != null && energyNow <= 2.2) || (sorenessNow != null && sorenessNow >= 4);
    blocks.push({
      key: "recuperacion",
      label: "Recuperación",
      status: bad ? "down" : "flat",
      detail:
        (energyNow != null ? `Energía prom. ${fmtNum(Number(energyNow.toFixed(1)))}/5` : "Sin dato de energía") +
        (sorenessNow != null ? ` · Fatiga ${fmtNum(Number(sorenessNow.toFixed(1)))}/5` : "") +
        (painFlags.length ? ` · dolor alto en ${painFlags.length} chequeo(s)` : ""),
    });
  } else {
    blocks.push({ key: "recuperacion", label: "Recuperación", status: "na", detail: "Sin chequeos diarios esta semana." });
  }

  // Nutricion
  if (targets?.calories && daysWithMeals > 0) {
    const gap = caloriesAvg != null ? Math.round(caloriesAvg - targets.calories) : null;
    blocks.push({
      key: "nutricion",
      label: "Nutrición",
      status: gap == null ? "na" : Math.abs(gap) <= 150 ? "flat" : gap > 0 ? "up" : "down",
      detail:
        `${daysWithMeals}/7 días registrados` +
        (caloriesAvg != null ? ` · ${fmtNum(Math.round(caloriesAvg))} kcal prom. (objetivo ${fmtNum(targets.calories)})` : ""),
    });
  } else {
    blocks.push({
      key: "nutricion",
      label: "Nutrición",
      status: "na",
      detail: targets?.calories ? "Todavía no registraste comidas esta semana." : "Definí un objetivo de calorías en Nutrición para activar este bloque.",
    });
  }

  // Suplementos: adherencia de la semana entre los que estan activos.
  const activeSupplementIds = (supplements || []).filter((s) => s.active).map((s) => s.id);
  if (activeSupplementIds.length > 0) {
    const takenThisWeek = (supplementLogs || []).filter(
      (l) => activeSupplementIds.includes(l.supplementId) && inWindow(l.date, w1Start, today)
    ).length;
    const possible = activeSupplementIds.length * 7;
    const pct = possible > 0 ? Math.round((takenThisWeek / possible) * 100) : null;
    blocks.push({
      key: "suplementos",
      label: "Suplementos",
      status: pct == null ? "na" : pct >= 80 ? "flat" : pct >= 50 ? "down" : "up",
      detail: `${takenThisWeek}/${possible} tomas esta semana (${pct}% adherencia, ${activeSupplementIds.length} activo${activeSupplementIds.length === 1 ? "" : "s"})`,
    });
  } else {
    blocks.push({ key: "suplementos", label: "Suplementos", status: "na", detail: "Agregá suplementos en \"Más\" para activar este bloque." });
  }

  // Decision final: reglas en orden de prioridad.
  let decision = "Seguí cargando datos — con una semana más el motor ya puede comparar tendencias.";
  let tone = "info";

  const recov = blocks.find((b) => b.key === "recuperacion");
  const peso = blocks.find((b) => b.key === "peso");
  const nutri = blocks.find((b) => b.key === "nutricion");
  const entreno = blocks.find((b) => b.key === "entreno");

  const hasTwoWeeks = peso.status !== "na";

  if (recov && recov.status === "down" && (sorenessNow >= 4.5 || painFlags.length >= 2)) {
    decision = "Fatiga y/o dolor altos esta semana. Bajá el volumen o meté una semana de descarga antes de seguir progresando cargas.";
    tone = "warn";
  } else if (hasTwoWeeks) {
    const dW = weightNow - weightPrev;
    const pctWeek = (dW / weightPrev) * 100;
    if (dW >= -0.05) {
      if (nutri && nutri.status === "up") {
        decision = "El peso no bajó y estás por encima del objetivo calórico. Ajustá ~150-200 kcal menos o sumá cardio/pasos esta semana.";
        tone = "warn";
      } else {
        decision = "El peso se estancó. Si venís comiendo en línea con el objetivo, bajá ~100-150 kcal o subí actividad; si no tenés objetivo cargado, definilo en Nutrición para que el motor pueda distinguir estancamiento real de falta de datos.";
        tone = "warn";
      }
    } else if (pctWeek < -1) {
      decision = "Estás bajando más rápido de lo ideal (más de 1%/semana). Subí ~150-200 kcal para frenar la pérdida de masa muscular.";
      tone = "warn";
    } else {
      decision = "Progreso en línea: peso bajando de forma sostenida" + (entreno && entreno.status !== "down" ? " y entrenamiento estable o en aumento." : ".") + " Mantené el plan actual.";
      tone = "ok";
    }
  }

  return { blocks, decision, tone };
}

function StatusDot({ status }) {
  const map = { up: "●", down: "●", flat: "●", na: "○" };
  const cls = { up: "dot-up", down: "dot-down", flat: "dot-flat", na: "dot-na" };
  return <span className={"status-dot " + cls[status]}>{map[status]}</span>;
}

function CoachTab({ bwLogs, logs, activityLogs, checkins, mealLogs, targets, supplements, supplementLogs, coachNote }) {
  const result = useMemo(
    () => computeCoach({ bwLogs, logs, activityLogs, checkins, mealLogs, targets, supplements, supplementLogs }),
    [bwLogs, logs, activityLogs, checkins, mealLogs, targets, supplements, supplementLogs]
  );

  return (
    <div className="tabpane">
      <section className="card coach-ai-card">
        <div className="coach-ai-head">
          <Sparkles size={15} />
          <span className="section-title" style={{ margin: 0 }}>Nota semanal del Coach</span>
        </div>
        {coachNote ? (
          <>
            <div className="decision-text">{coachNote.text}</div>
            <div className="section-sub" style={{ marginTop: 10, marginBottom: 0 }}>
              Generada automáticamente el {fmtDateLabel(coachNote.createdAt.slice(0, 10))} · se arma sola todos los domingos a la noche
            </div>
          </>
        ) : (
          <div className="section-sub" style={{ marginBottom: 0 }}>
            Todavía no se generó ninguna. Se arma sola todos los domingos a la noche con los datos de la semana — no hay que hacer nada.
          </div>
        )}
      </section>

      <section className={"card decision-card tone-" + result.tone}>
        <div className="section-title" style={{ marginBottom: 6 }}>Decisión de la semana</div>
        <div className="decision-text">{result.decision}</div>
      </section>

      <section className="card">
        <div className="section-title">Panel de control</div>
        <div className="section-sub">Esta semana (últimos 7 días) vs. la anterior — se recalcula solo, sin costo</div>
        <div className="cardlist">
          {result.blocks.map((b) => (
            <div key={b.key} className="coach-row">
              <div className="coach-row-head">
                <StatusDot status={b.status} />
                <span className="coach-label">{b.label}</span>
              </div>
              <div className="hist-detail mono">{b.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="empty small">
        Panel de control: motor de reglas fijo (sin IA, sin costo, corre siempre). La nota de arriba es aparte — la escribe la IA una vez por semana con estos mismos datos.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color de la segunda serie de datos. El verde #6E9B8B venia cumpliendo dos
// papeles a la vez -- serie de datos y estado positivo -- y contra el dorado de
// marca quedaba en dE 13,4, por debajo del piso de 15: costaba distinguir
// Derecho de Izquierdo incluso con vision de color normal. Este verde-azulado
// da dE 22,3 en vision normal y 16,4 bajo daltonismo, y el verde queda libre
// para lo que siempre significo: nota, info y variacion a favor.
const SERIE_2 = "#0092B0";

const TOOLTIP_STYLE = { background: "#242A31", border: "1px solid rgba(237,234,227,0.12)", borderRadius: 10, fontSize: 12, color: "#EDEAE3" };

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
* { box-sizing: border-box; }
.shell { background: #14171B; min-height: 100vh; font-family: 'Inter', sans-serif; color: #EDEAE3; display: flex; justify-content: center; }
.frame { width: 100%; max-width: 480px; min-height: 100vh; background: #1B1F24; display: flex; flex-direction: column; position: relative; }

.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 0; }
.topbar-email { font-size: 11px; color: #5C6470; }
.manage-btn { background: none; border: 1px solid rgba(237,234,227,0.14); border-radius: 8px; color: #8B93A0; padding: 6px; flex-shrink: 0; }

.auth-shell { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; gap: 18px; min-height: 100vh; width: 100%; max-width: 420px; margin: 0 auto; }
.auth-title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 30px; text-transform: uppercase; color: #EDEAE3; }
.auth-card { width: 100%; display: flex; flex-direction: column; gap: 10px; background: #242A31; border: 1px solid rgba(237,234,227,0.08); border-radius: 16px; padding: 20px; }
.auth-error { color: #C0673A; font-size: 12.5px; width: 100%; text-align: center; }
.auth-info { color: #6E9B8B; font-size: 12.5px; width: 100%; text-align: center; }
.auth-switch { background: none; border: none; color: #C08A3E; font-size: 12.5px; font-weight: 600; }
.auth-forgot { background: none; border: none; color: #8B93A0; font-size: 12px; margin-top: -4px; }

.header { padding: 14px 20px 18px; border-bottom: 1px solid rgba(237,234,227,0.08); }
.eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.15em; text-transform: uppercase; color: #8B93A0; }
.day-title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 38px; letter-spacing: 0.01em; text-transform: uppercase; color: #EDEAE3; line-height: 1.05; margin-top: 2px; }
.day-focus { font-size: 14px; color: #C08A3E; margin-top: 6px; font-weight: 600; }
.day-note { font-size: 12px; color: #6E9B8B; margin-top: 4px; }

.main { flex: 1; padding: 16px 16px 90px; }
.tabpane { display: flex; flex-direction: column; gap: 14px; }

.chiprow { display: flex; gap: 8px; }
.chip { flex: 1; padding: 8px 0; border-radius: 999px; border: 1px solid rgba(237,234,227,0.12); background: transparent; color: #8B93A0; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; letter-spacing: 0.04em; text-transform: uppercase; }
.chip-active { background: #C08A3E; border-color: #C08A3E; color: #1B1F24; font-weight: 600; }

.edit-toggle { align-self: flex-end; display: flex; align-items: center; gap: 6px; background: rgba(237,234,227,0.06); border: 1px solid rgba(237,234,227,0.14); color: #EDEAE3; border-radius: 999px; padding: 7px 14px; font-size: 12.5px; font-weight: 600; }

.cardlist { display: flex; flex-direction: column; gap: 10px; }
.card { background: #242A31; border: 1px solid rgba(237,234,227,0.06); border-radius: 16px; padding: 14px 16px; }

.card-head { width: 100%; display: flex; align-items: center; justify-content: space-between; background: none; border: none; padding: 0; text-align: left; color: inherit; font-family: inherit; }
.ex-name { font-size: 14.5px; font-weight: 600; color: #EDEAE3; }
.ex-last { font-size: 12px; color: #8B93A0; margin-top: 3px; font-family: 'JetBrains Mono', monospace; }
.card-icon { width: 30px; height: 30px; border-radius: 50%; background: rgba(192,138,62,0.14); color: #C08A3E; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: 10px; }
.card-icon.open { background: rgba(237,234,227,0.1); color: #EDEAE3; }

.card-form { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.side-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.side-grid.two { grid-template-columns: 1fr 1fr; }
.side-col { display: flex; flex-direction: column; gap: 6px; }
.side-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.accent { color: #C08A3E; }
.accent2 { color: #0092B0; }  /* rotulo de la serie Izquierdo */
.side-label.muted { color: #8B93A0; }

.input { background: #1B1F24; border: 1px solid rgba(237,234,227,0.14); border-radius: 10px; padding: 10px 12px; color: #EDEAE3; font-size: 14px; font-family: 'JetBrains Mono', monospace; width: 100%; color-scheme: dark; }
.input::placeholder { color: #5C6470; font-family: 'Inter', sans-serif; }

.save-btn { background: #C08A3E; color: #1B1F24; border: none; border-radius: 10px; padding: 11px; font-weight: 700; font-size: 13.5px; letter-spacing: 0.02em; margin-top: 10px; width: 100%; }
.save-btn:disabled { opacity: 0.6; }

.section-title { font-family: 'Oswald', sans-serif; font-size: 18px; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 4px; }
.section-sub { font-size: 12px; color: #8B93A0; margin-bottom: 10px; }

.select-wrap { position: relative; margin: 10px 0; }
.select { width: 100%; appearance: none; background: #1B1F24; border: 1px solid rgba(237,234,227,0.14); border-radius: 10px; padding: 10px 32px 10px 12px; color: #EDEAE3; font-size: 13.5px; font-family: 'Inter', sans-serif; }
.select-chevron { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #8B93A0; pointer-events: none; }

.chart-wrap { margin-top: 6px; }
.empty { color: #8B93A0; font-size: 13.5px; text-align: center; padding: 30px 10px; line-height: 1.5; }
.empty.small { padding: 14px 4px; text-align: left; }

.delta-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; }
.mono { font-family: 'JetBrains Mono', monospace; }
.arrow { color: #5C6470; }
.delta { font-weight: 700; padding: 2px 8px; border-radius: 6px; }
.delta.down { color: #6E9B8B; background: rgba(110,155,139,0.14); }
.delta.up { color: #C0673A; background: rgba(192,103,58,0.14); }

.arm-list { display: flex; flex-direction: column; gap: 18px; }
.arm-block { display: flex; flex-direction: column; gap: 6px; }
.arm-ex-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.bar-row { display: flex; align-items: center; gap: 8px; }
.bar-label { width: 28px; font-size: 11px; color: #8B93A0; }
.bar-track { flex: 1; height: 14px; background: #1B1F24; border-radius: 7px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 7px; transition: width 0.3s; }
.bar-accent { background: #C08A3E; }
.bar-accent2 { background: #0092B0; }
.bar-value { width: 52px; text-align: right; font-size: 11.5px; color: #EDEAE3; }
.gap-label { font-size: 11.5px; color: #8B93A0; margin-top: 2px; }

.hist-group { margin-bottom: 4px; }
.hist-date { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #8B93A0; margin-bottom: 8px; }
.hist-row { background: #242A31; border: 1px solid rgba(237,234,227,0.06); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; }
.hist-ex { font-size: 13.5px; font-weight: 600; }
.hist-detail { font-size: 12px; color: #8B93A0; margin-top: 3px; }
.del-btn { background: none; border: none; color: #5C6470; padding: 6px; flex-shrink: 0; }

.ex-edit { display: flex; flex-direction: column; gap: 10px; }
.target-row { display: flex; align-items: center; gap: 10px; }
.target-field { flex: 1; display: flex; align-items: center; gap: 7px; }
.target-cap { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #8B93A0; white-space: nowrap; }
.target-input { padding: 8px 10px; font-size: 13px; }
.target-badge { display: inline-block; margin-top: 5px; font-size: 10.5px; letter-spacing: 0.05em; color: #C08A3E; background: rgba(192,138,62,0.14); border-radius: 6px; padding: 2px 8px; }
.ex-pr { font-size: 11px; color: #C08A3E; margin-top: 4px; font-weight: 600; }

.hist-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.edit-actions { display: flex; gap: 8px; margin-top: 12px; }
.edit-actions .save-btn { margin-top: 0; }
.cancel-btn { flex: 0 0 38%; background: rgba(237,234,227,0.06); border: 1px solid rgba(237,234,227,0.14); color: #EDEAE3; border-radius: 10px; padding: 11px; font-weight: 600; font-size: 13.5px; }
.date-nav { display: flex; align-items: center; gap: 10px; }
.date-nav-input { flex: 1; }
.date-nav .cancel-btn { flex: 0 0 auto; padding: 11px 14px; white-space: nowrap; }

.edit-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #8B93A0; margin-bottom: 6px; }
.edit-row { display: flex; align-items: center; gap: 8px; }
.edit-name { flex: 1; }
.uni-toggle { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #8B93A0; flex-shrink: 0; white-space: nowrap; }
.uni-toggle input { accent-color: #C08A3E; }
.add-exercise-btn { display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(192,138,62,0.12); border: 1px dashed rgba(192,138,62,0.5); color: #C08A3E; border-radius: 12px; padding: 12px; font-size: 13px; font-weight: 600; }

.toast { position: absolute; bottom: 78px; left: 50%; transform: translateX(-50%); background: #C08A3E; color: #1B1F24; font-size: 12.5px; font-weight: 700; padding: 8px 16px; border-radius: 999px; display: flex; align-items: center; gap: 6px; z-index: 20; }

.tabbar { position: sticky; bottom: 0; display: flex; border-top: 1px solid rgba(237,234,227,0.08); background: #1B1F24; padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px)); }
.tabbtn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; color: #5C6470; padding: 6px 0; font-size: 10.5px; font-family: 'Inter', sans-serif; font-weight: 600; }
.tabbtn.active { color: #C08A3E; }

.rpe-row { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; }
.rpe-row.five { grid-template-columns: repeat(5, 1fr); }
.rpe-btn { background: #1B1F24; border: 1px solid rgba(237,234,227,0.14); border-radius: 8px; padding: 8px 0; color: #8B93A0; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; }
.rpe-active { background: #C08A3E; border-color: #C08A3E; color: #1B1F24; }
.pain-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
.pain-field { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pain-field .target-input { width: 56px; text-align: center; padding: 8px 6px; }

.chiprow.wrap { flex-wrap: wrap; }
.chiprow.wrap .chip { flex: 0 0 auto; padding: 7px 12px; }

.coach-ai-card { border: 1px solid rgba(192,138,62,0.3); background: linear-gradient(0deg, rgba(192,138,62,0.06), rgba(192,138,62,0.06)), #242A31; }
.coach-ai-head { display: flex; align-items: center; gap: 7px; color: #C08A3E; margin-bottom: 6px; }

.rest-timer-bar { position: sticky; top: -16px; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin: -16px -16px 14px; border-bottom: 1px solid rgba(192,138,62,0.3); background: linear-gradient(0deg, rgba(192,138,62,0.1), rgba(192,138,62,0.1)), #1B1F24; color: #C08A3E; }
.rest-timer-bar.done { animation: rest-timer-pulse 1s ease-in-out infinite; }
.rest-timer-time { font-size: 18px; font-weight: 700; min-width: 54px; }
.rest-timer-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.rest-timer-btn { display: flex; align-items: center; justify-content: center; gap: 4px; background: rgba(192,138,62,0.14); border: 1px solid rgba(192,138,62,0.35); color: #C08A3E; border-radius: 8px; padding: 6px 9px; font-size: 12px; font-weight: 600; cursor: pointer; }
@keyframes rest-timer-pulse { 0%, 100% { background-color: rgba(192,138,62,0.1); } 50% { background-color: rgba(192,138,62,0.28); } }
.rest-chiprow { margin-top: -4px; }

.reminder-card { border: 1px solid rgba(192,138,62,0.3); background: linear-gradient(0deg, rgba(192,138,62,0.06), rgba(192,138,62,0.06)), #242A31; margin-bottom: 14px; }
.reminder-head { display: flex; align-items: center; gap: 7px; color: #C08A3E; margin-bottom: 6px; }
.reminder-note { font-size: 11.5px; color: #8B93A0; margin-top: 10px; }
.decision-card { border: 1px solid rgba(237,234,227,0.06); }
.decision-card.tone-ok { border-color: rgba(110,155,139,0.4); background: linear-gradient(0deg, rgba(110,155,139,0.08), rgba(110,155,139,0.08)), #242A31; }
.decision-card.tone-warn { border-color: rgba(192,103,58,0.4); background: linear-gradient(0deg, rgba(192,103,58,0.08), rgba(192,103,58,0.08)), #242A31; }
.decision-card.tone-info { border-color: rgba(192,138,62,0.35); }
.decision-text { font-size: 14px; line-height: 1.5; }

.coach-row { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-top: 1px solid rgba(237,234,227,0.06); }
.coach-row:first-child { border-top: none; padding-top: 2px; }
.coach-row-head { display: flex; align-items: center; gap: 8px; }
.coach-label { font-size: 13.5px; font-weight: 600; }
.status-dot { font-size: 11px; line-height: 1; }
.dot-up { color: #C08A3E; }
.dot-down { color: #0092B0; }
.dot-flat { color: #8B93A0; }
.dot-na { color: #5C6470; }

.input[type="date"] { color-scheme: dark; }

.photo-upload-btn { display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(192,138,62,0.12); border: 1px dashed rgba(192,138,62,0.5); color: #C08A3E; border-radius: 12px; padding: 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
.photo-preview { border-radius: 12px; overflow: hidden; max-height: 220px; }
.photo-preview img { width: 100%; max-height: 220px; object-fit: cover; display: block; }

.photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.photo-thumb { position: relative; aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden; background: #1B1F24; }
.photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo-placeholder { width: 100%; height: 100%; background: #1B1F24; }
.photo-thumb-date { position: absolute; left: 4px; bottom: 4px; background: rgba(27,31,36,0.75); padding: 2px 5px; border-radius: 5px; font-size: 10px; }
.photo-del { position: absolute; top: 4px; right: 4px; background: rgba(27,31,36,0.75); border: none; color: #EDEAE3; border-radius: 6px; padding: 4px; }

.photo-compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.photo-compare-card { border-radius: 10px; overflow: hidden; background: #1B1F24; }
.photo-compare-card img { width: 100%; display: block; }
.photo-compare-card .photo-thumb-date { position: static; display: block; text-align: center; background: none; padding: 6px 0 0; }

.verdict-badge { margin-top: 10px; padding: 10px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; line-height: 1.4; }
.verdict-badge.tone-ok { background: rgba(110,155,139,0.14); color: #6E9B8B; }
.verdict-badge.tone-warn { background: rgba(192,103,58,0.14); color: #C0673A; }
.verdict-badge.tone-flat { background: rgba(139,147,160,0.12); color: #8B93A0; }
.verdict-badge.tone-info { background: rgba(139,147,160,0.08); color: #8B93A0; font-weight: 500; }

.supp-row { background: #242A31; border: 1px solid rgba(237,234,227,0.06); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.supp-check { display: flex; align-items: center; gap: 10px; flex: 1; cursor: pointer; }
.supp-check input[type="checkbox"] { width: 20px; height: 20px; accent-color: #C08A3E; flex-shrink: 0; }

.link-btn { background: none; border: none; color: #C08A3E; font-size: 12.5px; font-weight: 600; padding: 10px 0 2px; text-decoration: underline; text-align: left; }

.breakdown { margin-top: 10px; padding: 12px; background: #1B1F24; border-radius: 10px; display: flex; flex-direction: column; gap: 8px; }
.breakdown-row { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
.breakdown-row > span:first-child { color: #8B93A0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; }
.breakdown-row > span:last-child { color: #EDEAE3; }
.breakdown-note { font-size: 11.5px; color: #5C6470; line-height: 1.5; padding-top: 4px; border-top: 1px solid rgba(237,234,227,0.08); }
.meal-idea { padding: 12px; background: #1B1F24; border-radius: 10px; }

.verdict-card { padding: 14px 16px; border-left: 3px solid; }
.verdict-text { font-size: 14px; font-weight: 600; line-height: 1.4; }
.verdict-suggestion { font-size: 12.5px; font-weight: 400; line-height: 1.4; margin-top: 6px; color: #C7CDD6; }
.verdict-food-picker { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.verdict-food-picker span { font-size: 12px; color: #8B93A0; white-space: nowrap; }
.select-wrap-sm { flex: 1; }
.select-wrap-sm .select { font-size: 12.5px; padding: 6px 28px 6px 10px; }
.verdict-ok { border-color: #4CAF7D; background: rgba(76,175,125,0.10); }
.verdict-ok .verdict-text { color: #4CAF7D; }
.verdict-warn { border-color: #C08A3E; background: rgba(192,138,62,0.10); }
.verdict-warn .verdict-text { color: #C08A3E; }
.verdict-danger { border-color: #D9534F; background: rgba(217,83,79,0.10); }
.verdict-danger .verdict-text { color: #D9534F; }
.verdict-info { border-color: #5C6470; background: rgba(92,100,112,0.10); }
.verdict-info .verdict-text { color: #8B93A0; }

`;
