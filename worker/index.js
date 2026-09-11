// AI damage-check endpoint for the Workshop photo lightbox.
// Fetches a job photo's Google Drive URL server-side, sends it to Cloudflare
// Workers AI (native binding — no external API key, no per-call billing
// account) for a per-panel damage read, and returns structured JSON. This is
// a quoting-assist judgment call, not a certified inspection.

const ALLOWED_HOSTS = ["drive.google.com", "lh3.googleusercontent.com"];
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const DAMAGE_CHECK_PROMPT = `You are assisting a car workshop's collision estimator. Look at this vehicle photo and identify each exterior body panel visible in the frame (e.g. bumper, headlight, grille, door, fender, mirror, hood, roof, trunk...). For each visible panel, say whether it looks damaged (dents, scratches, cracks, misalignment, missing pieces) and give a short note. Only list panels actually visible in the photo. This is a preliminary quoting-assist judgment call for staff to review, not a certified inspection. Keep notes brief (under ~20 words).

Respond with ONLY valid JSON, no other text, matching exactly this shape:
{"panels":[{"panel":"front bumper","damaged":true,"note":"short note"}],"overall_note":"short overall note"}`;

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
  if (!env.WORKER_SHARED_SECRET || sharedSecret !== env.WORKER_SHARED_SECRET) {
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
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
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

  let aiResult;
  try {
    aiResult = await env.AI.run(VISION_MODEL, {
      messages: [
        { role: "system", content: "You are a helpful assistant that only responds with valid JSON." },
        { role: "user", content: DAMAGE_CHECK_PROMPT },
      ],
      image: imageDataUri,
      max_tokens: 1024,
    });
  } catch (e) {
    return json({ ok: false, error: `Workers AI error: ${e.message || e}` }, 502);
  }

  const rawText = aiResult?.response ?? aiResult?.result ?? "";
  const parsedResult = extractJson(rawText);
  if (!parsedResult.ok) {
    return json({ ok: false, error: parsedResult.error }, 502);
  }
  return json({ ok: true, result: parsedResult.data });
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
