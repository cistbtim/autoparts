// AI damage-check endpoint for the Workshop photo lightbox.
// Fetches a job photo's Google Drive URL server-side, sends it to Cloudflare
// Workers AI (native binding — no external API key, no per-call billing
// account) for a per-panel damage read, and returns structured JSON. This is
// a quoting-assist judgment call, not a certified inspection.

const ALLOWED_HOSTS = ["drive.google.com", "lh3.googleusercontent.com"];
const ALLOWED_HOST_SUFFIXES = [".supabase.co"];

function isAllowedHost(hostname) {
  return ALLOWED_HOSTS.includes(hostname) || ALLOWED_HOST_SUFFIXES.some((suf) => hostname.endsWith(suf));
}
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

// Same values already public in the built frontend bundle (VITE_SUPABASE_URL /
// VITE_SUPABASE_KEY) - this is a publishable anon key, not a secret, so it's
// fine to read here directly rather than plumbing it through as a Worker secret.
const SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co";
const SUPABASE_KEY = "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW";

const DAMAGE_CHECK_PROMPT = `You are assisting a car workshop's collision estimator. First work out which side of the car this photo shows (front, rear, left side, or right side) - then only list panels that would actually be visible from that angle. Do not list a panel from the opposite end of the car (e.g. a rear panel like a tail light, rear bumper, boot/trunk, or rear door/window in a photo that shows the front of the car, or vice versa) unless it is genuinely visible in this frame.

For each panel actually visible, say whether it looks damaged (dents, scratches, cracks, misalignment, missing pieces) and give a short note. This is a preliminary quoting-assist judgment call for staff to review, not a certified inspection. Keep notes brief (under ~20 words).

For each panel, also give "x" and "y": your best-guess position of that panel in the photo, as a fraction from 0 to 1 (x = left to right, y = top to bottom). A rough estimate is fine - this is only used to place a marker near the right area, not for precise measurement.

Respond with ONLY valid JSON, no other text, matching exactly this shape:
{"panels":[{"panel":"front bumper","damaged":true,"note":"short note","x":0.3,"y":0.75}],"overall_note":"short overall note"}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/photo-damage-check" && request.method === "POST") {
      return handleDamageCheck(request, env);
    }
    return json({ ok: false, error: "Not found" }, 404);
  },
};

async function handleDamageCheck(request, env) {
  const sharedSecret = request.headers.get("X-Shared-Secret");
  const expectedSecret = await getWorkerSharedSecret();
  if (!expectedSecret || sharedSecret !== expectedSecret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  if (!env.AI) {
    return json({ ok: false, error: "Server not configured (missing AI binding)" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  const photoUrl = body?.photoUrl;
  if (!photoUrl || typeof photoUrl !== "string") {
    return json({ ok: false, error: "photoUrl required" }, 400);
  }

  let parsed;
  try {
    parsed = new URL(photoUrl);
  } catch {
    return json({ ok: false, error: "Invalid photoUrl" }, 400);
  }
  if (!isAllowedHost(parsed.hostname)) {
    return json({ ok: false, error: "photoUrl host not allowed" }, 400);
  }

  let imgResp;
  try {
    imgResp = await fetch(photoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
  } catch {
    return json({ ok: false, error: "Could not reach photo URL" }, 502);
  }
  if (!imgResp.ok) {
    return json({ ok: false, error: `Photo fetch failed (${imgResp.status})` }, 502);
  }
  const contentType = (imgResp.headers.get("content-type") || "").split(";")[0].trim();
  if (!SUPPORTED_IMAGE_TYPES.includes(contentType)) {
    return json({ ok: false, error: `Unsupported image type: ${contentType || "unknown"}` }, 415);
  }

  const buf = await imgResp.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return json({ ok: false, error: "Image too large (>5MB)" }, 413);
  }
  const imageDataUri = `data:${contentType};base64,${arrayBufferToBase64(buf)}`;
  const recentNotes = await getRecentCorrections();
  const prompt = recentNotes.length
    ? `${DAMAGE_CHECK_PROMPT}\n\nStaff have previously written these specific notes on similar photos - real-world feedback, take it into account when relevant to what you see here:\n${recentNotes.map((n) => `- ${n}`).join("\n")}`
    : DAMAGE_CHECK_PROMPT;

  let aiResult;
  try {
    aiResult = await env.AI.run(VISION_MODEL, {
      messages: [
        { role: "system", content: "You are a helpful assistant that only responds with valid JSON." },
        { role: "user", content: prompt },
      ],
      image: imageDataUri,
      max_tokens: 1024,
    });
  } catch (e) {
    return json({ ok: false, error: `Workers AI error: ${e.message || e}` }, 502);
  }

  // Workers AI returns `response` already parsed into an object for this
  // model/prompt combination, not a JSON string - use it directly when so,
  // and only fall back to text-parsing if it ever comes back as a string.
  const responseField = aiResult?.response ?? aiResult?.result;
  const parsedResult = responseField && typeof responseField === "object"
    ? { ok: true, data: responseField }
    : extractJson(responseField || "");
  if (!parsedResult.ok) {
    return json({ ok: false, error: parsedResult.error }, 502);
  }
  return json({ ok: true, result: parsedResult.data });
}

async function getRecentCorrections() {
  try {
    // Only genuine staff-written notes feed back into future prompts - marks
    // the AI created for itself (source=ai) would otherwise reinforce its own
    // guesses rather than learn from real corrections.
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/ai_damage_corrections?select=note&or=(source.eq.human,source.is.null)&order=created_at.desc&limit=5`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!resp.ok) return [];
    const rows = await resp.json().catch(() => []);
    return Array.isArray(rows) ? rows.map((r) => r.note).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function getWorkerSharedSecret() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/settings?id=eq.1&select=worker_shared_secret`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!resp.ok) return null;
    const rows = await resp.json().catch(() => null);
    return rows?.[0]?.worker_shared_secret || null;
  } catch {
    return null;
  }
}

function extractJson(text) {
  if (!text || typeof text !== "string") return { ok: false, error: "Model returned no text content" };
  // Model may wrap JSON in prose or a markdown code fence despite instructions —
  // pull out the first {...} block rather than requiring a clean parse.
  const match = text.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : text;
  try {
    return { ok: true, data: JSON.parse(candidate) };
  } catch {
    return { ok: false, error: "Model returned malformed JSON" };
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
