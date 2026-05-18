import { useState, useRef, useEffect } from "react";
import { 
  useListOpenaiConversations, 
  useCreateOpenaiConversation,
  useGetOpenaiConversation,
  useUpdateOpenaiConversation,
  useDeleteOpenaiConversation,
  useListOpenaiMessages,
  useGetHandbookStatus,
  useRefreshHandbook,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
  getListOpenaiMessagesQueryKey,
  getGetHandbookStatusQueryKey
} from "@workspace/api-client-react";
import { useRealtimeSession } from "@workspace/integrations-openai-ai-react";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2, Edit2, Loader2, Search, ArrowUp, RefreshCw, AlertCircle, Mic, MicOff } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function Home() {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: conversations, isLoading: isLoadingConvos } = useListOpenaiConversations();
  const createConversation = useCreateOpenaiConversation();
  const deleteConversation = useDeleteOpenaiConversation();
  
  const handleNewChat = () => {
    createConversation.mutate(
      { data: { title: "New Chat" } },
      {
        onSuccess: (newConvo) => {
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          setActiveConversationId(newConvo.id);
        }
      }
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      <Sidebar 
        conversations={conversations || []} 
        activeId={activeConversationId} 
        onSelect={setActiveConversationId}
        onNew={handleNewChat}
        isLoading={isLoadingConvos}
        onDelete={(id: number) => {
          deleteConversation.mutate({ id }, {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
              if (activeConversationId === id) setActiveConversationId(null);
            }
          });
        }}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {activeConversationId ? (
          <ActiveChat conversationId={activeConversationId} />
        ) : (
          <EmptyChat onStart={handleNewChat} />
        )}
      </div>
    </div>
  );
}

function Sidebar({ conversations, activeId, onSelect, onNew, isLoading, onDelete }: any) {
  const { data: handbookStatus } = useGetHandbookStatus();
  const refreshHandbook = useRefreshHandbook();

  return (
    <div className="w-72 bg-sidebar border-r border-border flex flex-col h-full shrink-0">
      <div className="p-4 flex items-center justify-between">
        <h1 className="font-semibold text-sm tracking-wide uppercase text-sidebar-foreground/70">Handbook Chat</h1>
        <Button variant="ghost" size="icon" onClick={onNew} className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 rounded-full" title="New Chat" data-testid="button-new-chat">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center p-4 text-xs text-muted-foreground">
              No recent conversations
            </div>
          ) : (
            conversations.map((c: any) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md text-sm transition-all group flex items-start gap-3",
                  activeId === c.id 
                    ? "bg-secondary text-primary font-medium" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
                data-testid={`btn-convo-${c.id}`}
              >
                <MessageSquare className={cn("h-4 w-4 mt-0.5 shrink-0", activeId === c.id ? "text-primary" : "text-muted-foreground/50")} />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="truncate">{c.title || "New Conversation"}</div>
                  <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {formatDistanceToNow(new Date(c.updatedAt || c.createdAt), { addSuffix: true })}
                  </div>
                </div>
                <div 
                  className={cn(
                    "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                    activeId === c.id && "opacity-100"
                  )}
                  onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t border-border bg-sidebar/50 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {handbookStatus?.isLoaded ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Last fetched: {new Date(handbookStatus.lastFetchedAt || "").toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="h-3 w-3" />
                Not connected
              </span>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={() => refreshHandbook.mutate()}
            disabled={refreshHandbook.isPending}
            title="Refresh Handbook"
          >
            <RefreshCw className={cn("h-3 w-3", refreshHandbook.isPending && "animate-spin")} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActiveChat({ conversationId }: { conversationId: number }) {
  const queryClient = useQueryClient();
  const { data: conversation, isLoading } = useGetOpenaiConversation(conversationId);
  const { data: messages, isLoading: isLoadingMsgs } = useListOpenaiMessages(conversationId);
  
  const [inputValue, setInputValue] = useState("");
  const [isStreamingText, setIsStreamingText] = useState(false);
  const [streamedContent, setStreamedContent] = useState("");
  const [streamedCitation, setStreamedCitation] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useRealtimeSession(conversationId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamedContent]);

  const handleSendText = async () => {
    if (!inputValue.trim() || isStreamingText) return;
    
    const content = inputValue;
    setInputValue("");
    setIsStreamingText(true);
    setStreamedContent("");
    setStreamedCitation(null);
    
    try {
      // Optimistic user message update could go here
      const res = await fetch(`/api/openai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      
      if (!res.ok) throw new Error("Failed to send message");
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split("\n\n").filter(Boolean);
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                setStreamedContent(prev => prev + data.content);
              }
              if (data.done) {
                if (data.citation) setStreamedCitation(data.citation);
                setIsStreamingText(false);
                queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(conversationId) });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      setIsStreamingText(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const allMessages = messages || [];

  return (
    <div className="flex flex-col h-full bg-background relative">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      
      <div className="h-14 border-b border-border/50 flex items-center px-6 shrink-0 z-10 bg-background/80 backdrop-blur">
        <h2 className="font-medium text-sm text-foreground/90">{conversation?.title || "Conversation"}</h2>
      </div>

      <ScrollArea className="flex-1 px-6 relative z-10" ref={scrollRef}>
        <div className="max-w-3xl mx-auto py-8 space-y-8">
          {allMessages.map((msg: any) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          
          {isStreamingText && (
            <MessageBubble
              message={{ role: "assistant", content: streamedContent, citation: streamedCitation, isStreaming: true }}
            />
          )}
        </div>
      </ScrollArea>

      {/* Realtime voice block */}
      <div className="border-t border-border/40 px-4 py-2 flex items-center gap-3 shrink-0 z-10 bg-background/60">
        {voice.state === "idle" || voice.state === "error" ? (
          <Button
            type="button"
            onClick={() => voice.connect()}
            size="sm"
            variant="default"
            data-testid="btn-start-voice"
          >
            <Mic className="h-4 w-4 mr-1" />
            Start voice
          </Button>
        ) : (
          <Button
            type="button"
            onClick={voice.disconnect}
            size="sm"
            variant="secondary"
            data-testid="btn-stop-voice"
          >
            <MicOff className="h-4 w-4 mr-1" />
            Stop voice
          </Button>
        )}

        {(voice.state === "ready" ||
          voice.state === "listening" ||
          voice.state === "thinking" ||
          voice.state === "responding") && (
          <Button
            type="button"
            onMouseDown={voice.startSpeaking}
            onMouseUp={voice.stopSpeaking}
            onMouseLeave={() => {
              if (voice.state === "listening") voice.stopSpeaking();
            }}
            onTouchStart={voice.startSpeaking}
            onTouchEnd={voice.stopSpeaking}
            disabled={voice.state !== "ready" && voice.state !== "listening"}
            size="sm"
            variant={voice.state === "listening" ? "destructive" : "outline"}
            data-testid="btn-hold-to-talk"
          >
            {voice.state === "listening" ? "Listening… release to send" : "Hold to talk"}
          </Button>
        )}

        <span className="text-xs text-muted-foreground">
          {voice.state === "connecting" && "Connecting…"}
          {voice.state === "thinking" && "Thinking…"}
          {voice.state === "responding" && "Speaking…"}
          {voice.state === "error" && (voice.error?.message ?? "Error")}
        </span>
      </div>

      {(voice.userTranscript || voice.assistantTranscript) && (
        <div className="px-4 py-2 text-sm space-y-1 shrink-0 z-10 bg-background/60 border-t border-border/40">
          {voice.userTranscript && (
            <div>
              <span className="font-medium text-foreground">You: </span>
              <span className="text-muted-foreground">{voice.userTranscript}</span>
            </div>
          )}
          {voice.assistantTranscript && (
            <div>
              <span className="font-medium text-foreground">Assistant: </span>
              <span className="text-muted-foreground">{voice.assistantTranscript}</span>
            </div>
          )}
        </div>
      )}

      <div className="p-4 md:p-6 shrink-0 z-10 bg-gradient-to-t from-background via-background to-transparent pt-10">
        <div className="max-w-3xl mx-auto relative group">
          <div className="absolute -inset-0.5 bg-primary/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
          <div className="relative bg-secondary/80 backdrop-blur border border-border rounded-xl p-2 flex items-end gap-2 focus-within:border-primary/50 transition-colors">

            <Textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the handbook..."
              className="min-h-[40px] max-h-[200px] bg-transparent border-0 focus-visible:ring-0 resize-none p-2 text-sm leading-relaxed"
              rows={1}
            />

            <Button
              size="icon"
              disabled={!inputValue.trim() || isStreamingText}
              onClick={handleSendText}
              className="h-10 w-10 shrink-0 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {isStreamingText ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
            </Button>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-widest font-mono">
              Hold mic to speak • Enter to send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: any }) {
  const isUser = message.role === "user";
  
  return (
    <div className={cn("flex w-full group", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] rounded-2xl px-5 py-4 text-sm leading-relaxed",
        isUser 
          ? "bg-secondary text-foreground rounded-tr-sm" 
          : "bg-transparent text-foreground/90 border border-border/50 shadow-sm rounded-tl-sm"
      )}>
        <div className="whitespace-pre-wrap">{message.content}</div>
        
        {message.isStreaming && !isUser && (
          <span className="inline-block w-1.5 h-3 ml-1 bg-primary animate-pulse align-middle" />
        )}

        {message.citation && (
          <div className="mt-4 pt-3 border-t border-border/50 flex items-start gap-2 text-xs text-muted-foreground">
            <Search className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
            <span>Source: <span className="font-medium text-foreground/80">{message.citation}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyChat({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      
      <div className="max-w-md w-full relative z-10 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-secondary border border-border flex items-center justify-center mx-auto shadow-2xl shadow-primary/20">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Welcome to Handbook Chat</h2>
          <p className="text-sm text-muted-foreground">Instant answers from the creative production team's institutional knowledge.</p>
        </div>

        <div className="grid gap-3 pt-8 text-left">
          {[
            "What is our standard process for client revisions?",
            "How do I request time off in Q4?",
            "What are the brand color hex codes for the primary logo?"
          ].map((q, i) => (
            <button
              key={i}
              onClick={onStart}
              className="p-4 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/80 hover:border-primary/50 transition-all group text-sm text-muted-foreground hover:text-foreground flex items-center justify-between"
            >
              <span>"{q}"</span>
              <ArrowUp className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all -translate-y-1 group-hover:translate-y-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
