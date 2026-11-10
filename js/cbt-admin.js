(function () {
  "use strict";

  var main = document.querySelector('main[data-portal-dashboard="admin"]');
  if (!main) return;

  var API_URL = "https://gyrucocuozyhlnzgkzvd.supabase.co/functions/v1/cbt-api";
  var API_KEY = "sb_publishable_tIWx7KNFDaAUEw2xQnJ3cQ_zwTPQ4eT";
  var state = { data: null, exam: null, questions: [] };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function message(text, type) {
    var target = document.getElementById("cbt-admin-message");
    if (!target) return;
    target.hidden = !text;
    target.className = "notice " + (type === "error" ? "notice--error" : "notice--info");
    target.textContent = text || "";
  }
  async function call(action, payload) {
    var client = window.SupabaseClient && window.SupabaseClient.getClient();
    if (!client) throw new Error("The school login service is not ready.");
    var session = await client.auth.getSession();
    var token = session.data && session.data.session && session.data.session.access_token;
    if (!token) throw new Error("Your school session has expired. Sign in again.");
    var response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "apikey": API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || "The CBT request failed.");
    return result.data;
  }
  function fillSelect(select, rows, labelFn) {
    if (!select) return;
    select.innerHTML = '<option value="">Choose…</option>' + rows.map(function (row) {
      return '<option value="' + escapeHtml(row.id || row.profile_id) + '">' +
        escapeHtml(labelFn(row)) + "</option>";
    }).join("");
  }
  function selectData() {
    var d = state.data;
    fillSelect(document.getElementById("cbt-class"), d.classes, function (x) { return x.name + (x.level ? " · " + x.level : "") + (x.arm ? " " + x.arm : ""); });
    fillSelect(document.getElementById("cbt-subject"), d.subjects, function (x) { return x.name + (x.code ? " · " + x.code : ""); });
    fillSelect(document.getElementById("cbt-session"), d.sessions, function (x) { return x.name + (x.is_current ? " · Current" : ""); });
    fillSelect(document.getElementById("cbt-teacher-class"), d.classes, function (x) { return x.name; });
    fillSelect(document.getElementById("cbt-teacher-subject"), d.subjects, function (x) { return x.name; });
    fillSelect(document.getElementById("cbt-teacher-session"), d.sessions, function (x) { return x.name; });
    fillSelect(document.getElementById("cbt-teacher-staff"), d.staff, function (x) { return x.full_name + (x.job_title ? " · " + x.job_title : ""); });
    fillSelect(document.getElementById("cbt-invigilator-staff"), d.staff, function (x) { return x.full_name + (x.job_title ? " · " + x.job_title : ""); });
  }
  function labelFor(kind, id) {
    var rows = state.data && state.data[kind] || [];
    var item = rows.find(function (row) { return row.id === id; });
    return item ? item.name : "—";
  }
  function renderExams() {
    var target = document.getElementById("cbt-exams-body");
    if (!target) return;
    var rows = state.data.exams || [];
    if (!rows.length) {
      target.innerHTML = '<tr><td colspan="5" class="muted">No examinations created yet.</td></tr>';
      return;
    }
    target.innerHTML = rows.map(function (exam) {
      return '<tr><td>' + escapeHtml(exam.title) + '</td><td>' +
        escapeHtml(labelFor("classes", exam.class_id)) + '</td><td>' +
        escapeHtml(labelFor("subjects", exam.subject_id)) + '</td><td>' +
        escapeHtml(exam.status) + '</td><td><button type="button" class="btn btn--outline-navy btn--small" data-open-exam="' +
        escapeHtml(exam.id) + '">Manage</button></td></tr>';
    }).join("");
  }
  async function loadDashboard() {
    message("Loading CBT administration data…");
    try {
      state.data = await call("admin.dashboard");
      selectData();
      renderExams();
      message("CBT is connected to the school records.", "info");
    } catch (error) {
      message(error.message, "error");
    }
  }
  async function loadQuestions(examId) {
    state.questions = [];
    var result = await call("admin.questions", { exam_id: examId });
    state.questions = result.questions || [];
    var target = document.getElementById("cbt-question-list");
    if (!target) return;
    target.innerHTML = state.questions.length ? state.questions.map(function (q) {
      return '<li><strong>' + escapeHtml(q.position) + '. ' + escapeHtml(q.prompt) +
        '</strong><span class="muted"> · ' + escapeHtml(q.question_type) + ' · ' +
        escapeHtml(q.marks) + ' marks</span></li>';
    }).join("") : "<li class='muted'>No questions added yet.</li>";
    var position = document.getElementById("cbt-question-position");
    if (position) position.value = String(state.questions.length + 1);
  }
  async function openExam(id) {
    var exam = state.data.exams.find(function (x) { return x.id === id; });
    if (!exam) return;
    state.exam = exam;
    document.getElementById("cbt-selected-exam").hidden = false;
    document.getElementById("cbt-selected-title").textContent = exam.title;
    document.getElementById("cbt-selected-meta").textContent =
      labelFor("classes", exam.class_id) + " · " + labelFor("subjects", exam.subject_id) +
      " · " + exam.status;
    document.getElementById("cbt-schedule-button").hidden = exam.status !== "draft";
    document.getElementById("cbt-close-button").hidden = !["scheduled", "open"].includes(exam.status) ||
      Date.now() < new Date(exam.ends_at).getTime();
    document.getElementById("cbt-release-button").hidden = exam.status !== "closed";
    document.getElementById("cbt-review-report-button").hidden = !["closed", "released"].includes(exam.status);
    fillSelect(document.getElementById("cbt-invigilator-exam"), [exam], function (x) { return x.title; });
    try { await loadQuestions(id); message("Examination selected.", "info"); }
    catch (error) { message(error.message, "error"); }
  }
  function reveal() {
    if (window.PortalDashboard) window.PortalDashboard.activate("cbt-administration", false);
    else {
      var section = document.getElementById("cbt-admin-panel");
      section.hidden = false;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (!state.data) loadDashboard();
  }

  var panel = document.createElement("section");
  panel.id = "cbt-admin-panel";
  panel.className = "panel mt-2";
  panel.hidden = true;
  panel.innerHTML =
    '<div class="panel__head"><div><span class="eyebrow">Examination management</span><h2 id="cbt-administration">CBT Management</h2><p class="muted">Manage examination records, assign invigilators and review results. Subject teachers create examinations and generate their PINs from the Staff Dashboard.</p></div>' +
    '<button type="button" class="btn btn--outline-navy btn--small" id="cbt-sync-students">Sync student records</button></div>' +
    '<div id="cbt-admin-message" class="notice notice--info" role="status" hidden></div>' +
    '<div class="grid grid--2 mt-2">' +
      '<section class="panel"><h3>Create examination</h3><form id="cbt-create-exam" class="form-stack">' +
        '<label>Examination title<input class="form-control" name="title" required maxlength="180"></label>' +
        '<label>Class<select class="form-control" id="cbt-class" name="class_id" required></select></label>' +
        '<label>Subject<select class="form-control" id="cbt-subject" name="subject_id" required></select></label>' +
        '<label>Academic session<select class="form-control" id="cbt-session" name="session_id" required></select></label>' +
        '<label>Starts at<input class="form-control" type="datetime-local" name="starts_at" required></label>' +
        '<label>Ends at<input class="form-control" type="datetime-local" name="ends_at" required></label>' +
        '<label>Duration (minutes)<input class="form-control" type="number" name="duration_minutes" min="1" max="300" value="60" required></label>' +
        '<label>Instructions<textarea class="form-control" name="instructions" rows="3" maxlength="5000"></textarea></label>' +
        '<button class="btn btn--primary" type="submit">Create draft examination</button></form></section>' +
      '<section class="panel"><h3>Examinations</h3><div class="table-wrap"><table class="table"><thead><tr><th>Exam</th><th>Class</th><th>Subject</th><th>Status</th><th></th></tr></thead><tbody id="cbt-exams-body"><tr><td colspan="5">Loading…</td></tr></tbody></table></div></section>' +
    '</div>' +
    '<section id="cbt-selected-exam" class="panel mt-2" hidden><div class="panel__head"><div><h3 id="cbt-selected-title">Selected examination</h3><p id="cbt-selected-meta" class="muted"></p></div><div class="btn-row"><button id="cbt-schedule-button" type="button" class="btn btn--primary">Schedule exam</button><button id="cbt-close-button" type="button" class="btn btn--outline-navy" hidden>Close exam</button><button id="cbt-release-button" type="button" class="btn btn--primary" hidden>Release results</button><button id="cbt-results-button" type="button" class="btn btn--ghost">View results</button><button id="cbt-review-report-button" type="button" class="btn btn--outline-navy" hidden>Teacher review reports</button></div></div>' +
      '<h4>Questions</h4><ol id="cbt-question-list"><li class="muted">Loading questions…</li></ol>' +
      '<form id="cbt-add-question" class="mt-2"><h4>Add question</h4><div class="grid grid--2">' +
        '<label>Question type<select class="form-control" name="question_type"><option value="mcq">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Short answer (manual review)</option></select></label>' +
        '<label>Marks<input class="form-control" name="marks" type="number" min="0.5" max="100" step="0.5" value="1" required></label>' +
        '<label>Position<input class="form-control" name="position" id="cbt-question-position" type="number" min="1" value="1" required></label>' +
        '<label class="cbt-mcq-field">Options (one per line)<textarea class="form-control" name="options" rows="4" placeholder="First option&#10;Second option&#10;Third option&#10;Fourth option"></textarea></label>' +
        '<label class="cbt-mcq-field">Correct option (A, B, C… or True/False)<input class="form-control" name="answer_key" placeholder="A"></label>' +
        '<label>Question text<textarea class="form-control" name="prompt" rows="3" required maxlength="5000"></textarea></label></div>' +
        '<button class="btn btn--primary mt-1" type="submit">Save question</button></form>' +
      '<div class="grid grid--2 mt-2"><form id="cbt-assign-invigilator"><h4>Assign invigilator</h4><label>Staff member<select class="form-control" id="cbt-invigilator-staff" name="profile_id" required></select></label><button class="btn btn--outline-navy mt-1" type="submit">Assign to this exam</button></form>' +
      '<form id="cbt-assign-teacher"><h4>Assign teacher</h4><label>Staff member<select class="form-control" id="cbt-teacher-staff" name="profile_id" required></select></label><label>Class<select class="form-control" id="cbt-teacher-class" name="class_id" required></select></label><label>Subject<select class="form-control" id="cbt-teacher-subject" name="subject_id" required></select></label><label>Session<select class="form-control" id="cbt-teacher-session" name="session_id" required></select></label><button class="btn btn--outline-navy mt-1" type="submit">Assign teacher</button></form></div>' +
      '<div id="cbt-results-output" class="mt-2" hidden></div><div id="cbt-review-report-output" class="mt-2" hidden></div>' +
    '</section>';

  var dataPanels = main.querySelector("[data-dash-panels]");
  if (dataPanels) dataPanels.after(panel);

  document.addEventListener("click", async function (event) {
    var openButton = event.target.closest("[data-open-exam]");
    if (openButton) return openExam(openButton.getAttribute("data-open-exam"));
    if (event.target.id === "cbt-sync-students") {
      try {
        var result = await call("admin.sync_students");
        message("Student directory synced: " + result.synced + " active and historical enrolment records processed.", "info");
      } catch (error) { message(error.message, "error"); }
    }
    if (event.target.id === "cbt-schedule-button" && state.exam) {
      try {
        await call("admin.schedule_exam", { exam_id: state.exam.id });
        await loadDashboard();
        await openExam(state.exam.id);
        message("Examination scheduled successfully.", "info");
      } catch (error) { message(error.message, "error"); }
    }
    if (event.target.id === "cbt-close-button" && state.exam) {
      try {
        await call("admin.close_exam", { exam_id: state.exam.id });
        await loadDashboard();
        await openExam(state.exam.id);
        message("Examination closed. Unfinished attempts were expired.", "info");
      } catch (error) { message(error.message, "error"); }
    }
    if (event.target.id === "cbt-release-button" && state.exam) {
      try {
        await call("admin.release_results", { exam_id: state.exam.id });
        await loadDashboard();
        await openExam(state.exam.id);
        message("Results released. Students can now view their published scores.", "info");
      } catch (error) { message(error.message, "error"); }
    }
    if (event.target.id === "cbt-review-report-button" && state.exam) {
      try {
        var reports = await call("admin.review_reports", { exam_id: state.exam.id });
        var reportOut = document.getElementById("cbt-review-report-output");
        reportOut.hidden = false;
        reportOut.innerHTML = '<h4>Teacher review reports</h4>' +
          ((reports.reports || []).length ? reports.reports.map(function (report) {
            var meta = report.metadata || {};
            return '<article class="notice notice--info"><strong>Review submitted</strong><p>Teacher account: ' +
              escapeHtml(report.actor_profile_id) + '</p><p>Submitted: ' +
              escapeHtml(new Date(report.created_at).toLocaleString()) + '</p><p>Attempts reviewed: ' +
              escapeHtml(meta.attempts_reviewed == null ? "—" : meta.attempts_reviewed) +
              ' · Written responses marked: ' + escapeHtml(meta.written_responses_marked == null ? "—" : meta.written_responses_marked) +
              '</p><p>' + escapeHtml(meta.note || "No additional note.") + '</p></article>';
          }).join("") : '<p class="muted">No teacher review report has been submitted for this examination yet.</p>');
      } catch (error) { message(error.message, "error"); }
    }
    if (event.target.id === "cbt-results-button" && state.exam) {
      try {
        var resultData = await call("admin.results", { exam_id: state.exam.id });
        var out = document.getElementById("cbt-results-output");
        out.hidden = false;
        out.innerHTML = '<h4>Exam results</h4><div class="table-wrap"><table class="table"><thead><tr><th>Student account</th><th>Status</th><th>Score</th><th>Review</th></tr></thead><tbody>' +
          (resultData.results || []).map(function (r) {
            return "<tr><td>" + escapeHtml(r.student_name + (r.admission_no ? " · " + r.admission_no : "")) + "</td><td>" + escapeHtml(r.status) +
              "</td><td>" + escapeHtml(r.score == null ? "—" : r.score + " / " + r.max_score) +
              "</td><td>" + (r.requires_manual_review ? "Required" : "No") + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      } catch (error) { message(error.message, "error"); }
    }
  });

  panel.addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.target;
    try {
      if (form.id === "cbt-create-exam") {
        var fd = new FormData(form);
        var payload = Object.fromEntries(fd.entries());
        payload.duration_minutes = Number(payload.duration_minutes);
        payload.starts_at = new Date(payload.starts_at).toISOString();
        payload.ends_at = new Date(payload.ends_at).toISOString();
        await call("admin.create_exam", payload);
        form.reset();
        await loadDashboard();
        message("Draft examination created.", "info");
      } else if (form.id === "cbt-add-question" && state.exam) {
        var q = new FormData(form);
        var type = q.get("question_type");
        var optionsText = String(q.get("options") || "");
        var lines = optionsText.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
        var options = lines.map(function (label, i) { return { label: label, value: String.fromCharCode(65 + i) }; });
        var answer = String(q.get("answer_key") || "").trim();
        var body = {
          exam_id: state.exam.id, question_type: type, prompt: q.get("prompt"),
          position: Number(q.get("position")), marks: Number(q.get("marks")),
          options: options, answer_key: type === "short_answer" ? {} : (type === "true_false" ? answer.toLowerCase() : answer.toUpperCase())
        };
        await call("admin.save_question", body);
        form.reset();
        form.elements.position.value = String(state.questions.length + 2);
        await loadQuestions(state.exam.id);
        message("Question saved.", "info");
      } else if (form.id === "cbt-assign-invigilator" && state.exam) {
        await call("admin.assign_staff", {
          profile_id: form.elements.profile_id.value, staff_role: "invigilator", exam_id: state.exam.id
        });
        message("Invigilator assigned to this examination.", "info");
      } else if (form.id === "cbt-assign-teacher") {
        await call("admin.assign_staff", {
          profile_id: form.elements.profile_id.value, staff_role: "teacher",
          class_id: form.elements.class_id.value, subject_id: form.elements.subject_id.value,
          session_id: form.elements.session_id.value
        });
        message("Teacher assignment saved and verified against the school teaching timetable.", "info");
      }
    } catch (error) { message(error.message, "error"); }
  });

  panel.addEventListener("change", function (event) {
    if (event.target.name === "question_type") {
      var showOptions = event.target.value === "mcq";
      panel.querySelectorAll(".cbt-mcq-field").forEach(function (item) {
        item.hidden = !showOptions;
      });
    }
  });

  window.addEventListener("school:class-roster-updated", loadDashboard);
  window.addEventListener("school:subjects-updated", loadDashboard);
  loadDashboard();
  if (location.hash === "#cbt-administration") reveal();
})();