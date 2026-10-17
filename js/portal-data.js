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
    .select("id,profile_id,admission_no,first_name,last_name,date_of_birth,gender,status")
    .eq("profile_id", profileId)
    .is("deleted_at", null)
    .maybeSingle()
    .then(function (res) {
      if (res.error || !res.data) return res;

      var student = res.data;
      student.admission_number = student.admission_no;
      student.full_name = [student.first_name, student.last_name]
        .filter(Boolean)
        .join(" ");

      return { data: student, error: null };
    });
}

  /* Resolve the logged-in staff row. */
  function resolveStaff(client, profileId) {
  return client.from("staff")
    .select("id,profile_id,staff_no,full_name,job_title,status,created_at")
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
    if (!client) return Promise.resolve(nc());

    return currentProfile().then(function (profRes) {
      if (profRes.error || !profRes.data) {
        return {
          data: null,
          error: profRes.error || { message: "Your profile could not be found." }
        };
      }

      return resolveStudent(client, profRes.data.id).then(function (stRes) {
        if (stRes.error) {
          return { data: null, error: stRes.error };
        }

        if (!stRes.data) {
          return {
            data: null,
            error: {
              message: "Your login is active, but your student record has not been created by the school yet."
            }
          };
        }

        var student = stRes.data;
        var fullName = student.full_name ||
          [student.first_name, student.last_name].filter(Boolean).join(" ") ||
          "Student";

        return Promise.resolve({
          data: {
            role: "student",
            roleLabel: "Student Portal",
            person: {
              name: fullName,
              meta: "Admission " + (student.admission_number || "Not assigned")
            },
            stats: [
              { label: "Attendance", value: "—", hint: "No attendance summary loaded" },
              { label: "Subjects", value: "—", hint: "School records" },
              { label: "Assignments", value: "—", hint: "School records" },
              { label: "Fees", value: "—", hint: "School records" }
            ],
            panels: [
              {
                id: "record",
                title: "My student record",
                intro: "Your student details recorded by the school.",
                kind: "table",
                caption: "Student information",
                columns: ["Item", "Detail"],
                rows: [
                  ["Name", fullName],
                  ["Admission number", student.admission_number || "Not assigned"],
                  ["Gender", student.gender || "Not recorded"],
                  ["Status", student.status || "Not recorded"]
                ],
                emptyMessage: "No student information is available."
              }
            ],
            metaTerm: "",
            metaSession: ""
          },
          error: null
        });
      });
    }).catch(function (err) {
      return {
        data: null,
        error: {
          message: err && err.message
            ? err.message
            : "Could not load the student dashboard."
        }
      };
    });
  };

  /* ------------------------------------------------------------------ PARENT */
  PortalData.getParentDashboard = function () {
    var client = c();
    if (!client) return Promise.resolve(nc());

    return currentProfile().then(function (profRes) {
      if (profRes.error || !profRes.data) {
        return { data: null, error: profRes.error || { message: "Your profile could not be found." } };
      }

      return resolveParent(client, profRes.data.id).then(function (parRes) {
        if (parRes.error) return { data: null, error: parRes.error };
        if (!parRes.data) {
          return { data: null, error: { message: "Your login is active, but the school has not created your parent record yet." } };
        }

        var parent = parRes.data;
        return parentChildren(client, parent.id).then(function (linkRes) {
          if (linkRes.error) return { data: null, error: linkRes.error };

          var children = (linkRes.data || []).map(function (link) {
            var student = link.student;
            if (!student) return null;
            student.full_name = [student.first_name, student.last_name].filter(Boolean).join(" ");
            student.admission_number = student.admission_no;
            return student;
          }).filter(Boolean);

          if (!children.length) {
            return {
              data: {
                role: "parent",
                roleLabel: "Parent Portal",
                person: { name: parent.full_name || "Parent", meta: "No children linked yet" },
                stats: [],
                panels: [{
                  id: "children",
                  title: "Linked children",
                  intro: "The school will show your child's information after administration links the student record to your account.",
                  kind: "records",
                  records: [],
                  emptyMessage: "No children have been linked to this parent account yet. Please contact the school office."
                }],
                metaTerm: "",
                metaSession: ""
              },
              error: null
            };
          }

          // Keep the current single-child dashboard scope, but use real database columns.
          var child = children[0];
          return currentTerm(client).then(function (termRes) {
            if (termRes.error) return { data: null, error: termRes.error };
            var term = termRes.data;
            var enrolmentQuery = client.from("enrolments")
              .select("id,class_id,student_id,session_id,status,classes(id,name,level,arm),academic_sessions(name)")
              .eq("student_id", child.id)
              .eq("status", "active");
            if (term && term.session_id) enrolmentQuery = enrolmentQuery.eq("session_id", term.session_id);

            return enrolmentQuery.then(function (enrolRes) {
              if (enrolRes.error) return { data: null, error: enrolRes.error };
              var enrolments = enrolRes.data || [];
              var enrolmentIds = enrolments.map(function (e) { return e.id; });
              var classIds = enrolments.map(function (e) { return e.class_id; }).filter(Boolean);
              var classInfo = enrolments.length ? (enrolments[0].classes || null) : null;

              var requests = [
                enrolmentIds.length
                  ? client.from("attendance").select("attendance_date,status,note,enrolment_id").in("enrolment_id", enrolmentIds).order("attendance_date", { ascending: false })
                  : Promise.resolve({ data: [], error: null }),
                client.from("fee_records").select("id,fee_type,amount_due_kobo,status,due_date,term_id").eq("student_id", child.id),
                client.from("announcements").select("id,title,body,created_at,audience,class_id,publish_at,expires_at,status").eq("status", "published").or("publish_at.is.null,publish_at.lte." + new Date().toISOString()).or("expires_at.is.null,expires_at.gt." + new Date().toISOString()).order("created_at", { ascending: false }),
                enrolmentIds.length
                  ? client.from("results").select("id,enrolment_id,subject_id,ca_score,exam_score,total,grade,status,published_at,subject:subjects(name)").in("enrolment_id", enrolmentIds).eq("status", "published")
                  : Promise.resolve({ data: [], error: null }),
                classIds.length
                  ? client.from("assignments").select("id,title,description,due_date,class_id,subject:subjects(name)").in("class_id", classIds).order("due_date", { ascending: true })
                  : Promise.resolve({ data: [], error: null }),
                classIds.length
                  ? client.from("learning_materials").select("id,title,created_at,class_id,subject:subjects(name)").in("class_id", classIds).eq("status", "published").order("created_at", { ascending: false })
                  : Promise.resolve({ data: [], error: null }),
                client.from("academic_sessions").select("name").eq("is_current", true).maybeSingle()
              ];

              return Promise.all(requests).then(function (r) {
                var failed = r.find(function (item) { return item && item.error; });
                if (failed) return { data: null, error: { message: failed.error.message || "Could not load parent dashboard information." } };

                var attendance = r[0].data || [];
                var fees = r[1].data || [];
                var announcements = (r[2].data || []).filter(function (a) {
                  return a.audience === "all" || a.audience === "parents" ||
                    (a.audience === "class" && classIds.indexOf(a.class_id) !== -1);
                });
                var results = r[3].data || [];
                var assignments = r[4].data || [];
                var materials = r[5].data || [];
                var session = r[6].data;
                var present = attendance.filter(function (a) { return a.status === "present"; }).length;
                var attendancePct = attendance.length ? Math.round(present / attendance.length * 100) + "%" : "—";
                var totalFees = fees.reduce(function (sum, fee) { return sum + Number(fee.amount_due_kobo || 0) / 100; }, 0);
                var childClass = classInfo ? classInfo.name + (classInfo.level ? " (" + classInfo.level + ")" : "") : "Not yet allocated";
                var resultRows = results.map(function (result) {
                  return {
                    title: result.subject && result.subject.name ? result.subject.name : "Subject result",
                    meta: "Score: " + (result.total == null ? "Not recorded" : result.total) + (result.grade ? " · Grade " + result.grade : ""),
                    badge: "Published",
                    body: result.published_at ? "Published " + fmtDate(result.published_at) : "Published result"
                  };
                });
                var workRecords = assignments.map(function (a) {
                  return { title: a.title, meta: (a.subject && a.subject.name ? a.subject.name + " · " : "") + (a.due_date ? "Due " + fmtDate(a.due_date) : "No due date"), badge: "Assignment", body: a.description || "" };
                }).concat(materials.map(function (m) {
                  return { title: m.title, meta: (m.subject && m.subject.name ? m.subject.name + " · " : "") + "Learning material", badge: "Material", body: "" };
                }));

                var panels = [
                  {
                    id: "record", title: "Pupil record",
                    intro: "The student details recorded by the school.",
                    kind: "table", caption: child.full_name + " — " + childClass,
                    columns: ["Item", "Detail"],
                    rows: [
                      ["Pupil", child.full_name || "Student"],
                      ["Admission number", child.admission_number || "—"],
                      ["Class", childClass],
                      ["Academic session", (session && session.name) || "Not set"],
                      ["Relationship", (parent.relationship_note || "Parent/guardian")]
                    ],
                    emptyMessage: "No pupil record is available yet."
                  },
                  {
                    id: "attendance", title: "Attendance records",
                    intro: "Attendance entries for your linked child.",
                    kind: "table", caption: "Attendance for " + (child.full_name || "your child"),
                    columns: ["Date", "Status", "Remark"],
                    rows: attendance.map(function (a) { return [fmtDate(a.attendance_date), a.status || "—", a.note || ""]; }),
                    emptyMessage: "No attendance has been recorded yet."
                  },
                  {
                    id: "results", title: "Results and report card",
                    intro: "Only results published by the school are shown here.",
                    kind: "records", records: resultRows,
                    emptyMessage: "No published results are available yet."
                  },
                  {
                    id: "assignments", title: "Assignments and learning materials",
                    intro: "Classwork and learning resources shared for your child's class.",
                    kind: "records", records: workRecords,
                    emptyMessage: "No assignments or published learning materials are available yet."
                  },
                  {
                    id: "announcements", title: "Announcements and messages",
                    intro: "Published school-wide, parent, and relevant class notices.",
                    kind: "records",
                    records: announcements.map(function (a) { return { title: a.title, meta: "Posted " + fmtDate(a.created_at), badge: null, body: a.body || "" }; }),
                    emptyMessage: "There are no announcements at the moment."
                  },
                  {
                    id: "fees", title: "Fees and payment status",
                    intro: "Fee records entered by the school. Amounts are displayed in naira.",
                    kind: "table", caption: "Fee records for " + (child.full_name || "your child"),
                    columns: ["Description", "Amount", "Due date", "Status"],
                    rows: fees.map(function (fee) { return [fee.fee_type || "School fee", money(Number(fee.amount_due_kobo || 0) / 100), fee.due_date ? fmtDate(fee.due_date) : "—", (fee.status || "—").toUpperCase()]; }),
                    emptyMessage: "No fee records are available yet."
                  }
                ];

                return {
                  data: {
                    role: "parent", roleLabel: "Parent Portal",
                    person: { name: parent.full_name || "Parent", meta: (child.full_name || "Child") + " · Admission " + (child.admission_number || "Not assigned") },
                    stats: [
                      { label: "Attendance", value: attendancePct, hint: present + " of " + attendance.length + " entries marked", tone: "ok" },
                      { label: "Days absent", value: String(attendance.filter(function (a) { return a.status === "absent"; }).length), hint: "Recorded absences" },
                      { label: "Assignments", value: String(assignments.length), hint: "For linked child's class" },
                      { label: "Fees due", value: money(fees.filter(function (fee) { return fee.status !== "paid"; }).reduce(function (sum, fee) { return sum + Number(fee.amount_due_kobo || 0) / 100; }, 0)), hint: fees.length + " fee records", tone: "alert" }
                    ],
                    panels: panels,
                    metaTerm: term ? term.name : "",
                    metaSession: (session && session.name) || ""
                  },
                  error: null
                };
              });
            });
          });
        });
      });
    }).catch(function (err) {
      return { data: null, error: { message: err && err.message ? err.message : "Could not load the parent dashboard." } };
    });
  };

  /* -------------------------------------------------------------------- STAFF */
  
  /* -------------------------------------------------------------------- STAFF */
  PortalData.getStaffDashboard = function () {
    var client = c();

    if (!client) {
      return Promise.resolve(nc());
    }

    return currentProfile().then(function (profRes) {
      if (!profRes.data) {
        return {
          data: null,
          error: profRes.error || { code: "no-profile" }
        };
      }

      var profileId = profRes.data.id;

      return resolveStaff(client, profileId).then(function (stRes) {
        if (!stRes.data) {
          return {
            data: null,
            error: { code: "no-staff-record" }
          };
        }

        var staff = stRes.data;

        return Promise.all([
          client.from("teaching_assignments")
            .select("classes!inner(id,name,level,arm),subjects!inner(name)")
            .eq("staff_id", staff.id),

          client.from("assignments")
            .select("id,subject:subjects!inner(name),class:classes!inner(name),title,description,due_date,created_at")
            .eq("created_by", staff.id)
            .order("due_date", { ascending: false }),

          client.from("learning_materials")
            .select("id,subject:subjects!inner(name),title,storage_path,created_at")
            .eq("uploaded_by", staff.id)
            .order("created_at", { ascending: false }),

          client.from("announcements")
            .select("id,title,body,created_at,audience,status")
            .eq("created_by", profileId)
            .order("created_at", { ascending: false }),

          client.from("subjects")
            .select("name")
            .order("name"),

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
                  "Could not load staff dashboard data."
              }
            };
          }

          var taught = r[0].data || [];
          var assignments = r[1].data || [];
          var materials = r[2].data || [];
          var announcements = r[3].data || [];
          var allSubjects = r[4].data || [];
          var term = r[5].data;

          var classIds = [];

          taught.forEach(function (item) {
            if (
              item.classes &&
              !classIds.includes(item.classes.id)
            ) {
              classIds.push(item.classes.id);
            }
          });

          var now = new Date().toISOString();

          var due = assignments.filter(function (item) {
            return item.due_date && item.due_date >= now;
          });

          var panels = [];

          panels.push({
            id: "attendance",
            title: "Take the register",
            intro: "Mark attendance for a lesson.",
            kind: "register",
            caption: "Class register",
            classes: classIds,
            subjects: allSubjects.map(function (subject) {
              return subject.name;
            }),
            lessons: [
              {
                ref: "default",
                time: "",
                subject: "Select",
                room: ""
              }
            ],
            records: [],
            emptyMessage: "There are no lessons waiting to be marked."
          });

          panels.push({
            id: "class",
            title: "My class list",
            intro: "Pupils in the classes you teach.",
            kind: "table",
            caption: "Pupils in your classes",
            columns: [
              "Roll no.",
              "Pupil",
              "Attendance this term",
              "Assignments outstanding"
            ],
            rows: [],
            emptyMessage: "Pupil lists have not been loaded yet."
          });

          panels.push({
            id: "assignments",
            title: "Assignments",
            intro: "Work you have set, and what has come back.",
            kind: "records",
            records: due.map(function (item) {
              return {
                title:
                  ((item.subject && item.subject.name) || "Subject") +
                  " — " + (item.title || "Untitled assignment"),
                meta: "Due " + fmtDate(item.due_date),
                badge: {
                  text: "Due",
                  tone: "warn"
                },
                body:
                  item.description ||
                  ((item.class && item.class.name) || "")
              };
            }),
            emptyMessage: "You have no upcoming assignments."
          });

          panels.push({
            id: "results",
            title: "Enter results",
            intro: "Enter or update continuous assessment marks.",
            kind: "results",
            caption: "Results entry — " + (term ? term.name : ""),
            note: "Result entry is not connected to pupil records yet.",
            subjects: allSubjects.map(function (subject) {
              return subject.name;
            }),
            gradeKey: window.PORTAL_GRADE_KEY,
            results: {},
            rows: [],
            emptyMessage: "No pupil results are loaded yet."
          });

          panels.push({
            id: "materials",
            title: "Learning materials",
            intro: "E-learning and lesson materials shared with the school.",
            kind: "table",
            caption: "Materials you have shared",
            columns: ["Material", "Subject", "Shared", "Format"],
            rows: materials.map(function (item) {
              return [
                item.title || "—",
                (item.subject && item.subject.name) || "—",
                fmtDate(item.created_at) || "—",
                item.storage_path ? "File" : "Link"
              ];
            }),
            emptyMessage: "No learning materials have been shared yet."
          });

          panels.push({
            id: "announcements",
            title: "My announcements",
            intro: "Announcements created by your account.",
            kind: "records",
            records: announcements.map(function (item) {
              var published = item.status === "published";

              return {
                title: item.title || "Untitled announcement",
                meta:
                  "Posted " + fmtDate(item.created_at) +
                  " • " + (published ? "Published" : (item.status || "Draft")),
                badge: published
                  ? { text: "Published", tone: "ok" }
                  : { text: item.status || "Draft", tone: "muted" },
                body: item.body || ""
              };
            }),
            emptyMessage: "You have not created any announcements yet."
          });

          var presentToday = 0;
          var totalToday = 0;

          return {
            data: {
              role: "staff",
              roleLabel: "Staff Portal",
              person: {
                name: staff.full_name || "Staff",
                meta:
                  (staff.job_title || "Staff") +
                  " • Staff no. " + (staff.staff_no || "—")
              },
              stats: [
                {
                  label: "Classes assigned",
                  value: String(classIds.length),
                  hint: "across your teaching assignments",
                  tone: "muted"
                },
                {
                  label: "Attendance today",
                  value: presentToday + " of " + totalToday,
                  hint: "marked",
                  tone: "warn"
                },
                {
                  label: "Upcoming assignments",
                  value: String(due.length),
                  hint: due.length ? "not yet due" : "none upcoming",
                  tone: due.length ? "warn" : "muted"
                },
                {
                  label: "Marks to enter",
                  value: "0",
                  hint: "results are not connected yet",
                  tone: "alert"
                }
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
      client.from("students").select("id,admission_no,first_name,last_name,gender,status").order("first_name"),
      client.from("staff").select("id,staff_no,full_name,job_title,status").order("full_name"),
      client.from("classes").select("id,name,level,arm").order("name"),
      client.from("admissions").select("id,applicant_name,guardian_name,class_applied,status,created_at,reviewed_by").order("created_at", { ascending: false }),
      client.from("fee_records").select("id,student_id,term_id,fee_type,amount_due_kobo,status", { count: "exact" }),
      client.from("payments").select("id,fee_record_id,amount_kobo,paid_at,status", { count: "exact" }),
      client.from("announcements").select("id,title,body,audience,status,created_at").order("created_at", { ascending: false }),
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

                  var totalFees = (fees.data || []).reduce(function (sum, f) {
        return sum + Number(f.amount_due_kobo || 0) / 100;
      }, 0);

      var paymentsByFee = {};
      (payments.data || []).forEach(function (p) {
        if (p.status === "recorded") {
          paymentsByFee[p.fee_record_id] =
            (paymentsByFee[p.fee_record_id] || 0) + Number(p.amount_kobo || 0);
        }
      });

      var outstanding = (fees.data || []).filter(function (f) {
        if (f.status === "paid" || f.status === "waived") return false;
        return Number(f.amount_due_kobo || 0) > (paymentsByFee[f.id] || 0);
      });

      var outstandingTotal = outstanding.reduce(function (sum, f) {
        var remainingKobo = Number(f.amount_due_kobo || 0) - (paymentsByFee[f.id] || 0);
        return sum + Math.max(0, remainingKobo) / 100;
      }, 0);
      var studentRows = students.map(function (s) {
        return [
          s.admission_no || "—",
          [s.first_name, s.last_name].filter(Boolean).join(" ") || "—",
          "—",
          (s.status || "unknown").toUpperCase()
        ];
      });

      var staffRows = staffList.map(function (s) {
        return [
          s.staff_no || "—",
          s.full_name || "—",
          s.job_title || "—",
          (s.status || "unknown").toUpperCase()
        ];
      });

      var classRows = classes.map(function (c) {
        return [
          c.name || "—",
          [c.level, c.arm].filter(Boolean).join(" ") || "—",
          "—",
          "—"
        ];
      });

      var admissionRows = admissions.map(function (a) {
        return [
          "ADM-" + String(a.id).slice(0, 8).toUpperCase(),
          a.applicant_name || "—",
          a.class_applied || "—",
          fmtDate(a.created_at),
          (a.status || "").toUpperCase()
        ];
      });
        var feeRows = (fees.data || []).map(function (f) {
        return [
          "FR-" + String(f.id).padStart(4, "0"),
          studentById[f.student_id]
  ? [studentById[f.student_id].first_name, studentById[f.student_id].last_name].filter(Boolean).join(" ")
  : "—",
          (f.fee_type || "School fee") + " (" + (term ? term.name : "") + ")",
          money(Number(f.amount_due_kobo || 0) / 100),
          (f.status || "").toUpperCase()
        ];
      });
      var announcementRecords = announcements.map(function (a) {
        return {
          title: a.title,
          meta: "Posted " + fmtDate(a.created_at) + " • " + (a.audience || "all"),
          badge: a.status === "published" ? { text: "Published", tone: "ok" } : { text: "Draft", tone: "muted" },
          body: a.body || ""
        };
      });

      var panels = [
        {
          id: "pupils", title: "Manage pupils", intro: "Add, move or update pupil records.",
          kind: "table", caption: "All pupils on roll",
          columns: ["Admission no.", "Pupil", "Class", "Status"],
          rows: studentRows,
          actions: ["add", "edit", "delete"],
          emptyMessage: "No pupils match this search."
        },
        {
          id: "staff", title: "Manage staff", intro: "Staff records, roles and class allocations.",
          kind: "table", caption: "All staff",
          columns: ["Staff no.", "Name", "Job title", "Status"],
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
            { label: "Open applications", value: String(admissions.filter(function (a) { return a.status === "new" || a.status === "reviewing"; }).length), hint: "awaiting decision", tone: "warn" }],
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
