import { useCallback, useEffect, useRef, useState } from "react";
import {
  reduceRealtimeState,
  type RealtimeEvent,
  type RealtimeState,
} from "./state-machine";

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

interface SessionCreateResponse {
  ephemeralKey: string;
  sessionId: string;
  model: string;
  expiresAt: number;
}

interface UseRealtimeSessionResult {
  state: RealtimeState;
  error: Error | null;
  userTranscript: string;
  assistantTranscript: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
}

export function useRealtimeSession(conversationId: number): UseRealtimeSessionResult {
  const [state, setState] = useState<RealtimeState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [userTranscript, setUserTranscript] = useState("");
  const [assistantTranscript, setAssistantTranscript] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const turnInProgressRef = useRef(false);
  const mountedRef = useRef(true);
  // Tracks the heading of the most recent successful lookup_handbook call in the current turn.
  // Reset on each startSpeaking; persisted to the assistant message at response.done.
  const lastCitationRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dispatch = useCallback((event: RealtimeEvent) => {
    setState((prev) => reduceRealtimeState(prev, event));
  }, []);

  const tearDown = useCallback(() => {
    if (localTrackRef.current) {
      localTrackRef.current.stop();
      localTrackRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    tearDown();
    dispatch({ type: "disconnect" });
  }, [dispatch, tearDown]);

  const persistTurn = useCallback(
    async (userText: string, assistantText: string, citation: string | null) => {
      if (!userText || !assistantText) return;
      const url = `/api/openai/conversations/${conversationId}/realtime/transcript`;
      const body = JSON.stringify({ userText, assistantText, citation });
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok && res.status >= 500) {
          await new Promise((r) => setTimeout(r, 1000));
          const retry = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
          if (!retry.ok) console.warn("Transcript save failed after retry:", retry.status);
        } else if (!res.ok) {
          console.warn("Transcript save failed:", res.status);
        }
      } catch (err) {
        console.warn("Transcript save threw:", err);
      }
    },
    [conversationId],
  );

  const handleDataChannelEvent = useCallback(
    async (raw: string) => {
      let evt: { type: string; [k: string]: unknown };
      try {
        evt = JSON.parse(raw);
      } catch {
        return;
      }

      switch (evt.type) {
        case "conversation.item.input_audio_transcription.completed":
          setUserTranscript(String(evt.transcript ?? ""));
          break;
        case "response.audio_transcript.delta":
          dispatch({ type: "transcript-delta" });
          setAssistantTranscript((prev) => prev + String(evt.delta ?? ""));
          break;
        case "response.audio_transcript.done":
          setAssistantTranscript(String(evt.transcript ?? ""));
          break;
        case "response.function_call_arguments.done": {
          const callId = String(evt.call_id ?? "");
          const name = String(evt.name ?? "");
          if (name !== "lookup_handbook") break;
          let parsed: { query?: string } = {};
          try {
            parsed = JSON.parse(String(evt.arguments ?? "{}"));
          } catch {
            parsed = {};
          }
          let lookup = { heading: null as string | null, content: "" };
          try {
            const r = await fetch("/api/openai/handbook/lookup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: parsed.query ?? "" }),
            });
            if (r.ok) lookup = await r.json();
          } catch {
            lookup = { heading: null, content: "" };
          }
          if (lookup.heading) {
            lastCitationRef.current = lookup.heading;
          }
          dataChannelRef.current?.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: callId,
                output: JSON.stringify(lookup.heading ? lookup : { error: "handbook_unavailable" }),
              },
            }),
          );
          dataChannelRef.current?.send(JSON.stringify({ type: "response.create" }));
          break;
        }
        case "response.done": {
          turnInProgressRef.current = false;
          dispatch({ type: "response-done" });
          const citation = lastCitationRef.current;
          queueMicrotask(() => {
            setAssistantTranscript((aText) => {
              setUserTranscript((uText) => {
                void persistTurn(uText, aText, citation);
                return uText;
              });
              return aText;
            });
          });
          break;
        }
        case "response.error": {
          setError(new Error(String(evt.error ?? "Realtime response error")));
          turnInProgressRef.current = false;
          dispatch({ type: "response-done" });
          break;
        }
        default:
          break;
      }
    },
    [dispatch, persistTurn],
  );

  const connect = useCallback(async () => {
    if (pcRef.current) return;
    setError(null);
    dispatch({ type: "connect-requested" });

    try {
      const sessionRes = await fetch(
        `/api/openai/conversations/${conversationId}/realtime/session`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      if (!sessionRes.ok) {
        throw new Error(`Session mint failed: ${sessionRes.status}`);
      }
      const session: SessionCreateResponse = await sessionRes.json();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      track.enabled = false;
      localTrackRef.current = track;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.addTrack(track, stream);

      const audio = audioElRef.current ?? new Audio();
      audio.autoplay = true;
      audioElRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;
      dc.onopen = () => {
        if (!mountedRef.current) return;
        dispatch({ type: "connection-opened" });
      };
      dc.onmessage = (e) => {
        void handleDataChannelEvent(String(e.data));
      };

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected"
        ) {
          setError(new Error("Connection lost"));
          dispatch({ type: "terminal-error" });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(OPENAI_REALTIME_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpRes.ok) {
        throw new Error(`SDP exchange failed: ${sdpRes.status}`);
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      tearDown();
      dispatch({ type: "terminal-error" });
    }
  }, [conversationId, dispatch, handleDataChannelEvent, tearDown]);

  const startSpeaking = useCallback(() => {
    if (!localTrackRef.current) return;
    setUserTranscript("");
    setAssistantTranscript("");
    lastCitationRef.current = null;
    localTrackRef.current.enabled = true;
    turnInProgressRef.current = true;
    dispatch({ type: "start-speaking" });
  }, [dispatch]);

  const stopSpeaking = useCallback(() => {
    if (!localTrackRef.current) return;
    localTrackRef.current.enabled = false;
    dataChannelRef.current?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    dataChannelRef.current?.send(JSON.stringify({ type: "response.create" }));
    dispatch({ type: "stop-speaking" });
  }, [dispatch]);

  useEffect(() => {
    const onBeforeUnload = () => tearDown();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      tearDown();
    };
  }, [tearDown]);

  return {
    state,
    error,
    userTranscript,
    assistantTranscript,
    connect,
    disconnect,
    startSpeaking,
    stopSpeaking,
  };
}
