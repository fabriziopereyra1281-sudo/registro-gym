// Importa las kcal activas del día desde el Apple Watch, mandadas por un
// Atajo de iOS (Shortcuts) que corre solo (ej. todas las noches) — no hace
// falta abrir la app. Guarda el valor en daily_checkins.active_calories, la
// misma tabla del chequeo diario manual, pero sin tocar energía/fatiga/
// dolor/notas de ese día (el upsert solo escribe las columnas que manda
// este endpoint).
//
// Vercel detecta sola cualquier archivo bajo /api como funcion serverless,
// accesible en /api/watch-import — no hace falta declararla en ningun lado.
//
// Como armar el Atajo en el iPhone (app Atajos / Shortcuts):
//   1. Crear un atajo nuevo con la accion "Obtener detalles de salud"
//      (Health Sample) → tipo "Energía activa", rango "Hoy".
//   2. Sumar los valores si la accion devuelve varios registros (accion
//      "Calcular estadísticas" con "Suma", o "Combinar texto" + convertir).
//   3. Accion "Obtener contenido de URL" (Get Contents of URL), metodo GET,
//      a esta URL (reemplazando los <> por tus valores reales):
//        https://TU-APP.vercel.app/api/watch-import?key=<WATCH_IMPORT_SECRET>&user_id=<tu ID, copiado desde "Más" en la app>&kcal=<resultado del paso 2>
//   4. (Opcional) Automatizar: en la pestaña "Automatización" del Atajo,
//      crear una automatizacion personal por hora del dia (ej. 23:45) que
//      ejecute este atajo sin preguntar.
//
// Variables de entorno que necesita (Vercel → Project Settings → Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  (obligatoria — la misma que ya usa coach-weekly)
//   SUPABASE_URL               (si no está, usa VITE_SUPABASE_URL)
//   WATCH_IMPORT_SECRET        (obligatoria — clave que vos inventás; el
//     Atajo la manda como ?key=... en la URL. Sin ella configurada, la
//     funcion se niega a correr.)

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const secret = process.env.WATCH_IMPORT_SECRET;
  const providedKey = req.query?.key;
  if (!secret || providedKey !== secret) {
    // 401 generico: no distinguir "falta configurar" de "clave incorrecta"
    // para no darle pistas a quien intente adivinar la clave desde afuera.
    res.status(401).send("No autorizado.");
    return;
  }

  const userId = req.query?.user_id;
  if (!userId) {
    res.status(400).send("Falta user_id.");
    return;
  }
  if (req.query?.kcal == null || req.query.kcal === "") {
    res.status(400).send("Falta kcal.");
    return;
  }
  // El Atajo de iOS suele mandar el numero con coma decimal si el telefono
  // esta en español (ej. "320,5" en vez de "320.5") -- lo normalizamos antes
  // de parsear para no depender de la configuracion regional del telefono.
  const kcal = Number(String(req.query.kcal).replace(",", "."));
  if (!Number.isFinite(kcal) || kcal < 0) {
    res.status(400).send("kcal invalido (tiene que ser un numero >= 0).");
    return;
  }
  // Sin fecha explicita, usa el dia de hoy en UTC -- mejor pasarla siempre
  // desde el Atajo (con la fecha local del telefono) para evitar que un
  // envio cerca de medianoche quede anotado en el dia equivocado.
  const date = req.query?.date || new Date().toISOString().slice(0, 10);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("watch-import: faltan variables de entorno (SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
    res.status(500).send("Faltan variables de entorno.");
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { error } = await supabase
    .from("daily_checkins")
    .upsert(
      { user_id: userId, date, active_calories: Math.round(kcal), updated_at: new Date().toISOString() },
      { onConflict: "user_id,date" }
    );

  if (error) {
    console.error("watch-import: error al guardar:", error.message);
    res.status(500).send(`Error al guardar: ${error.message}`);
    return;
  }

  res.status(200).send(`OK: ${date} -> ${Math.round(kcal)} kcal activas`);
}
