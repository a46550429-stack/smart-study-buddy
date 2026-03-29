import { type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Brain, LayoutDashboard, MessageSquare, Calendar, ClipboardList, BookOpen, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="p-6 flex items-center gap-3">
          <div className="rounded-lg gradient-hero p-2">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg text-sidebar-primary-foreground">Smart Assist</span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <NavLink to="/" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</NavLink>
          <NavLink to="/chat" icon={<MessageSquare className="h-4 w-4" />}>AI Chat</NavLink>
          <NavLink to="/timetable" icon={<Calendar className="h-4 w-4" />}>Timetable</NavLink>
          <NavLink to="/deadlines" icon={<ClipboardList className="h-4 w-4" />}>Deadlines</NavLink>
        </nav>

        <div className="p-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-lg gradient-hero p-1.5">
            <Brain className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-semibold">Smart Assist</span>
        </div>
        <div className="flex items-center gap-2">
          <NavLink to="/" icon={<LayoutDashboard className="h-4 w-4" />} mobile>Dashboard</NavLink>
          <NavLink to="/chat" icon={<MessageSquare className="h-4 w-4" />} mobile>Chat</NavLink>
          <NavLink to="/timetable" icon={<Calendar className="h-4 w-4" />} mobile>Timetable</NavLink>
          <NavLink to="/deadlines" icon={<ClipboardList className="h-4 w-4" />} mobile>Deadlines</NavLink>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 md:overflow-auto mt-14 md:mt-0">
        {children}
      </main>
    </div>
  );
}
