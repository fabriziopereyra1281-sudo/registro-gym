// Compartido entre /api/coach-weekly.js y /api/daily-suggestion.js: la misma
// cadena de proveedores de IA gratuitos (Gemini como principal, GLM/z.ai como
// respaldo), para no mantener dos copias de la lógica de fallback. El prefijo
// "_" en el nombre del archivo es la convención de Vercel para que no lo
// trate como su propia ruta (no queda expuesto como /api/_ai-providers).
//
// Si en el futuro se agrega otro proveedor, alcanza con sumar una función
// callX() con la misma forma (recibe apiKey/model/systemPrompt/userPrompt,
// devuelve texto o tira error) y encadenarla en generateNote().
import { GoogleGenAI } from "@google/genai";

// Google Gemini (gratis con limite diario). Lanza si falla la llamada o si
// no hay texto en la respuesta -- generateNote() decide que hacer con eso.
export async function callGemini({ apiKey, model, systemPrompt, userPrompt }) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: { systemInstruction: systemPrompt },
  });
  const text = response.text?.trim();
  if (!text) throw new Error("Gemini: respuesta sin texto");
  return text;
}

// GLM (Zhipu / z.ai), capa gratuita. API compatible con el formato de
// OpenAI (chat completions) -- no tiene SDK propio en npm digno de sumar
// como dependencia solo por esto, asi que es un fetch directo.
export async function callGLM({ apiKey, model, systemPrompt, userPrompt }) {
  const res = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`GLM: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("GLM: respuesta sin texto");
  return text;
}

// Intenta Gemini primero; si falla (cupo gratis agotado, error de red, clave
// mal puesta) cae a GLM como respaldo. Si falta la clave de alguno de los
// dos directamente lo salta, sin contarlo como un fallo. Devuelve de que
// proveedor/modelo salio el texto para poder guardarlo junto a la respuesta
// -- util para ver cual esta respondiendo en la practica.
export async function generateNote({ geminiKey, geminiModel, zaiKey, zaiModel, systemPrompt, userPrompt }) {
  const errors = [];
  if (geminiKey) {
    try {
      const text = await callGemini({ apiKey: geminiKey, model: geminiModel, systemPrompt, userPrompt });
      return { text, provider: `gemini:${geminiModel}` };
    } catch (err) {
      errors.push(`Gemini: ${err.message}`);
    }
  }
  if (zaiKey) {
    try {
      const text = await callGLM({ apiKey: zaiKey, model: zaiModel, systemPrompt, userPrompt });
      return { text, provider: `zai:${zaiModel}` };
    } catch (err) {
      errors.push(`GLM: ${err.message}`);
    }
  }
  throw new Error(`Ningun proveedor de IA respondio. ${errors.join(" | ") || "No hay ninguna clave configurada (GEMINI_API_KEY / ZAI_API_KEY)."}`);
}
