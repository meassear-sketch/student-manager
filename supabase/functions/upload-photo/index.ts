import { createClient } from "jsr:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  let body: { pw?: string; student_id?: string; data?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "bad json" }, 400);
  }

  const pw = String(body.pw || "");
  const sid = String(body.student_id || "").trim();
  const b64 = String(body.data || "");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(sid)) return reply({ error: "bad student id" }, 400);
  if (!b64 || b64.length > 2_000_000) return reply({ error: "bad image" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // same password check and lockout as the rest of the admin
  const v = await sb.rpc("admin_verify", { pw });
  if (v.error) return reply({ error: v.error.message }, 423);
  if (v.data !== true) return reply({ error: "wrong password" }, 401);

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const path = `${sid}.jpg`;
  const up = await sb.storage.from("student-photos").upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (up.error) return reply({ error: up.error.message }, 500);

  const upd = await sb.from("students").update({ photo_path: path }).eq("student_id", sid).select("id");
  if (upd.error) return reply({ error: upd.error.message }, 500);

  return reply({ ok: true, path, rows: (upd.data || []).length });
});
