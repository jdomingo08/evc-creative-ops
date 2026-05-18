export interface RealtimeSessionConfig {
  model: string;
  voice: string;
  instructions: string;
  tools: Array<{
    type: "function";
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface RealtimeSessionResult {
  ephemeralKey: string;
  sessionId: string;
  model: string;
  expiresAt: number;
}

export async function createRealtimeSession(
  config: RealtimeSessionConfig,
): Promise<RealtimeSessionResult> {
  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      voice: config.voice,
      modalities: ["audio", "text"],
      turn_detection: null,
      input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
      instructions: config.instructions,
      tools: config.tools,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI realtime session create failed: ${response.status} ${body}`,
    );
  }

  const data = (await response.json()) as {
    id: string;
    model: string;
    expires_at: number;
    client_secret: { value: string; expires_at: number };
  };

  return {
    ephemeralKey: data.client_secret.value,
    sessionId: data.id,
    model: data.model,
    expiresAt: data.client_secret.expires_at,
  };
}
