// Sugerencia del día con IA, disparada a demanda por el usuario desde la app
// (botón "¿Cómo va mi día?" en Nutrición) -- a diferencia de coach-weekly.js
// no la llama ningún cron, la llama el navegador directamente.
//
// Qué recibe: un resumen YA CALCULADO por el cliente (comidas de hoy,
// objetivo, consumido, restante) -- esta función no hace ninguna cuenta de
// macros, solo le pasa esos números a la IA para que escriba un párrafo
// corto con criterio. Mantener el cálculo en el cliente (mismo criterio que
// ya usa MealIdeaCard) es deliberado: los números no dependen de que la IA
// los calcule bien, la IA solo redacta.
//
// Por qué no usa SUPABASE_SERVICE_ROLE_KEY: esta función no lee ni escribe
// nada en la base -- el cliente ya tiene sus propios datos y es el cliente
// quien guarda el resultado en daily_suggestions con su propia sesión (clave
// anónima + RLS), igual que cualquier otra escritura normal de la app. Lo
// único que valida este endpoint es que quien llama tenga una sesión válida
// de Supabase (Authorization: Bearer <access_token>), para que no cualquiera
// que encuentre la URL pueda gastar tu cupo gratis de IA sin estar logueado.
//
// Variables de entorno: reusa las mismas que coach-weekly.js para la IA
// (GEMINI_API_KEY/GEMINI_MODEL/ZAI_API_KEY/ZAI_MODEL) y las mismas de
// Supabase que ya tenía la app para el cliente (VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY) -- no hace falta cargar nada nuevo en Vercel.

import { createClient } from "@supabase/supabase-js";
import { generateNote } from "./_ai-providers.js";

const SYSTEM_PROMPT = `Sos el coach personal de un usuario de gimnasio que entrena fuerza y cuida su nutrición. Te paso un resumen de lo que comió HOY (datos ya calculados, en JSON): las comidas que cargó, su objetivo diario y lo que le queda por cubrir.

Reglas:
- Español rioplatense, tono cercano y directo.
- Entre 40 y 80 palabras, en prosa corrida (sin viñetas ni títulos).
- Usá solo los números que te paso — no inventes datos ni alimentos que no están.
- Enfocate en lo que queda del día: qué priorizar en las próximas comidas según lo que ya cubrió y lo que todavía le falta (o le sobra). Si ya se pasó de algún objetivo, decilo con naturalidad, no como un reto.
- Si casi no cargó comidas todavía, no lo trates como un problema — es temprano o falta registrar, decilo así.
- No repitas los números tal cual en formato lista — ya los ve arriba en la app. Dale una lectura con criterio.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Método no permitido.");
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).send("No autorizado.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error("Sugerencia diaria: faltan variables de entorno (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).");
    res.status(500).send("Faltan variables de entorno.");
    return;
  }

  const supabase = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).send("No autorizado.");
    return;
  }

  const summary = req.body?.summary;
  if (!summary || typeof summary !== "object") {
    res.status(400).send("Falta el resumen del día.");
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const zaiKey = process.env.ZAI_API_KEY;
  const zaiModel = process.env.ZAI_MODEL || "glm-4.5-flash";
  if (!geminiKey && !zaiKey) {
    console.error("Sugerencia diaria: falta al menos una clave de IA (GEMINI_API_KEY o ZAI_API_KEY).");
    res.status(500).send("Falta configurar un proveedor de IA (GEMINI_API_KEY o ZAI_API_KEY).");
    return;
  }

  const userPrompt = `Resumen de hoy:\n\n${JSON.stringify(summary, null, 2)}`;

  try {
    const { text, provider } = await generateNote({ geminiKey, geminiModel, zaiKey, zaiModel, systemPrompt: SYSTEM_PROMPT, userPrompt });
    res.status(200).json({ text, provider });
  } catch (err) {
    console.error("Sugerencia diaria: fallo la IA:", err.message);
    res.status(502).json({ error: err.message });
  }
}
