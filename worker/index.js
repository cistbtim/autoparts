const SYSTEM_PROMPT = `You are a vehicle catalog research assistant for a South African auto parts and workshop system. Given a vehicle make and model, list the known chassis-code generations for that model, with accurate production year ranges.

Rules:
- Only include generations you are confident are real. Do not invent chassis codes or year ranges.
- If you don't know the exact chassis code or trim variant for a generation, leave that field as an empty string rather than guessing.
- year_to should be null if the generation is still in production.
- body_note should be a short note like "Sedan", "Hatchback", "SUV, 5-seat" — keep it brief.
- Return every distinct generation you know of for this make/model, oldest first.`;

const SCHEMA = {
  type: "object",
  properties: {
    generations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chassis_code: { type: "string" },
          variant: { type: "string" },
          year_from: { type: "integer" },
          year_to: { type: ["integer", "null"] },
          body_note: { type: "string" },
        },
        required: ["chassis_code", "variant", "year_from", "year_to", "body_note"],
        additionalProperties: false,
      },
    },
  },
  required: ["generations"],
  additionalProperties: false,
};

async function handleVehicleLookup(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const make = (body?.make || "").trim();
  const model = (body?.model || "").trim();
  if (!make || !model) {
    return jsonResponse({ error: "make and model are required" }, 400);
  }

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse(
      { error: "Server not configured: ANTHROPIC_API_KEY is not set. Run `wrangler secret put ANTHROPIC_API_KEY` against this Worker." },
      500
    );
  }

  let anthropicRes;
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Make: ${make}\nModel: ${model}` }],
        output_config: {
          format: { type: "json_schema", schema: SCHEMA },
        },
      }),
    });
  } catch {
    return jsonResponse({ error: "Failed to reach Anthropic API" }, 502);
  }

  if (!anthropicRes.ok) {
    if (anthropicRes.status === 429) {
      return jsonResponse({ error: "Lookup service is busy, please try again shortly." }, 503);
    }
    if (anthropicRes.status === 401 || anthropicRes.status === 403) {
      return jsonResponse({ error: "Server misconfigured — check ANTHROPIC_API_KEY." }, 500);
    }
    return jsonResponse({ error: "Lookup failed, please try again." }, 502);
  }

  const data = await anthropicRes.json();

  if (data.stop_reason === "refusal") {
    return jsonResponse({ generations: [], note: "The AI declined to answer this lookup." });
  }

  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock) {
    return jsonResponse({ error: "No content returned from lookup." }, 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return jsonResponse({ error: "Lookup returned malformed data." }, 502);
  }

  const result = { generations: Array.isArray(parsed.generations) ? parsed.generations : [] };
  if (data.stop_reason === "max_tokens") {
    result.note = "Response may be incomplete — result list was cut short.";
  }
  return jsonResponse(result);
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/vehicle-lookup" && request.method === "POST") {
      return handleVehicleLookup(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
