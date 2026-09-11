// AI damage-check endpoint for the Workshop photo lightbox.
// Fetches a job photo's Google Drive URL server-side, sends it to the
// Anthropic Messages API for a per-panel damage read, and returns structured
// JSON. This is a quoting-assist judgment call, not a certified inspection.

const ALLOWED_HOSTS = ["drive.google.com", "lh3.googleusercontent.com"];
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const DAMAGE_CHECK_PROMPT = `You are assisting a car workshop's collision estimator. Look at this vehicle photo and identify each exterior body panel visible in the frame (e.g. bumper, headlight, grille, door, fender, mirror, hood, roof, trunk...). For each visible panel, say whether it looks damaged (dents, scratches, cracks, misalignment, missing pieces) and give a short note. Only list panels actually visible in the photo. This is a preliminary quoting-assist judgment call for staff to review, not a certified inspection. Keep notes brief (under ~20 words). Respond with JSON only, matching this shape: {"panels":[{"panel":"...","damaged":true,"note":"..."}],"overall_note":"..."}`;

const DAMAGE_SCHEMA = {
  type: "object",
  properties: {
    panels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          panel: { type: "string" },
          damaged: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["panel", "damaged", "note"],
        additionalProperties: false,
      },
    },
    overall_note: { type: "string" },
  },
  required: ["panels", "overall_note"],
  additionalProperties: false,
};

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
  if (!env.ANTHROPIC_API_KEY) {
    return json({ ok: false, error: "Server not configured (missing ANTHROPIC_API_KEY)" }, 500);
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
  const base64 = arrayBufferToBase64(buf);
  const model = env.ANTHROPIC_MODEL || "claude-haiku-4-5";

  const result = await callAnthropicStructured(env, model, contentType, base64);
  if (!result.ok) return json(result, result.status || 502);
  return json({ ok: true, result: result.data });
}

async function callAnthropicStructured(env, model, contentType, base64) {
  // Primary path: ask for JSON-schema-constrained output directly.
  const structuredResp = await anthropicRequest(env, {
    model,
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: DAMAGE_SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: contentType, data: base64 } },
        { type: "text", text: DAMAGE_CHECK_PROMPT },
      ],
    }],
  });

  if (structuredResp.ok) {
    const parsed = extractJson(structuredResp.data);
    if (parsed.ok) return { ok: true, data: parsed.data };
  }

  // Fallback: some model/vision combinations may not honor output_config.format
  // reliably alongside an image block — ask for JSON in plain prompt text and
  // parse it manually instead of failing the whole request.
  const plainResp = await anthropicRequest(env, {
    model,
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: contentType, data: base64 } },
        { type: "text", text: DAMAGE_CHECK_PROMPT },
      ],
    }],
  });
  if (!plainResp.ok) return { ok: false, error: plainResp.error, status: plainResp.status };

  const parsed = extractJson(plainResp.data);
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 502 };
  return { ok: true, data: parsed.data };
}

async function anthropicRequest(env, payload) {
  let resp;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "Could not reach Anthropic API", status: 502 };
  }
  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { ok: false, error: data?.error?.message || `Anthropic API error (${resp.status})`, status: 502 };
  }
  if (data?.stop_reason === "refusal") {
    return { ok: false, error: "The AI declined to analyze this image.", status: 422 };
  }
  return { ok: true, data };
}

function extractJson(anthropicResponseBody) {
  const textBlock = anthropicResponseBody.content?.find((b) => b.type === "text");
  if (!textBlock?.text) return { ok: false, error: "Model returned no text content" };
  try {
    return { ok: true, data: JSON.parse(textBlock.text) };
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
