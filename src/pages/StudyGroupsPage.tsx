import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { Users, Plus, Send, ArrowLeft, Copy, UserPlus, Trash2, LogOut } from "lucide-react";

interface StudyGroup {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  created_by: string;
  invite_code: string;
  created_at: string;
}

interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

export default function StudyGroupsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedGroup, setSelectedGroup] = useState<StudyGroup | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "", subject: "" });
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch user's groups
  const { data: groups = [] } = useQuery({
    queryKey: ["study-groups", user?.id],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("study_group_members")
        .select("group_id")
        .eq("user_id", user!.id);
      if (!memberships?.length) return [];
      const groupIds = memberships.map((m) => m.group_id);
      const { data } = await supabase
        .from("study_groups")
        .select("*")
        .in("id", groupIds)
        .order("updated_at", { ascending: false });
      return (data ?? []) as StudyGroup[];
    },
    enabled: !!user,
  });

  // Fetch messages for selected group
  const { data: messages = [] } = useQuery({
    queryKey: ["group-messages", selectedGroup?.id],
    queryFn: async () => {
      const { data: msgs } = await supabase
        .from("study_group_messages")
        .select("*")
        .eq("group_id", selectedGroup!.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (!msgs?.length) return [];
      // Fetch sender profiles
      const userIds = [...new Set(msgs.map((m) => m.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const nameMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);
      return msgs.map((m) => ({ ...m, sender_name: nameMap.get(m.user_id) || "Unknown" })) as GroupMessage[];
    },
    enabled: !!selectedGroup,
  });

  // Fetch members count
  const { data: memberCount = 0 } = useQuery({
    queryKey: ["group-members-count", selectedGroup?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("study_group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", selectedGroup!.id);
      return count ?? 0;
    },
    enabled: !!selectedGroup,
  });

  // Realtime subscription for messages
  useEffect(() => {
    if (!selectedGroup) return;
    const channel = supabase
      .channel(`group-messages-${selectedGroup.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "study_group_messages", filter: `group_id=eq.${selectedGroup.id}` },
        async (payload) => {
          const newMsg = payload.new as GroupMessage;
          // Fetch sender name
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", newMsg.user_id)
            .single();
          newMsg.sender_name = profile?.full_name || "Unknown";
          queryClient.setQueryData<GroupMessage[]>(["group-messages", selectedGroup.id], (old = []) => {
            if (old.some((m) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedGroup?.id, queryClient]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Create group
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: group, error } = await supabase
        .from("study_groups")
        .insert({ name: newGroup.name, description: newGroup.description || null, subject: newGroup.subject || null, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      // Add creator as admin member
      await supabase.from("study_group_members").insert({ group_id: group.id, user_id: user!.id, role: "admin" });
      return group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study-groups"] });
      setCreateOpen(false);
      setNewGroup({ name: "", description: "", subject: "" });
      toast({ title: "Group created!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Join group
  const joinMutation = useMutation({
    mutationFn: async () => {
      const { data: group, error: findErr } = await supabase
        .from("study_groups")
        .select("id, name")
        .eq("invite_code", joinCode.trim())
        .single();
      if (findErr || !group) throw new Error("Invalid invite code");
      const { error } = await supabase
        .from("study_group_members")
        .insert({ group_id: group.id, user_id: user!.id });
      if (error) {
        if (error.code === "23505") throw new Error("You're already a member");
        throw error;
      }
      return group;
    },
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ["study-groups"] });
      setJoinOpen(false);
      setJoinCode("");
      toast({ title: `Joined ${group.name}!` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Send message
  const sendMessage = async () => {
    if (!message.trim() || !selectedGroup) return;
    const content = message.trim();
    setMessage("");
    await supabase.from("study_group_messages").insert({
      group_id: selectedGroup.id,
      user_id: user!.id,
      content,
    });
  };

  // Leave group
  const leaveMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await supabase.from("study_group_members").delete().eq("group_id", groupId).eq("user_id", user!.id);
    },
    onSuccess: () => {
      setSelectedGroup(null);
      queryClient.invalidateQueries({ queryKey: ["study-groups"] });
      toast({ title: "Left group" });
    },
  });

  // Delete group
  const deleteMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await supabase.from("study_groups").delete().eq("id", groupId);
    },
    onSuccess: () => {
      setSelectedGroup(null);
      queryClient.invalidateQueries({ queryKey: ["study-groups"] });
      toast({ title: "Group deleted" });
    },
  });

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Invite code copied!" });
  };

  if (selectedGroup) {
    return (
      <DashboardLayout>
        <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-screen">
          {/* Chat header */}
          <div className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card">
            <Button variant="ghost" size="icon" onClick={() => setSelectedGroup(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-foreground truncate">{selectedGroup.name}</h2>
              <p className="text-xs text-muted-foreground">{memberCount} members{selectedGroup.subject ? ` · ${selectedGroup.subject}` : ""}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => copyInviteCode(selectedGroup.invite_code)} title="Copy invite code">
              <Copy className="h-4 w-4" />
            </Button>
            {selectedGroup.created_by === user?.id ? (
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMutation.mutate(selectedGroup.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => leaveMutation.mutate(selectedGroup.id)}>
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3 max-w-3xl mx-auto">
              {messages.length === 0 && (
                <p className="text-center text-muted-foreground py-12 text-sm">No messages yet. Start the conversation!</p>
              )}
              {messages.map((msg) => {
                const isOwn = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      {!isOwn && <p className="text-xs font-medium mb-1 opacity-70">{msg.sender_name}</p>}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className={`text-[10px] mt-1 ${isOwn ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>

          {/* Message input */}
          <div className="border-t border-border p-3 bg-card">
            <form
              className="flex gap-2 max-w-3xl mx-auto"
              onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            >
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={!message.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Study Groups</h1>
            <p className="text-muted-foreground text-sm mt-1">Collaborate and learn together in real-time</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><UserPlus className="h-4 w-4 mr-2" />Join</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Join a Study Group</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <Input placeholder="Enter invite code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
                  <Button className="w-full" onClick={() => joinMutation.mutate()} disabled={!joinCode.trim() || joinMutation.isPending}>
                    {joinMutation.isPending ? "Joining..." : "Join Group"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Create</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Study Group</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <Input placeholder="Group name *" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
                  <Input placeholder="Subject (optional)" value={newGroup.subject} onChange={(e) => setNewGroup({ ...newGroup, subject: e.target.value })} />
                  <Textarea placeholder="Description (optional)" value={newGroup.description} onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })} rows={3} />
                  <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!newGroup.name.trim() || createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Group"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {groups.length === 0 ? (
          <Card className="border-border">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-foreground mb-1">No study groups yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create a new group or join one with an invite code</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {groups.map((group) => (
              <Card
                key={group.id}
                className="border-border hover:shadow-elevated transition-all cursor-pointer"
                onClick={() => setSelectedGroup(group)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-semibold">{group.name}</CardTitle>
                    {group.subject && <Badge variant="secondary" className="text-xs">{group.subject}</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  {group.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{group.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Code: {group.invite_code}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); copyInviteCode(group.invite_code); }}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
