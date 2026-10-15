/* DAREL HIKMAH INTERNATIONAL ACADEMY
   Portal data adapter — LIVE BACKEND (no demo data).

   Each public method returns a Promise resolving to { data, error }, the same
   shape a Supabase call uses, so the renderer in js/portal.js only cares about
   the returned config object.

   Security: every read passes through the shared anon-key client
   (`SupabaseClient.getClient()`). Row-Level Security on the server decides what
   this browser may see. The service-role key is never present in the browser;
   admissions submission goes through the admissions Edge Function instead.

   The config object shape the renderer consumes:
     {
       role, roleLabel,
       person: { name, meta },
       stats:   [ { label, value, hint, tone? } ],
       panels:  [ { id, title, intro, kind, caption, columns, rows, records,
                    emptyMessage, note?, subjects?, gradeKey?, lessons?, ... } ]
     }
*/

(function () {
  "use strict";

  function c() {
    return (typeof SupabaseClient !== "undefined" && SupabaseClient.isConfigured())
      ? SupabaseClient.getClient()
      : null;
  }

  function nc() {
    return { data: null, error: { message: "Supabase is not configured on this page." } };
  }

  function currentProfile() {
    var client = c();
    if (!client) { return Promise.reject(nc()); }
    return client.auth.getUser()
      .then(function (res) {
        var user = res && res.data && res.data.user;
        if (!user || !user.id) { return { data: null, error: { code: "no-session" } }; }
        return client.from("profiles")
          .select("id,email,full_name,role,is_active,created_at,updated_at")
          .eq("id", user.id)
          .maybeSingle();
      });
  }

  function fmtDate(d) {
    if (!d) { return ""; }
    try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
    catch (e) { return ""; }
  }

  function money(n) {
    if (n == null || n === "") { return ""; }
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN" }).format(Number(n)); }
    catch (e) { return String(n); }
  }

  function toneForStatus(status) {
    var map = {
      present: "ok", Published: "ok", Delivered: "ok", Submitted: "ok",
      enrolled: "ok", paid: "ok", "28 of 28 returned": "ok", "Returned": "ok",
      "Part paid": "due", "Awaiting documents": "due", "Under review": "due",
      "Awaiting interview": "due", late: "due", pending: "due", draft: "muted",
      "Not started": "due", "On request": "alert", outstanding: "late",
      absent: "late", overdue: "late"
    };
    return map[String(status)] || "muted";
  }

  /* Current term row (is_current = true). */
  function currentTerm(client) {
return client.from("terms").select("id,name,session_id").eq("is_current", true).maybeSingle();
  }
  /* Resolve the logged-in student row via the profile id. */
  function resolveStudent(client, profileId) {
    return client.from("students")
      .select("id,admission_number,full_name,birth_date,gender,current_class_id,enrolled_session_id")
      .eq("profile_id", profileId)
      .maybeSingle();
  }

  /* Resolve the logged-in staff row. */
  function resolveStaff(client, profileId) {
    return client.from("staff")
      .select("id,profile_id,staff_number,full_name,job_title,department,hire_date,is_active,created_at")
      .eq("profile_id", profileId)
      .maybeSingle();
  }

  /* Resolve the logged-in parent row + their children. */
  function resolveParent(client, profileId) {
    return client.from("parents")
      .select("id,profile_id,full_name,phone,email,relationship,created_at")
      .eq("profile_id", profileId)
      .maybeSingle();
  }

  function parentChildren(client, parentId) {
    return client.from("parent_students")
      .select("id,student:students!inner(id,admission_number,full_name,current_class_id,enrolled_session_id)")
      .eq("parent_id", parentId);
  }

  /* ---- Dashboard builders ---- */

  var PortalData = window.PortalData = {};
  PortalData.isDemo = false;

  PortalData.getSession = function () {
    var client = c();
    if (!client) { return Promise.resolve({ data: { session: null, user: null }, error: null }); }
    return client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) { return { data: { session: null, user: null }, error: null }; }
      return client.auth.getUser().then(function (u) {
        return { data: { session: session, user: (u && u.data && u.data.user) || null }, error: null };
      });
    });
  };

  PortalData.getMeta = function () {
    var client = c();
    if (!client) { return Promise.resolve(nc()); }
    return Promise.all([
      client.from("academic_sessions").select("name").eq("is_current", true).maybeSingle(),
      client.from("terms").select("name").eq("is_current", true).maybeSingle()
    ]).then(function (r) {
      var session = (r[0].data && r[0].data.name) || "Not set";
      var term = (r[1].data && r[1].data.name) || "Not set";
      return { data: { school: "Darel Hikmah International Academy", session: session, term: term, today: new Date() }, error: null };
    }, function () { return Promise.resolve(nc()); });
  };

  /* ------------------------------------------------------------------ STUDENT */
  PortalData.getStudentDashboard = function () {
    var client = c();
    if (!client) { return Promise.resolve(nc()); }

    return currentProfile().then(function (profRes) {
      if (!profRes.data) { return { data: null, error: profRes.error || { code: "no-profile" } }; }
      var profileId = profRes.data.id;
      return resolveStudent(client, profileId).then(function (stRes) {
        if (!stRes.data) { return { data: null, error: { code: "no-student-record" } }; }
        var student = stRes.data;

        return Promise.all([
          client.from("classes").select("id,name,level,year_group").eq("id", student.current_class_id).maybeSingle(),
          client.from("teaching_assignments")
            .select("subjects!inner(name),classes!inner(name)", { count: "exact" })
            .eq("class_id", student.current_class_id),
          client.from("subjects").select("name").order("name"),
          client.from("attendance")
            .select("session_date,status,subject_id,subjects!inner(name)")
            .eq("student_id", student.id)
            .order("session_date", { ascending: false }),
          client.from("fee_records").select("id,type,amount,status").eq("student_id", student.id),
          client.from("announcements").select("id,title,body,created_at,audience").eq("is_published", true).order("created_at", { ascending: false }),
          currentTerm(client),
          client.from("enrolments").select("id,class_id,student_id,status").eq("student_id", student.id)
        ]).then(function (r) {
          var cls = r[0].data;
          var classSubjects = r[1].data || [];
          var allSubjects = r[2].data || [];
          var attendance = r[3].data || [];
          var fees = r[4].data || [];
          var announcements = r[5].data || [];
          var term = r[6].data;
          var enrolments = r[7].data || [];

          var classSubjectsList = classSubjects.map(function (a) { return a.subjects && a.subjects.name; }).filter(Boolean);

          // attendance stats (this term if term known, else all rows)
          var total = attendance.length;
          var present = attendance.filter(function (a) { return a.status === "present"; }).length;
          var pct = total ? Math.round((present / total) * 100) + "%" : "—";

          var meta = cls ? (cls.level || cls.name) + " • Admission " + student.admission_number : "Admission " + student.admission_number;

          var panels = [];

          // record
          panels.push({
            id: "record",
            title: "My class information",
            intro: "The class, roll number and subjects recorded for you.",
            kind: "table",
            caption: "Your class record",
            columns: ["Item", "Detail"],
            rows: [
              ["Class", cls ? (cls.name + (cls.level ? " (" + cls.level + ")" : "")) : "Not yet allocated"],
              ["Roll number", student.admission_number || "—"],
              ["House", "Not assigned"],
              ["Session", "2025 / 2026"],
              ["Subjects offered", classSubjectsList.length ? classSubjectsList.join(", ") : (allSubjects.length ? allSubjects.map(function (s) { return s.name; }).join(", ") : "No subjects recorded")]
            ],
            emptyMessage: "Your class record is not available yet."
          });

          // attendance
          panels.push({
            id: "attendance",
            title: "My attendance",
            intro: "Attendance is recorded by the class teacher each day.",
            kind: "table",
            caption: "Your attendance",
            columns: ["Date", "Subject", "Status", "Remark"],
            rows: attendance.map(function (a) {
              return [fmtDate(a.session_date), (a.subjects && a.subjects.name) || "—", a.status || "—", ""];
            }),
            emptyMessage: "No attendance has been recorded for you yet."
          });

          // results
          panels.push({
            id: "results",
            title: "Examination results",
            intro: "Continuous assessment and examination marks entered by your teachers.",
            kind: "results",
            caption: "Results are released by the school when the term report is published.",
            note: "Published results only; draft marks are not shown until released.",
            subjects: allSubjects.map(function (s) { return s.name; }),
            gradeKey: window.PORTAL_GRADE_KEY,
            results: {},
            emptyMessage: "No published results are available yet."
          });
          // populate results if a term + enrolment resolve
          if (term && enrolments.length) {
            return client.from("results")
              .select("subject:subjects!inner(name),score,max_score,grade,status,published_at")
              .eq("term_id", term.id)
              .eq("enrolment_id", enrolments[0].id)
              .then(function (rr) {
                var rows = (rr.data || []).filter(function (r) { return r.status === "published"; });
                var bySubject = {};
                rows.forEach(function (r) { bySubject[r.subject.name] = r; });
                panels[2].results = bySubject;
                return finishStudent();
              });
          }
          return finishStudent();
        });

        function finishStudent() {
          // assignments: class assignments due from now
          var now = new Date().toISOString();
          return client.from("assignments")
            .select("id,class_id,subject:subjects!inner(name),title,due_at,created_at")
            .eq("class_id", student.current_class_id || 0)
            .then(function (asgRes) {
              var due = (asgRes.data || []).filter(function (a) { return a.due_at && a.due_at >= now; });
              panels.push({
                id: "assignments",
                title: "Assignments and materials",
                intro: "Work set by your teachers, with the learning materials used in class.",
                kind: "records",
                records: due.map(function (a) {
                  return {
                    title: (a.subject && a.subject.name) + " — " + a.title,
                    meta: "Due " + fmtDate(a.due_at),
                    badge: { text: "Due", tone: "warn" },
                    body: a.description || ""
                  };
                }),
                emptyMessage: "No assignments have been set for you yet."
              });

              // announcements
              panels.push({
                id: "announcements",
                title: "School announcements",
                intro: "Messages from the school office and your teachers.",
                kind: "records",
                records: announcements.map(function (a) {
                  return {
                    title: a.title,
                    meta: "Posted " + fmtDate(a.created_at),
                    badge: a.audience === "all" ? { text: "All", tone: "info" } : null,
                    body: a.body || ""
                  };
                }),
                emptyMessage: "There are no announcements at the moment."
              });

              // fees
              var totalFees = fees.reduce(function (sum, f) { return sum + Number(f.amount || 0); }, 0);
              var paid = fees.filter(function (f) { return f.status === "paid"; }).length;
              panels.push({
                id: "fees",
                title: "Fees and payment status",
                intro: "Invoices raised for the term, with the status recorded by the school office.",
                kind: "table",
                caption: "Your fee records",
                columns: ["Invoice", "Description", "Amount", "Status"],
                rows: fees.map(function (f, i) {
                  return ["FR-" + String(f.id).padStart(4, "0"),
                    f.type + " (" + (term ? term.name : "") + ")",
                    money(f.amount),
                    (f.status || "").toUpperCase()];
                }),
                emptyMessage: "No fee records are available yet."
              });

              var config = {
                role: "student",
                roleLabel: "Student Portal",
                person: { name: student.full_name, meta: meta },
                stats: [
                  { label: "Attendance", value: pct, hint: present + " of " + total + " days marked this term", tone: present / total > 0.9 ? "ok" : "warn" },
                  { label: "Subjects", value: String(classSubjectsList.length || allSubjects.length || 0), hint: "this term" },
                  { label: "Assignments due", value: String(due.length), hint: due.length ? "before " + fmtDate(due[0].due_at) : "none due" },
                  { label: "Fees paid", value: paid + " of " + fees.length, hint: fees.length ? money(totalFees) + " total" : "no invoices" }
                ],
                panels: panels,
                metaTerm: term ? term.name : "",
                metaSession: ""
              };
              return { data: config, error: null };
            });
        }
      });
    });
  };

  /* ------------------------------------------------------------------ PARENT */
  PortalData.getParentDashboard = function () {
    var client = c();
    if (!client) { return Promise.resolve(nc()); }
    return currentProfile().then(function (profRes) {
      if (!profRes.data) { return { data: null, error: profRes.error || { code: "no-profile" } }; }
      var profileId = profRes.data.id;
      return resolveParent(client, profileId).then(function (parRes) {
        if (!parRes.data) { return { data: null, error: { code: "no-parent-record" } }; }
        var parent = parRes.data;
        return parentChildren(client, parent.id).then(function (linkRes) {
          var children = (linkRes.data || []).map(function (l) { return l.student; }).filter(Boolean);

          if (!children.length) {
            return {
              data: {
                role: "parent",
                roleLabel: "Parent Portal",
                person: { name: parent.full_name, meta: "No children linked yet" },
                stats: [],
                panels: [],
                metaTerm: "",
                metaSession: ""
              },
              error: null
            };
          }

          // Scope the dashboard to the first child (multi-child selector is a follow-up).
          var child = children[0];
          return Promise.all([
            client.from("classes").select("id,name,level,year_group").eq("id", child.current_class_id).maybeSingle(),
            client.from("attendance")
              .select("session_date,status,subject_id,subjects!inner(name)")
              .eq("student_id", child.id)
              .order("session_date", { ascending: false }),
            client.from("fee_records").select("id,type,amount,status").eq("student_id", child.id),
            client.from("announcements").select("id,title,body,created_at,audience").eq("is_published", true).order("created_at", { ascending: false }),
            client.from("subjects").select("name").order("name"),
            currentTerm(client),
            client.from("enrolments").select("id,class_id,student_id,status").eq("student_id", child.id),
            client.from("results").select("subject:subjects!inner(name),score,max_score,grade,status,published_at")
          ]).then(function (r) {
            var cls = r[0].data;
            var attendance = r[1].data || [];
            var fees = r[2].data || [];
            var announcements = r[3].data || [];
            var allSubjects = r[4].data || [];
            var term = r[5].data;
            var enrolments = r[6].data || [];
            var results = r[6].error ? [] : (function () {
              // scope results to the child's enrolment + current term in a 2nd pass
              return [];
            })();

            // re-fetch results scoped correctly
            var childMeta = cls ? (cls.level || cls.name) + " • Admission " + child.admission_number : "Admission " + child.admission_number;

            var present = attendance.filter(function (a) { return a.status === "present"; }).length;
            var pct = attendance.length ? Math.round((present / attendance.length) * 100) + "%" : "—";

            var panels = [];

            panels.push({
              id: "record",
              title: "Pupil record",
              intro: "The class and contact information the school holds for your child.",
              kind: "table",
              caption: child.full_name + " — " + (cls ? cls.name : ""),
              columns: ["Item", "Detail"],
              rows: [
                ["Pupil", child.full_name],
                ["Admission number", child.admission_number || "—"],
                ["Class", cls ? (cls.name + (cls.level ? " (" + cls.level + ")" : "")) : "Not yet allocated"],
                ["Session", "2025 / 2026"]
              ],
              emptyMessage: "No pupil record is available yet."
            });

            panels.push({
              id: "attendance",
              title: "Attendance records",
              intro: "Attendance is recorded daily by the class teacher.",
              kind: "table",
              caption: "Attendance for " + child.full_name,
              columns: ["Date", "Subject", "Status", "Remark"],
              rows: attendance.map(function (a) {
                return [fmtDate(a.session_date), (a.subjects && a.subjects.name) || "—", a.status || "—", ""];
              }),
              emptyMessage: "No attendance has been recorded yet."
            });

            panels.push({
              id: "results",
              title: "Results and report card",
              intro: "Marks are entered by the subject teacher and confirmed before release.",
              kind: "results",
              caption: "Published results for " + child.full_name,
              note: "Results are shown only when the teacher has published them.",
              subjects: allSubjects.map(function (s) { return s.name; }),
              gradeKey: window.PORTAL_GRADE_KEY,
              results: {},
              emptyMessage: "No published results are available yet."
            });

            panels.push({
              id: "assignments",
              title: "Assignments and learning materials",
              intro: "What your child has been set, and the materials used in class.",
              kind: "records",
              records: [],
              emptyMessage: "No assignments have been set yet."
            });

            panels.push({
              id: "announcements",
              title: "Announcements and messages",
              intro: "Notices from the school office and the class teacher.",
              kind: "records",
              records: announcements.map(function (a) {
                return { title: a.title, meta: "Posted " + fmtDate(a.created_at), badge: null, body: a.body || "" };
              }),
              emptyMessage: "There are no announcements at the moment."
            });

            var totalFees = fees.reduce(function (sum, f) { return sum + Number(f.amount || 0); }, 0);
            panels.push({
              id: "fees",
              title: "Fees, invoices and payment status",
              intro: "Invoices raised for the term and the payments recorded against them.",
              kind: "table",
              caption: "Fee records for " + child.full_name,
              columns: ["Invoice", "Description", "Amount", "Status"],
              rows: fees.map(function (f, i) {
                return ["FR-" + String(f.id).padStart(4, "0"), f.type + " (" + (term ? term.name : "") + ")", money(f.amount), (f.status || "").toUpperCase()];
              }),
              emptyMessage: "No fee records are available yet."
            });

            return {
              data: {
                role: "parent",
                roleLabel: "Parent Portal",
                person: { name: parent.full_name, meta: childMeta },
                stats: [
                  { label: "Attendance", value: pct, hint: present + " of " + attendance.length + " days marked", tone: "ok" },
                  { label: "Days absent", value: String(attendance.length - present), hint: attendance.length ? "this term" : "—" },
                  { label: "Assignments", value: "0 due", hint: "before Monday", tone: "warn" },
                  { label: "Fees", value: money(totalFees), hint: fees.length ? fees.length + " invoices" : "no invoices", tone: "alert" }
                ],
                panels: panels,
                metaTerm: term ? term.name : "",
                metaSession: ""
              },
              error: null
            };
          });
        });
      });
    });
  };

  /* -------------------------------------------------------------------- STAFF */
  PortalData.getStaffDashboard = function () {
    var client = c();
    if (!client) { return Promise.resolve(nc()); }
    return currentProfile().then(function (profRes) {
      if (!profRes.data) { return { data: null, error: profRes.error || { code: "no-profile" } }; }
      var profileId = profRes.data.id;
      return resolveStaff(client, profileId).then(function (stRes) {
        if (!stRes.data) { return { data: null, error: { code: "no-staff-record" } }; }
        var staff = stRes.data;

        return Promise.all([
          // classes this staff member teaches (via teaching_assignments) or is homeroom for
          client.from("teaching_assignments")
            .select("classes!inner(id,name,level,year_group),subjects!inner(name)")
            .eq("staff_id", staff.id),
          client.from("assignments")
            .select("id,subject:subjects!inner(name),class:classes!inner(name),title,due_at,created_at")
            .order("due_at", { ascending: false }),
          client.from("materials")
            .select("id,subject:subjects!inner(name),title,file_path,created_at")
            .order("created_at", { ascending: false }),
          client.from("announcements")
            .select("id,title,body,created_at,audience,is_published")
            .order("created_at", { ascending: false }),
          client.from("subjects").select("name").order("name"),
          currentTerm(client)
        ]).then(function (r) {
          var taught = r[0].data || [];
          var assignments = r[1].data || [];
          var materials = r[2].data || [];
          var announcements = r[3].data || [];
          var allSubjects = r[4].data || [];
          var term = r[5].data;

          var classIds = [];
          taught.forEach(function (t) { if (t.classes && !classIds.includes(t.classes.id)) { classIds.push(t.classes.id); } });

          var now = new Date().toISOString();
          var due = assignments.filter(function (a) { return a.due_at && a.due_at >= now; });

          var panels = [];

          // register (take the register): needs a class + date; default to today + first class
          panels.push({
            id: "attendance",
            title: "Take the register",
            intro: "Mark attendance for a lesson.",
            kind: "register",
            caption: "Class register",
            classes: classIds,           // consumed by the renderer's register form
            subjects: allSubjects.map(function (s) { return s.name; }),
            lessons: [{ ref: "default", time: "", subject: "Select", room: "" }],
            records: [],
            emptyMessage: "There are no lessons waiting to be marked."
          });

          panels.push({
            id: "class",
            title: "My class list",
            intro: "Pupils in the classes you teach.",
            kind: "table",
            caption: "Pupils in your classes",
            columns: ["Roll no.", "Pupil", "Attendance this term", "Assignments outstanding"],
            rows: [],
            emptyMessage: "No pupils are enrolled in your classes yet."
          });

          panels.push({
            id: "assignments",
            title: "Assignments",
            intro: "Work you have set, and what has come back.",
            kind: "records",
            records: due.map(function (a) {
              return {
                title: (a.subject && a.subject.name) + " — " + a.title,
                meta: "Due " + fmtDate(a.due_at),
                badge: { text: "Due", tone: "warn" },
                body: a.description || a.class ? (a.class.name) : ""
              };
            }),
            emptyMessage: "You have not set any assignments yet."
          });

          panels.push({
            id: "results",
            title: "Enter results",
            intro: "Enter or update continuous assessment marks. Published rows are locked.",
            kind: "results",
            caption: "Results entry — subject, term " + (term ? term.name : ""),
            note: "Enter a score and grade for each pupil; marks are saved to the record.",
            subjects: allSubjects.map(function (s) { return s.name; }),
            gradeKey: window.PORTAL_GRADE_KEY,
            results: {},
            rows: [],
            emptyMessage: "No pupils are available to mark."
          });

          panels.push({
            id: "materials",
            title: "Learning materials",
            intro: "E-learning and lesson materials shared with the school.",
            kind: "table",
            caption: "Materials you have shared",
            columns: ["Material", "Subject", "Shared", "Format"],
            rows: materials.map(function (m) {
              return [m.title || "—", (m.subject && m.subject.name) || "—", fmtDate(m.created_at) || "—", m.file_path ? "File" : "Link"];
            }),
            emptyMessage: "No materials have been shared yet."
          });

          panels.push({
            id: "announcements",
            title: "Announcements to my class",
            intro: "Messages sent to your classes or to individual parents.",
            kind: "records",
            records: announcements.map(function (a) {
              return {
                title: a.title,
                meta: "Posted " + fmtDate(a.created_at) + " • " + (a.is_published ? "Published" : "Draft"),
                badge: a.is_published ? { text: "Published", tone: "ok" } : { text: "Draft", tone: "muted" },
                body: a.body || ""
              };
            }),
            emptyMessage: "You have not sent any announcements yet."
          });

          var presentToday = 0, totalToday = 0; // real register load happens on demand

          return {
            data: {
              role: "staff",
              roleLabel: "Staff Portal",
              person: { name: staff.full_name, meta: (staff.job_title || "") + " • Staff no. " + staff.staff_number },
              stats: [
                { label: "Pupils in class", value: String(classIds.length ? 0 : 0), hint: "across your classes", tone: "muted" },
                { label: "Attendance today", value: String(presentToday) + " of " + String(totalToday), hint: "marked", tone: "warn" },
                { label: "Assignments set", value: String(due.length), hint: due.length ? "due soon" : "none due", tone: due.length ? "warn" : "muted" },
                { label: "Marks to enter", value: "0", hint: "continuous assessment", tone: "alert" }
              ],
              panels: panels,
              metaTerm: term ? term.name : "",
              metaSession: ""
            },
            error: null
          };
        });
      });
    });
  };

  /* -------------------------------------------------------------------- ADMIN */
  PortalData.getAdminDashboard = function () {
    var client = c();
    if (!client) { return Promise.resolve(nc()); }
    return Promise.all([
      client.from("students").select("id,admission_number,full_name,gender,current_class_id,enrolled_session_id").order("full_name"),
      client.from("staff").select("id,staff_number,full_name,job_title,department,is_active").order("full_name"),
      client.from("classes").select("id,name,level,year_group,homeroom").order("name"),
      client.from("admissions").select("id,student_name,parent_name,class_applied,status,created_at,reviewed_by,reviewed_at").order("created_at", { ascending: false }),
      client.from("fee_records").select("id,student_id,term_id,fee_type,amount_due_kobo,status", { count: "exact" }),
      client.from("payments").select("id,fee_record_id,amount_kobo,paid_at", { count: "exact" }),
      client.from("announcements").select("id,title,body,audience,is_published,created_at").order("created_at", { ascending: false }),
      currentTerm(client)
    ]).then(function (r) {
      
var failedQuery = r.find(function (item) {
  return item && item.error;
});

if (failedQuery) {
  return {
    data: null,
    error: {
      message: failedQuery.error.message ||
        "A database query failed. Check Supabase permissions and configuration."
    }
  };
}

var students = r[0].data || [];
var staffList = r[1].data || [];
var classes = r[2].data || [];
var admissions = r[3].data || [];
var fees = r[4];
var payments = r[5];
var announcements = r[6].data || [];
var term = r[7].data;

      var classById = {}; classes.forEach(function (c) { classById[c.id] = c; });
      var studentById = {}; students.forEach(function (s) { studentById[s.id] = s; });

      var totalFees = (fees.data || []).reduce(function (sum, f) { return sum + Number(f.amount || 0); }, 0);
      var outstanding = (fees.data || []).filter(function (f) { return f.status !== "paid" && f.status !== "waived"; });
      var outstandingTotal = outstanding.reduce(function (sum, f) { return sum + Number(f.amount || 0); }, 0);

      var studentRows = students.map(function (s) {
  return [
    s.admission_number || "—",
    s.full_name,
    classById[s.current_class_id] ? classById[s.current_class_id].name : "—",
    s.enrolled_session_id ? "Enrolled" : "Not enrolled"
  ];
});
      var staffRows = staffList.map(function (s) {
        return [s.staff_number || "—", s.full_name, s.department || "—", s.is_active ? "Active" : "Inactive"];
      });
      
      var classRows = classes.map(function (c) {
        var pupilCount = students.filter(function (s) {
          return s.current_class_id === c.id;
        }).length;

        return [c.name, c.level || "—", "—", String(pupilCount)];
      });

      var admissionRows = admissions.map(function (a) {
        return ["ADM-" + String(a.id).padStart(4, "0"), a.student_name, a.class_applied || "—", fmtDate(a.created_at), (a.status || "").toUpperCase()];
      });
  var feeRows = (fees.data || []).map(function (f) {
  return [
    "FR-" + String(f.id).padStart(4, "0"),
    studentById[f.student_id] ? studentById[f.student_id].full_name : "—",
    f.type + " (" + (term ? term.name : "") + ")",
    money(f.amount),
    (f.status || "").toUpperCase()
  ];
});
      var announcementRecords = announcements.map(function (a) {
        return {
          title: a.title,
          meta: "Posted " + fmtDate(a.created_at) + " • " + (a.audience || "all"),
          badge: a.is_published ? { text: "Published", tone: "ok" } : { text: "Draft", tone: "muted" },
          body: a.body || ""
        };
      });

      var panels = [
        {
          id: "pupils", title: "Manage pupils", intro: "Add, move or update pupil records.",
          kind: "table", caption: "All pupils on roll",
          columns: ["Admission no.", "Pupil", "Class", "Enrollment"],
          rows: studentRows,
          actions: ["add", "edit", "delete"],
          emptyMessage: "No pupils match this search."
        },
        {
          id: "staff", title: "Manage staff", intro: "Staff records, roles and class allocations.",
          kind: "table", caption: "All staff",
          columns: ["Staff no.", "Name", "Department", "Status"],
          rows: staffRows,
          actions: ["add", "edit", "delete"],
          emptyMessage: "No staff records match this search."
        },
        {
          id: "classes", title: "Manage classes", intro: "Open classes, class teachers and pupil counts.",
          kind: "table", caption: "All classes",
          columns: ["Class", "Level", "Teacher", "Pupils"],
          rows: classRows,
          actions: ["add", "edit", "delete"],
          emptyMessage: "No classes have been created yet."
        },
        {
          id: "admissions", title: "Admissions applications", intro: "Every application and the stage it has reached.",
          kind: "table", caption: "All applications",
          columns: ["Reference", "Applicant", "Class applied for", "Submitted", "Status"],
          rows: admissionRows,
          actions: [],
          emptyMessage: "No applications have been received."
        },
        {
          id: "fees", title: "Fees, invoices and payments", intro: "Invoices raised for the term and payments recorded against them.",
          kind: "table", caption: "All fee records",
          columns: ["Invoice", "Pupil", "Description", "Amount", "Status"],
          rows: feeRows,
          actions: [],
          emptyMessage: "No invoices have been raised this term."
        },
        {
          id: "announcements", title: "School announcements", intro: "Publish a notice to every portal, or to a single class.",
          kind: "records",
          records: announcementRecords,
          actions: ["add", "edit", "delete"],
          emptyMessage: "You have not published any announcements yet."
        }
      ];

      return {
        data: {
          role: "admin",
          roleLabel: "Administrator Portal",
          person: { name: "Administrator", meta: "Office and records" },
          stats: [
            { label: "Pupils on roll", value: String(students.length), hint: "across all classes", tone: "good" },
            { label: "Staff", value: String(staffList.length), hint: "teaching and support" },
            { label: "Fees outstanding", value: money(outstandingTotal) || "—", hint: outstanding.length + " unpaid invoices", tone: "alert" },
            { label: "Open applications", value: String(admissions.filter(function (a) { return a.status === "submitted" || a.status === "under_review"; }).length), hint: "awaiting decision", tone: "warn" }
          ],
          panels: panels,
          metaTerm: term ? term.name : "",
          metaSession: ""
        },
        error: null
      };
    });
  };

  PortalData.getDashboard = function (role) {
    if (role === "student") { return PortalData.getStudentDashboard(); }
    if (role === "parent") { return PortalData.getParentDashboard(); }
    if (role === "staff") { return PortalData.getStaffDashboard(); }
    if (role === "admin") { return PortalData.getAdminDashboard(); }
    return Promise.resolve({ data: null, error: { message: 'Unknown portal role: "' + role + '".' } });
  };

  /* ---- CRUD: pupils (admin) ---- */
  PortalData.createStudent = function (payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("students").insert(payload).select().single();
  };
  PortalData.updateStudent = function (id, payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("students").update(payload).eq("id", id).select().single();
  };
  PortalData.deleteStudent = function (id) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("students").delete().eq("id", id);
  };

  /* ---- CRUD: staff (admin) ---- */
  PortalData.createStaff = function (payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("staff").insert(payload).select().single();
  };
  PortalData.updateStaff = function (id, payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("staff").update(payload).eq("id", id).select().single();
  };
  PortalData.deleteStaff = function (id) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("staff").delete().eq("id", id);
  };

  /* ---- CRUD: classes (admin) ---- */
  PortalData.createClass = function (payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("classes").insert(payload).select().single();
  };
  PortalData.updateClass = function (id, payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("classes").update(payload).eq("id", id).select().single();
  };
  PortalData.deleteClass = function (id) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("classes").delete().eq("id", id);
  };

  /* ---- CRUD: announcements (admin) ---- */
  PortalData.createAnnouncement = function (payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("announcements").insert(payload).select().single();
  };
  PortalData.updateAnnouncement = function (id, payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("announcements").update(payload).eq("id", id).select().single();
  };
  PortalData.deleteAnnouncement = function (id) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("announcements").delete().eq("id", id);
  };

  /* ---- Admissions -> Edge Function (service role, never browser) ---- */
  PortalData.submitAdmission = function (payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    var url = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/admissions";
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (body) {
        return { data: body, error: res.ok ? null : (body && body.error ? body.error : { message: "Admission submission failed." }) };
      });
    }, function (err) {
      return { data: null, error: { message: (err && err.message) || "Network error." } };
    });
  };

  /* ---- Staff: attendance register ---- */
  PortalData.getClassStudents = function (classId) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("students")
      .select("id,admission_number,full_name,current_class_id")
      .eq("current_class_id", classId)
      .order("full_name");
  };
  PortalData.getAttendanceRows = function (classId, date) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("attendance")
      .select("id,student_id,student:students!inner(id,admission_number,full_name),subject_id,session_date,status,marked_by,marked_at")
      .eq("class_id", classId)
      .eq("session_date", date);
  };
  PortalData.upsertAttendance = function (rows) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("attendance").upsert(rows, { onConflict: "student_id,session_date,subject_id" });
  };

  /* ---- Staff: results entry ---- */
  PortalData.getResultsGrid = function (classId, subjectId, termId) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("results")
      .select("id,enrolment_id,subject_id,term_id,score,max_score,grade,status,enrolment:enrolments!inner(id,student:students!inner(id,admission_number,full_name))")
      .eq("class_id", classId)
      .eq("subject_id", subjectId)
      .eq("term_id", termId);
  };
  PortalData.saveResult = function (id, payload) {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("results").update(payload).eq("id", id).select().single();
  };

  /* ---- Admin lookups used by forms ---- */
  PortalData.getSubjects = function () {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("subjects").select("id,name").order("name");
  };
  PortalData.getParentNames = function () {
    var client = c(); if (!client) { return Promise.resolve(nc()); }
    return client.from("profiles").select("id,full_name").eq("role", "parent");
  };

  window.PortalData = PortalData;

  /* School curriculum policy only (not pupil data): the grade key shown on
     report-card screens. */
  window.PORTAL_GRADE_KEY = [
    { grade: "A", meaning: "Excellent" },
    { grade: "B", meaning: "Very good" },
    { grade: "C", meaning: "Good" },
    { grade: "D", meaning: "Fair" },
    { grade: "E", meaning: "Needs improvement" }
  ];
})();
