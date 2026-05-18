const REALTIME_MODEL_PRIORITY = ["gpt-realtime", "gpt-4o-realtime-preview"];

let resolvedModel: string | null = null;

export async function resolveRealtimeModel(): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY must be set to resolve realtime model");
  }

  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAI model list: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as { data: Array<{ id: string }> };
  const availableIds = new Set(body.data.map((m) => m.id));

  for (const candidate of REALTIME_MODEL_PRIORITY) {
    if (availableIds.has(candidate)) {
      resolvedModel = candidate;
      return candidate;
    }
  }

  const realtimeIds = [...availableIds].filter((id) => id.includes("realtime"));
  throw new Error(
    `No realtime model available on this account. Tried ${REALTIME_MODEL_PRIORITY.join(", ")}. ` +
      `Available realtime-tagged models: ${realtimeIds.join(", ") || "(none)"}`,
  );
}

export function getRealtimeModel(): string {
  if (resolvedModel === null) {
    throw new Error(
      "Realtime model has not been resolved yet. resolveRealtimeModel() must be called at server startup.",
    );
  }
  return resolvedModel;
}
