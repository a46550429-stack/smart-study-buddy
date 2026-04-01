import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);

    // Get upcoming deadlines due within 24 hours that aren't completed
    const { data: deadlines, error: dlErr } = await supabase
      .from("deadlines")
      .select("*")
      .eq("completed", false)
      .gt("due_date", now.toISOString())
      .lte("due_date", in24h.toISOString());

    if (dlErr) throw dlErr;
    if (!deadlines?.length) {
      return new Response(JSON.stringify({ message: "No upcoming deadlines", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let created = 0;
    for (const deadline of deadlines) {
      const dueDate = new Date(deadline.due_date);
      const hoursLeft = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      const isUrgent = dueDate <= in1h;

      // Check if we already sent a reminder for this deadline recently (last 12 hours)
      const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("deadline_id", deadline.id)
        .eq("user_id", deadline.user_id)
        .gte("created_at", twelveHoursAgo.toISOString())
        .limit(1);

      if (existing && existing.length > 0) continue;

      const title = isUrgent ? `⚠️ Urgent: ${deadline.title}` : `📅 Reminder: ${deadline.title}`;
      const message = isUrgent
        ? `Due in less than 1 hour! ${deadline.subject ? `(${deadline.subject})` : ""}`
        : `Due in ${hoursLeft} hours. ${deadline.subject ? `(${deadline.subject})` : ""}`;

      const { error: insertErr } = await supabase.from("notifications").insert({
        user_id: deadline.user_id,
        title,
        message,
        type: isUrgent ? "deadline_urgent" : "deadline_reminder",
        deadline_id: deadline.id,
      });

      if (!insertErr) created++;
    }

    return new Response(JSON.stringify({ message: "Reminders processed", created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
