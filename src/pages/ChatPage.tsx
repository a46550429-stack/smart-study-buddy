import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, Plus, MessageSquare, Loader2, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch sessions
  const { data: sessions } = useQuery({
    queryKey: ["chat-sessions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  // Fetch messages for active session
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", activeSessionId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
      });
  }, [activeSessionId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createSession = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ user_id: user!.id, title: "New Chat" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setActiveSessionId(data.id);
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("chat_sessions").delete().eq("id", id);
    },
    onSuccess: () => {
      setActiveSessionId(null);
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ user_id: user!.id, title: input.slice(0, 50) })
        .select()
        .single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      sessionId = data.id;
      setActiveSessionId(sessionId);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    }

    const userMsg: Msg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);

    // Save user message
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      user_id: user!.id,
      role: "user",
      content: input,
    });

    // Update session title if first message
    if (messages.length === 0) {
      await supabase.from("chat_sessions").update({ title: input.slice(0, 60) }).eq("id", sessionId);
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    }

    // Stream AI response
    let assistantContent = "";
    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-assist-chat`;
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${resp.status})`);
      }

      if (!resp.body) throw new Error("No stream");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (err: any) {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
      assistantContent = "Sorry, I encountered an error. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    }

    // Save assistant message
    if (assistantContent) {
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        user_id: user!.id,
        role: "assistant",
        content: assistantContent,
      });
      await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
    }

    setIsStreaming(false);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Sessions sidebar */}
      <div className="hidden md:flex w-72 flex-col bg-card border-r border-border">
        <div className="p-4">
          <Button onClick={() => createSession.mutate()} className="w-full" size="sm">
            <Plus className="h-4 w-4 mr-2" /> New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1 px-2">
          {sessions?.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors",
                activeSessionId === s.id ? "bg-muted" : "hover:bg-muted/50"
              )}
              onClick={() => setActiveSessionId(s.id)}
            >
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate flex-1">{s.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession.mutate(s.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <ScrollArea className="flex-1 p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-20 space-y-4 animate-fade-in">
                <div className="rounded-2xl gradient-hero p-4 w-fit mx-auto">
                  <MessageSquare className="h-8 w-8 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-display font-bold">How can I help you today?</h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Ask me about your courses, study tips, or any academic questions. I'm here to help!
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex animate-fade-in",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                    msg.role === "user"
                      ? "bg-chat-user text-primary-foreground rounded-br-md"
                      : "bg-chat-assistant text-chat-assistant-foreground rounded-bl-md"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-chat-assistant text-chat-assistant-foreground rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="max-w-3xl mx-auto flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your studies..."
              disabled={isStreaming}
              className="flex-1"
            />
            <Button type="submit" disabled={isStreaming || !input.trim()} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
