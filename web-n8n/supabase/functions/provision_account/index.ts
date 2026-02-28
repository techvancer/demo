import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  type: "teacher" | "supervisor";
  email: string;
  name?: string | null;
  tempPassword?: string | null;
  profileId?: number | null;
  userid?: number | null;
};

function corsHeaders(req: Request) {
  const allowed = Deno.env.get("ALLOWED_ORIGIN") || "*";
  const origin = req.headers.get("origin") || "";
  const allowOrigin = allowed === "*" ? "*" : (origin === allowed ? allowed : allowed);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    if (req.method !== "POST") return json(req, 405, { error: "POST only" });

    const url =
      Deno.env.get("PROJECT_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "";
    const serviceKey =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";

    if (!url || !serviceKey) {
      return json(req, 500, { error: "Missing PROJECT_URL / SERVICE_ROLE_KEY secrets" });
    }

    // ✅ AUTH CHECK
    const authHeader = req.headers.get("authorization") || "";
    const callerToken = authHeader.replace("Bearer ", "").trim();
    if (!callerToken) return json(req, 401, { error: "Unauthorized" });

    const anonClient = createClient(url, Deno.env.get("ANON_KEY") || "");
    const { data: { user }, error: userErr } = await anonClient.auth.getUser(callerToken);
    if (userErr || !user) return json(req, 401, { error: "Invalid session" });
    // ✅ END AUTH CHECK

    const body = (await req.json()) as Partial<Payload>;
    const type = (String(body.type || "").toLowerCase() as Payload["type"]);
    const email = String(body.email || "").trim().toLowerCase();
    const name = (body.name ?? null) as string | null;
    const tempPassword = String(body.tempPassword || "12345678");

    if (!(type === "teacher" || type === "supervisor")) return json(req, 400, { error: "Invalid type" });
    if (!email) return json(req, 400, { error: "Missing email" });
    if (tempPassword.length < 8) return json(req, 400, { error: "Temp password must be >= 8 chars" });

    const admin = createClient(url, serviceKey);

    let authUserId: string | null = null;

    const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;

    const existing = listData.users.find((u) => (u.email || "").toLowerCase() === email) || null;

    if (existing) {
      authUserId = existing.id;
      const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        email_confirm: true,
      });
      if (updErr) throw updErr;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { role: type },
      });
      if (createErr) throw createErr;
      authUserId = created.user?.id ?? null;
    }

    if (!authUserId) throw new Error("Failed to get auth user id");

    const table = type === "teacher" ? "teacher_info" : "supervisor_info";
    const idCol = type === "teacher" ? "teacherid" : "supervisorid";
    const nameCol = type === "teacher" ? "teachername" : "supervisorname";
    const emailCol = type === "teacher" ? "teacheremail" : "supervisoremail";

    const { data: existingRow, error: rowErr } = await admin
      .from(table)
      .select(`${idCol}`)
      .ilike(emailCol, email)
      .maybeSingle();
    if (rowErr) throw rowErr;

    if (existingRow?.[idCol]) {
      const patch: Record<string, unknown> = {
        auth_user_id: authUserId,
        must_change_password: true,
      };
      if (name) patch[nameCol] = name;
      if (body.userid != null) patch["userid"] = body.userid;

      const { error: upErr } = await admin.from(table).update(patch).eq(idCol, existingRow[idCol]);
      if (upErr) throw upErr;
    } else {
      const row: Record<string, unknown> = {
        [nameCol]: name ?? "",
        [emailCol]: email,
        auth_user_id: authUserId,
        must_change_password: true,
      };
      if (body.profileId != null) row[idCol] = body.profileId;
      if (body.userid != null) row["userid"] = body.userid;

      const { error: insErr } = await admin.from(table).insert(row);
      if (insErr) throw insErr;
    }

    return json(req, 200, {
      ok: true,
      auth_user_id: authUserId,
      temp_password: tempPassword,
      type,
      email,
    });
  } catch (e) {
    console.error("provision_account error:", e);
    return json(req, 500, { error: String((e as any)?.message || e) });
  }
});