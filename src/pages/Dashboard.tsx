import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Calendar, ClipboardList, BookOpen, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: recentSessions } = useQuery({
    queryKey: ["recent-sessions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
    enabled: !!user,
  });

  const firstName = profile?.full_name?.split(" ")[0] || "Student";

  const quickActions = [
    { title: "AI Chat", description: "Ask your AI assistant anything", icon: MessageSquare, to: "/chat", color: "bg-primary" },
    { title: "Timetable", description: "Manage your schedule", icon: Calendar, to: "/timetable", color: "bg-accent" },
    { title: "Deadlines", description: "Coming soon", icon: ClipboardList, to: "/", color: "bg-warning" },
    { title: "Resources", description: "Coming soon", icon: BookOpen, to: "/", color: "bg-success" },
  ];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Welcome back, {firstName} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Here's your academic overview for today.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Link key={action.title} to={action.to}>
            <Card className="group hover:shadow-elevated transition-all duration-200 cursor-pointer border-border h-full">
              <CardContent className="p-5">
                <div className={`${action.color} rounded-lg p-2.5 w-fit mb-3`}>
                  <action.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-foreground">{action.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent chats */}
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-lg">Recent Conversations</CardTitle>
          <Link to="/chat">
            <Button variant="ghost" size="sm" className="text-primary">
              View all <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentSessions && recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((s) => (
                <Link key={s.id} to="/chat" className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No conversations yet. Start a chat with your AI assistant!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
