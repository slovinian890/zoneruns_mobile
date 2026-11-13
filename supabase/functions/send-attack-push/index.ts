// "Under attack" push notifications.
//
// Called by the attacker's client right after claim_territory_from_run
// succeeds with a non-empty `stolen` list. The attack_notifications rows
// themselves already exist by then (inserted transactionally inside that
// RPC) — this function's only job is best-effort delivery: look up each
// victim's push token(s) and hand Expo's push API the message. If this
// call never happens (app killed, offline, no FCM/APNs credentials set up
// yet), the row is still there and the realtime in-app banner still fires
// next time the victim's app is open.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AttackRow {
  id: string;
  victim_id: string;
  attacker_id: string;
  attacker_username: string;
  attacker_display_name: string | null;
  area_m2: number;
  place_label: string | null;
}

// Matches services/territoryService.ts's formatArea on the client, so the
// push body reads identically to the in-app realtime banner.
function formatArea(areaM2: number): string {
  if (areaM2 >= 10000) return `${(areaM2 / 1_000_000).toFixed(2)} km²`;
  return `${Math.round(areaM2).toLocaleString()} m²`;
}

function attackMessage(row: AttackRow): { title: string; body: string } {
  const name = row.attacker_display_name || row.attacker_username || "Nekdo";
  const area = formatArea(row.area_m2);
  const placeClause = row.place_label ? ` blizu ${row.place_label}` : "";
  return {
    title: "⚔️ Pod napadom!",
    body: `${name} vam je pravkar vzel ${area}${placeClause} — in še kar nadaljuje!`,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing_authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { run_id } = await req.json().catch(() => ({ run_id: null }));
    if (!run_id || typeof run_id !== "string") {
      return new Response(JSON.stringify({ error: "missing_run_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Scoped to the caller's own JWT — only used to find out who's calling.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "invalid_user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role from here on: push_tokens has no SELECT policy for
    // regular users, and attack_notifications only exposes the victim's
    // own rows — this function legitimately needs to see both sides.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: rows, error: rowsError } = await admin
      .from("attack_notifications")
      .select("id, victim_id, attacker_id, attacker_username, attacker_display_name, area_m2, place_label")
      .eq("run_id", run_id)
      .is("pushed_at", null);

    if (rowsError) {
      return new Response(JSON.stringify({ error: rowsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const attackRows = (rows ?? []) as AttackRow[];
    if (attackRows.length === 0) {
      return new Response(JSON.stringify({ sent: 0, recipients: 0, reason: "nothing_to_send" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only the attacker on this run may trigger pushes for it.
    if (attackRows.some((r) => r.attacker_id !== user.id)) {
      return new Response(JSON.stringify({ error: "not_attacker" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const victimIds = [...new Set(attackRows.map((r) => r.victim_id))];
    const { data: tokenRows, error: tokenError } = await admin
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", victimIds);

    if (tokenError) {
      return new Response(JSON.stringify({ error: tokenError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokensByVictim = new Map<string, string[]>();
    for (const t of tokenRows ?? []) {
      const list = tokensByVictim.get(t.user_id) ?? [];
      list.push(t.token);
      tokensByVictim.set(t.user_id, list);
    }

    const messages: Record<string, unknown>[] = [];
    let recipients = 0;
    for (const row of attackRows) {
      const tokens = tokensByVictim.get(row.victim_id) ?? [];
      const { title, body } = attackMessage(row);
      for (const token of tokens) {
        messages.push({
          to: token,
          title,
          body,
          sound: "default",
          priority: "high",
          channelId: "attacks",
          data: { type: "attack", attackerId: row.attacker_id },
        });
        recipients++;
      }
    }

    let sent = 0;
    if (messages.length > 0) {
      const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
      // Expo accepts up to 100 messages per request.
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const resp = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}),
          },
          body: JSON.stringify(chunk),
        });
        if (resp.ok) {
          sent += chunk.length;
        } else {
          console.warn("Expo push send failed:", resp.status, await resp.text().catch(() => ""));
        }
      }
    }

    await admin
      .from("attack_notifications")
      .update({ pushed_at: new Date().toISOString() })
      .in("id", attackRows.map((r) => r.id));

    return new Response(JSON.stringify({ sent, recipients }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-attack-push exception:", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
