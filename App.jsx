import React, { useState, useEffect, useMemo } from "react";
import {
  Dumbbell, TrendingUp, History, Plus, Trash2, ChevronDown, X, Check, Pencil, LogOut,
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
        { id: uid(), name: "Dominadas (+lastre)", unilateral: false },
        { id: uid(), name: "Remo con barra", unilateral: false },
        { id: uid(), name: "Jalón al pecho", unilateral: false },
        { id: uid(), name: "Extensión de tríceps (polea)", unilateral: false },
        { id: uid(), name: "Press francés", unilateral: false },
      ],
    },
    mar: {
      focus: "Pecho y bíceps",
      note: "",
      exercises: [
        { id: uid(), name: "Press de banca", unilateral: false },
        { id: uid(), name: "Press inclinado con mancuernas", unilateral: false },
        { id: uid(), name: "Aperturas con mancuernas", unilateral: false },
        { id: uid(), name: "Curl con barra", unilateral: false },
        { id: uid(), name: "Curl martillo", unilateral: false },
      ],
    },
    mie: {
      focus: "Hombros y femorales",
      note: "",
      exercises: [
        { id: uid(), name: "Press militar", unilateral: false },
        { id: uid(), name: "Elevaciones laterales", unilateral: false },
        { id: uid(), name: "Peso muerto rumano", unilateral: false },
        { id: uid(), name: "Curl femoral acostado", unilateral: false },
      ],
    },
    jue: {
      focus: "Brazos (bíceps y tríceps)",
      note: "Foco extra en el brazo derecho — trabajo unilateral",
      exercises: [
        { id: uid(), name: "Curl con mancuerna", unilateral: true },
        { id: uid(), name: "Extensión de tríceps con mancuerna", unilateral: true },
        { id: uid(), name: "Curl martillo", unilateral: true },
        { id: uid(), name: "Press francés / fondos en banco", unilateral: false },
      ],
    },
    vie: {
      focus: "Cuádriceps y pantorrilla",
      note: "",
      exercises: [
        { id: uid(), name: "Sentadilla", unilateral: false },
        { id: uid(), name: "Prensa", unilateral: false },
        { id: uid(), name: "Extensión de cuádriceps", unilateral: false },
        { id: uid(), name: "Elevación de pantorrilla", unilateral: false },
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
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.floor(Math.random() * 1000);
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
  };
}
function mapBwRow(row) {
  return { id: row.id, date: row.date, weight: row.weight, waist: row.waist };
}

// ---------------------------------------------------------------------------
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [tab, setTab] = useState("hoy");
  const [selectedDay, setSelectedDay] = useState(defaultDayKey());
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [bwLogs, setBwLogs] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [openForm, setOpenForm] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState("");

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 1600);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) {
        setConfig(null);
        setLogs([]);
        setBwLogs([]);
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

    setConfig(cfg);
    setLogs((logRows || []).map(mapLogRow));
    setBwLogs((bwRows || []).map(mapBwRow));
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
    };
    const { data, error } = await supabase.from("workout_logs").insert(row).select().single();
    if (!error && data) {
      setLogs((prev) => [...prev, mapLogRow(data)]);
      showToast("Set guardado");
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

  function lastEntryFor(exerciseId) {
    const matches = logs.filter((l) => l.exerciseId === exerciseId).sort((a, b) => (a.date < b.date ? 1 : -1));
    return matches[0] || null;
  }

  function updateFocus(dayKey, text) {
    persistConfig({ ...config, [dayKey]: { ...config[dayKey], focus: text } });
  }
  function updateNote(dayKey, text) {
    persistConfig({ ...config, [dayKey]: { ...config[dayKey], note: text } });
  }
  function addExercise(dayKey) {
    const ex = { id: uid(), name: "Nuevo ejercicio", unilateral: false };
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
              addLog={addLog}
              editMode={editMode}
              setEditMode={setEditMode}
              updateFocus={updateFocus}
              updateNote={updateNote}
              addExercise={addExercise}
              updateExercise={updateExercise}
              removeExercise={removeExercise}
            />
          ) : tab === "progreso" ? (
            <ProgresoTab logs={logs} bwLogs={bwLogs} addBw={addBw} config={config} allExercises={allExercises} />
          ) : (
            <HistorialTab logs={logs} deleteLog={deleteLog} />
          )}
        </main>

        {toast && <div className="toast"><Check size={14} strokeWidth={3} /> {toast}</div>}

        <nav className="tabbar">
          <TabBtn icon={<Dumbbell size={20} />} label="Hoy" active={tab === "hoy"} onClick={() => setTab("hoy")} />
          <TabBtn icon={<TrendingUp size={20} />} label="Progreso" active={tab === "progreso"} onClick={() => setTab("progreso")} />
          <TabBtn icon={<History size={20} />} label="Historial" active={tab === "historial"} onClick={() => setTab("historial")} />
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

  async function submit() {
    setError(""); setInfo("");
    if (!email || !password) { setError("Completá mail y contraseña."); return; }
    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(traducirError(error.message));
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(traducirError(error.message));
      else setInfo("Cuenta creada. Si pide confirmación, revisá tu mail.");
    }
    setLoading(false);
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
        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}
        <button className="save-btn" onClick={submit} disabled={loading}>
          {loading ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
      </div>
      <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setInfo(""); }}>
        {mode === "login" ? "¿No tenés cuenta? Creá una" : "¿Ya tenés cuenta? Iniciá sesión"}
      </button>
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

// ---------------------------------------------------------------------------
function HoyTab({
  config, selectedDay, setSelectedDay, openForm, setOpenForm, lastEntryFor, addLog,
  editMode, setEditMode, updateFocus, updateNote, addExercise, updateExercise, removeExercise,
}) {
  const day = config[selectedDay];
  return (
    <div className="tabpane">
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
            <div key={ex.id} className="card edit-row">
              <input className="input edit-name" value={ex.name} onChange={(e) => updateExercise(selectedDay, ex.id, { name: e.target.value })} placeholder="Nombre del ejercicio" />
              <label className="uni-toggle">
                <input type="checkbox" checked={ex.unilateral} onChange={(e) => updateExercise(selectedDay, ex.id, { unilateral: e.target.checked })} />
                <span>Der/Izq</span>
              </label>
              <button className="del-btn" onClick={() => removeExercise(selectedDay, ex.id)}><Trash2 size={15} /></button>
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
                key={ex.id} exercise={ex} day={selectedDay} last={lastEntryFor(ex.id)}
                isOpen={openForm === ex.id}
                onToggle={() => setOpenForm(openForm === ex.id ? null : ex.id)}
                onSave={(entry) => { addLog(entry); setOpenForm(null); }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({ exercise, day, last, isOpen, onToggle, onSave }) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [weightR, setWeightR] = useState("");
  const [repsR, setRepsR] = useState("");
  const [weightL, setWeightL] = useState("");
  const [repsL, setRepsL] = useState("");

  function lastLabel() {
    if (!last) return "Sin registros todavía";
    if (exercise.unilateral) {
      return `Último — Der: ${last.weightR ?? "–"}kg×${last.repsR ?? "–"} · Izq: ${last.weightL ?? "–"}kg×${last.repsL ?? "–"}`;
    }
    return `Último: ${last.weight}kg × ${last.reps ?? "–"} reps · ${fmtShort(last.date)}`;
  }

  function submit() {
    if (exercise.unilateral) {
      if (!weightR && !weightL) return;
      onSave({
        date: todayISO(), day, exerciseId: exercise.id, exerciseName: exercise.name, unilateral: true,
        weightR: weightR ? Number(weightR) : null, repsR: repsR ? Number(repsR) : null,
        weightL: weightL ? Number(weightL) : null, repsL: repsL ? Number(repsL) : null,
      });
      setWeightR(""); setRepsR(""); setWeightL(""); setRepsL("");
    } else {
      if (!weight) return;
      onSave({ date: todayISO(), day, exerciseId: exercise.id, exerciseName: exercise.name, unilateral: false, weight: Number(weight), reps: reps ? Number(reps) : null });
      setWeight(""); setReps("");
    }
  }

  return (
    <div className="card">
      <button className="card-head" onClick={onToggle}>
        <div>
          <div className="ex-name">{exercise.name}</div>
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
                <input className="input" type="number" inputMode="decimal" placeholder="kg" value={weightR} onChange={(e) => setWeightR(e.target.value)} />
                <input className="input" type="number" inputMode="numeric" placeholder="reps" value={repsR} onChange={(e) => setRepsR(e.target.value)} />
              </div>
              <div className="side-col">
                <div className="side-label accent2">Izquierdo</div>
                <input className="input" type="number" inputMode="decimal" placeholder="kg" value={weightL} onChange={(e) => setWeightL(e.target.value)} />
                <input className="input" type="number" inputMode="numeric" placeholder="reps" value={repsL} onChange={(e) => setRepsL(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="side-grid two">
              <input className="input" type="number" inputMode="decimal" placeholder="Peso (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} />
              <input className="input" type="number" inputMode="numeric" placeholder="Reps" value={reps} onChange={(e) => setReps(e.target.value)} />
            </div>
          )}
          <button className="save-btn" onClick={submit}>Guardar set</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function ProgresoTab({ logs, bwLogs, addBw, config, allExercises }) {
  const [selectedExerciseId, setSelectedExerciseId] = useState(allExercises[0]?.id || null);
  const [bwInput, setBwInput] = useState("");
  const [waistInput, setWaistInput] = useState("");

  useEffect(() => {
    if (allExercises.length && !allExercises.find((e) => e.id === selectedExerciseId)) {
      setSelectedExerciseId(allExercises[0].id);
    }
  }, [allExercises]);

  const exerciseInfo = allExercises.find((e) => e.id === selectedExerciseId);

  const liftData = useMemo(() => {
    return logs.filter((l) => l.exerciseId === selectedExerciseId).sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((l) => ({ date: fmtShort(l.date), Peso: l.unilateral ? null : l.weight, Derecho: l.unilateral ? l.weightR : null, Izquierdo: l.unilateral ? l.weightL : null }));
  }, [logs, selectedExerciseId]);

  const bwData = useMemo(() => [...bwLogs].sort((a, b) => (a.date > b.date ? 1 : -1)).map((b) => ({ date: fmtShort(b.date), Peso: b.weight })), [bwLogs]);
  const startWeight = bwData.length ? bwData[0].Peso : null;
  const currentWeight = bwData.length ? bwData[bwData.length - 1].Peso : null;
  const delta = startWeight != null && currentWeight != null ? (currentWeight - startWeight).toFixed(1) : null;

  function saveBw() {
    if (!bwInput) return;
    addBw({ date: todayISO(), weight: Number(bwInput), waist: waistInput ? Number(waistInput) : null });
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
          <input className="input" type="number" inputMode="decimal" placeholder="Peso hoy (kg)" value={bwInput} onChange={(e) => setBwInput(e.target.value)} />
          <input className="input" type="number" inputMode="decimal" placeholder="Cintura (cm)" value={waistInput} onChange={(e) => setWaistInput(e.target.value)} />
        </div>
        <button className="save-btn" onClick={saveBw}>Registrar</button>

        {bwData.length === 0 ? (
          <div className="empty small">Registrá tu primer peso para empezar a ver la curva acá.</div>
        ) : (
          <>
            {delta != null && (
              <div className="delta-row">
                <span className="mono">{startWeight} kg</span><span className="arrow">→</span><span className="mono">{currentWeight} kg</span>
                <span className={"delta " + (Number(delta) <= 0 ? "down" : "up")}>{Number(delta) <= 0 ? "" : "+"}{delta} kg</span>
              </div>
            )}
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={bwData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333B44" />
                  <XAxis dataKey="date" stroke="#8B93A0" fontSize={11} />
                  <YAxis stroke="#8B93A0" fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="Peso" stroke="#C08A3E" strokeWidth={2.5} dot={{ r: 3, fill: "#C08A3E" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

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
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={liftData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333B44" />
                <XAxis dataKey="date" stroke="#8B93A0" fontSize={11} />
                <YAxis stroke="#8B93A0" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#8B93A0" }} />
                {exerciseInfo?.unilateral ? (
                  <>
                    <Line type="monotone" dataKey="Derecho" stroke="#C08A3E" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="Izquierdo" stroke="#6E9B8B" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  </>
                ) : (
                  <Line type="monotone" dataKey="Peso" stroke="#C08A3E" strokeWidth={2.5} dot={{ r: 3 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
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
              const gap = Math.abs(r - l);
              const leader = r === l ? null : r > l ? "Derecho" : "Izquierdo";
              return (
                <div key={exercise} className="arm-block">
                  <div className="arm-ex-name">{exercise}</div>
                  <BarRow label="Der" value={r} scale={scale} colorClass="bar-accent" />
                  <BarRow label="Izq" value={l} scale={scale} colorClass="bar-accent2" />
                  <div className="gap-label">{gap === 0 ? "Parejo — sin brecha" : `Brecha: ${gap.toFixed(1)} kg (adelante: ${leader})`}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function BarRow({ label, value, scale, colorClass }) {
  const pct = Math.min(100, (value / scale) * 100);
  return (
    <div className="bar-row">
      <span className="bar-label mono">{label}</span>
      <div className="bar-track"><div className={"bar-fill " + colorClass} style={{ width: `${pct}%` }} /></div>
      <span className="bar-value mono">{value ? `${value}kg` : "–"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
function HistorialTab({ logs, deleteLog }) {
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
            {entries.map((l) => (
              <div key={l.id} className="hist-row">
                <div>
                  <div className="hist-ex">{l.exerciseName}</div>
                  <div className="hist-detail mono">
                    {l.unilateral ? `Der ${l.weightR ?? "–"}kg×${l.repsR ?? "–"} · Izq ${l.weightL ?? "–"}kg×${l.repsL ?? "–"}` : `${l.weight}kg${l.reps ? ` × ${l.reps} reps` : ""}`}
                  </div>
                </div>
                <button className="del-btn" onClick={() => deleteLog(l.id)}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
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
.auth-error { color: #C0673A; font-size: 12.5px; }
.auth-info { color: #6E9B8B; font-size: 12.5px; }
.auth-switch { background: none; border: none; color: #C08A3E; font-size: 12.5px; font-weight: 600; }

.header { padding: 14px 20px 18px; border-bottom: 1px solid rgba(237,234,227,0.08); }
.eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.15em; text-transform: uppercase; color: #8B93A0; }
.day-title { font-family: 'Oswald', sans-serif; font-weight: 600; font-size: 38px; letter-spacing: 0.01em; text-transform: uppercase; color: #EDEAE3; line-height: 1.05; margin-top: 2px; }
.day-focus { font-size: 14px; color: #C08A3E; margin-top: 6px; font-weight: 600; }
.day-note { font-size: 12px; color: #6E9B8B; margin-top: 4px; }

.main { flex: 1; padding: 16px 16px 90px; overflow-y: auto; }
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
.accent2 { color: #6E9B8B; }

.input { background: #1B1F24; border: 1px solid rgba(237,234,227,0.14); border-radius: 10px; padding: 10px 12px; color: #EDEAE3; font-size: 14px; font-family: 'JetBrains Mono', monospace; width: 100%; }
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
.bar-accent2 { background: #6E9B8B; }
.bar-value { width: 52px; text-align: right; font-size: 11.5px; color: #EDEAE3; }
.gap-label { font-size: 11.5px; color: #8B93A0; margin-top: 2px; }

.hist-group { margin-bottom: 4px; }
.hist-date { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #8B93A0; margin-bottom: 8px; }
.hist-row { background: #242A31; border: 1px solid rgba(237,234,227,0.06); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; }
.hist-ex { font-size: 13.5px; font-weight: 600; }
.hist-detail { font-size: 12px; color: #8B93A0; margin-top: 3px; }
.del-btn { background: none; border: none; color: #5C6470; padding: 6px; flex-shrink: 0; }

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
`;
