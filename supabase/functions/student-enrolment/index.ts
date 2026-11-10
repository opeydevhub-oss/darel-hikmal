import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  (() => {
    const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (!raw) return "";
    try { return JSON.parse(raw).default || ""; } catch { return ""; }
  })();
const CBT_URL = "https://gyrucocuozyhlnzgkzvd.supabase.co/functions/v1/cbt-api";
const CBT_KEY = "sb_publishable_tIWx7KNFDaAUEw2xQnJ3cQ_zwTPQ4eT";

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
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}
function studentEmail(studentNo: string) {
  const slug = studentNo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return "dhia-" + slug + "@students.darelhikmah.school";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  try {
    if (!SERVICE_KEY) fail(500, "Student account provisioning is not configured.");
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
    if (actor.error || !actor.data || !actor.data.is_active ||
        !["admin", "staff"].includes(actor.data.role)) {
      fail(403, "Only an active administrator or staff member can enrol students.");
    }

    const body = await req.json();
    const first = String(body.first_name || "").trim();
    const middle = String(body.middle_name || "").trim();
    const last = String(body.last_name || "").trim();
    const classId = String(body.class_id || "");
    if (!first || !middle || !last || !classId) fail(400, "Enter the student's first, middle and last names, then choose a class.");
    if (first.length > 80 || middle.length > 80 || last.length > 80) fail(400, "Student names must be 80 characters or fewer.");

    const term = await service.from("terms").select("session_id").eq("is_current", true).maybeSingle();
    if (term.error || !term.data?.session_id) fail(409, "The administrator must set the current academic session and term first.");
    const sessionId = term.data.session_id;

    if (actor.data.role === "staff") {
      const staff = await service.from("staff").select("id")
        .eq("profile_id", actor.data.id).eq("status", "active").maybeSingle();
      if (staff.error || !staff.data) fail(403, "Your active staff record could not be verified.");
      const assignment = await service.from("teaching_assignments").select("id")
        .eq("staff_id", staff.data.id).eq("class_id", classId).eq("session_id", sessionId)
        .limit(1).maybeSingle();
      if (assignment.error || !assignment.data) {
        fail(403, "You can enrol students only in classes assigned to you for the current session.");
      }
    }

    const classRow = await service.from("classes").select("id,name").eq("id", classId).maybeSingle();
    if (classRow.error || !classRow.data) fail(400, "Choose a valid school class.");

    const numberResult = await service.rpc("next_student_admission_no");
    if (numberResult.error || !numberResult.data) fail(500, "Could not generate a student number.");
    const admissionNo = String(numberResult.data);
    const email = studentEmail(admissionNo);
    const password = makePassword();
    const fullName = [first, middle, last].filter(Boolean).join(" ");

    const created = await service.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { account_type: "student", full_name: fullName },
    });
    if (created.error || !created.data.user) fail(500, created.error?.message || "Could not create the student's portal account.");

    const saved = await service.rpc("create_student_enrolment", {
      p_profile_id: created.data.user.id,
      p_admission_no: admissionNo,
      p_first_name: first,
      p_middle_name: middle || null,
      p_last_name: last,
      p_class_id: classId,
      p_session_id: sessionId,
    });
    if (saved.error) {
      await service.auth.admin.deleteUser(created.data.user.id);
      fail(500, saved.error.message || "Could not save the student enrolment.");
    }

    let cbtSyncWarning: string | null = null;
    try {
      const synced = await fetch(CBT_URL, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: CBT_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "staff.sync_class_students", class_id: classId, session_id: sessionId }),
      });
      const syncResult = await synced.json();
      if (!synced.ok) cbtSyncWarning = syncResult.error || "The CBT directory could not be updated yet.";
    } catch {
      cbtSyncWarning = "The student is enrolled, but the CBT directory sync could not be reached.";
    }

    return reply(200, {
      data: {
        student_id: saved.data.student_id,
        student_number: admissionNo,
        full_name: fullName,
        class_name: classRow.data.name,
        initial_password: password,
        cbt_synced: !cbtSyncWarning,
        cbt_sync_warning: cbtSyncWarning,
      },
    });
  } catch (error) {
    const status = Number((error as any)?.status) || 500;
    return reply(status, { error: status >= 500 ? (error as Error).message : (error as Error).message });
  }
});
