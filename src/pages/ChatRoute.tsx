import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import ChatPage from "./ChatPage";
import DashboardLayout from "@/components/DashboardLayout";

export default function ChatRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  return (
    <DashboardLayout>
      <ChatPage />
    </DashboardLayout>
  );
}
