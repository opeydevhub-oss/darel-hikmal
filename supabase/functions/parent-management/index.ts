import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  (() => {
    const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!raw) return "";
    try { return JSON.parse(raw).default || ""; } catch { return ""; }
  })();

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}
function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}
function makePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });

  try {
    if (!SERVICE_KEY) fail(500, "Parent account provisioning is not configured.");
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) fail(401, "Sign in to the school portal first.");

    const publicClient = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: "Bearer " + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = await publicClient.auth.getUser(token);
    if (auth.error || !auth.data.user) fail(401, "Your school session has expired. Sign in again.");

    const service = createClient(URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const actor = await service.from("profiles").select("id,role,is_active")
      .eq("id", auth.data.user.id).maybeSingle();
    if (actor.error || !actor.data || actor.data.role !== "admin" || actor.data.is_active !== true) {
      fail(403, "Only an active administrator can manage parent links.");
    }

    const body = await req.json();
    const action = String(body.action || "");
    const studentId = String(body.student_id || "");
    if (!studentId) fail(400, "Choose a student first.");
    const student = await service.from("students").select("id").eq("id", studentId).maybeSingle();
    if (student.error || !student.data) fail(404, "The selected student record was not found.");

    if (action === "unlink") {
      const parentId = String(body.parent_id || "");
      if (!parentId) fail(400, "Choose the parent link to remove.");
      const removed = await service.from("parent_students").delete()
        .eq("student_id", studentId).eq("parent_id", parentId).select("id").maybeSingle();
      if (removed.error) fail(500, removed.error.message);
      return reply(200, { data: { unlinked: Boolean(removed.data) } });
    }

    let parentProfileId = String(body.parent_profile_id || "");
    let initialPassword: string | null = null;
    let parentName = "";

    if (action === "create_and_link") {
      const email = String(body.email || "").trim().toLowerCase();
      parentName = String(body.full_name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !parentName) {
        fail(400, "Enter the parent's full name and a valid email address.");
      }
      const existing = await service.from("profiles").select("id,role,is_active,full_name")
        .eq("email", email).maybeSingle();
      if (existing.error) fail(500, existing.error.message);
      if (existing.data) {
        if (existing.data.role !== "parent" || existing.data.is_active !== true) {
          fail(409, "That email already belongs to another account or an inactive account. Select an existing parent or use another email.");
        }
        parentProfileId = existing.data.id;
        parentName = existing.data.full_name || parentName;
      } else {
        initialPassword = makePassword();
        const created = await service.auth.admin.createUser({
          email, password: initialPassword, email_confirm: true,
          user_metadata: { account_type: "parent", full_name: parentName },
        });
        if (created.error || !created.data.user) fail(500, created.error?.message || "Could not create the parent login.");
        parentProfileId = created.data.user.id;
        const profile = await service.from("profiles").insert({
          id: parentProfileId, email, full_name: parentName, phone: phone || null,
          role: "parent", is_active: true,
        });
        if (profile.error) {
          await service.auth.admin.deleteUser(parentProfileId);
          fail(500, profile.error.message || "Could not create the parent profile.");
        }
      }
    } else if (action === "link_existing") {
      if (!parentProfileId) fail(400, "Choose an existing parent account.");
      const profile = await service.from("profiles").select("id,email,full_name,phone,role,is_active")
        .eq("id", parentProfileId).maybeSingle();
      if (profile.error || !profile.data || profile.data.role !== "parent" || profile.data.is_active !== true) {
        fail(404, "The selected active parent account could not be verified.");
      }
      parentName = profile.data.full_name || profile.data.email || "Parent";
    } else {
      fail(400, "Choose whether to link an existing parent or create a new one.");
    }

    const profileResult = await service.from("profiles").select("id,email,full_name,phone,role,is_active")
      .eq("id", parentProfileId).maybeSingle();
    if (profileResult.error || !profileResult.data) fail(500, "The parent login profile could not be verified.");

    const parent = await service.from("parents").upsert({
      profile_id: parentProfileId,
      full_name: parentName || profileResult.data.full_name || "Parent",
      phone: String(body.phone || profileResult.data.phone || "").trim() || null,
      relationship_note: String(body.relationship || "Parent/guardian").trim(),
      status: "active",
    }, { onConflict: "profile_id" }).select("id").single();
    if (parent.error || !parent.data) fail(500, parent.error?.message || "Could not prepare the parent record.");

    const link = await service.from("parent_students").upsert({
      parent_id: parent.data.id,
      student_id: studentId,
      relationship: String(body.relationship || "Parent/guardian").trim(),
      is_primary: Boolean(body.is_primary),
    }, { onConflict: "parent_id,student_id" }).select("id").single();
    if (link.error) fail(500, link.error.message);

    return reply(200, { data: {
      linked: true, parent_name: parentName || profileResult.data.full_name,
      parent_email: profileResult.data.email, initial_password: initialPassword,
    }});
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    return reply(status, { error: (error as Error).message || "Parent management failed." });
  }
});
