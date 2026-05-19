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
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: config.model,
        instructions: config.instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: null,
          },
          output: {
            voice: config.voice,
          },
        },
        tools: config.tools,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI realtime session create failed: ${response.status} ${body}`,
    );
  }

  const data = (await response.json()) as {
    value: string;
    expires_at: number;
    session: {
      id: string;
      model: string;
    };
  };

  return {
    ephemeralKey: data.value,
    sessionId: data.session.id,
    model: data.session.model,
    expiresAt: data.expires_at,
  };
}
