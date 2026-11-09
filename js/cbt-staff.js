(function () {
  "use strict";
  var main = document.querySelector('main[data-portal-dashboard="staff"]');
  if (!main) return;
  var API_URL = "https://gyrucocuozyhlnzgkzvd.supabase.co/functions/v1/cbt-api";
  var API_KEY = "sb_publishable_tIWx7KNFDaAUEw2xQnJ3cQ_zwTPQ4eT";
  var data = null;
  var selected = null;
  var questions = [];

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function status(text, error) {
    var node = document.getElementById("cbt-staff-message");
    if (!node) return;
    node.hidden = !text;
    node.className = "notice " + (error ? "notice--error" : "notice--info");
    node.textContent = text || "";
  }
  async function call(action, payload) {
    var client = window.SupabaseClient && window.SupabaseClient.getClient();
    var session = client && await client.auth.getSession();
    var token = session && session.data && session.data.session && session.data.session.access_token;
    if (!token) throw new Error("Your school session has expired. Sign in again.");
    var response = await fetch(API_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "apikey": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || "The CBT request failed.");
    return result.data;
  }
  function renderExams() {
    var target = document.getElementById("cbt-staff-exams");
    if (!target) return;
    var exams = data.exams || [];
    target.innerHTML = exams.length ? exams.map(function (exam) {
      return '<tr><td>' + esc(exam.title) + '</td><td>' + esc(new Date(exam.starts_at).toLocaleString()) +
        '</td><td>' + esc(exam.status) + '</td><td><button class="btn btn--outline-navy btn--small" type="button" data-staff-exam="' +
        esc(exam.id) + '">' + (data.staff_role === "teacher" ? "Manage questions" : "Select") + '</button></td></tr>';
    }).join("") : '<tr><td colspan="4" class="muted">No CBT assignments have been added to your account.</td></tr>';
  }
  async function load() {
    status("Loading your CBT assignments…");
    try {
      data = await call("staff.dashboard");
      document.getElementById("cbt-staff-role").textContent =
        data.staff_role === "teacher" ? "Teacher tools" : "Invigilator tools";
      renderExams();
      document.getElementById("cbt-invig-panel").hidden = data.staff_role !== "invigilator";
      document.getElementById("cbt-teacher-panel").hidden = data.staff_role !== "teacher";
      status("Your CBT staff access is active.");
    } catch (error) { status(error.message, true); }
  }
  async function loadManualReviews(examId) {
    var target = document.getElementById("cbt-manual-responses");
    if (!target) return;
    target.innerHTML = "<p class='muted'>Loading written responses…</p>";
    try {
      var result = await call("staff.manual_reviews", { exam_id: examId });
      var responses = result.responses || [];
      if (!responses.length) {
        target.innerHTML = "<p class='muted'>No written responses are awaiting marking for this examination.</p>";
        return;
      }
      target.innerHTML = responses.map(function (response) {
        return '<article class="panel mt-1"><h4>' + esc(response.student_name) + ' · ' +
          esc(response.admission_no) + '</h4>' + response.answers.map(function (answer) {
            return '<form class="cbt-grade-form mt-1"><input type="hidden" name="attempt_id" value="' +
              esc(response.attempt_id) + '"><input type="hidden" name="question_id" value="' +
              esc(answer.question_id) + '"><p><strong>' + esc(answer.prompt) + '</strong></p>' +
              '<blockquote>' + esc(answer.answer || "No answer provided") + '</blockquote>' +
              '<label>Mark (maximum ' + esc(answer.marks) + ')<input class="form-control" type="number" name="score" min="0" max="' +
              esc(answer.marks) + '" step="0.5" value="' + esc(answer.score) + '" required></label>' +
              '<label>Feedback<textarea class="form-control" name="feedback" rows="2" maxlength="1000">' +
              esc(answer.feedback) + '</textarea></label><button class="btn btn--primary btn--small mt-1" type="submit">Save mark</button></form>';
          }).join("") + '</article>';
      }).join("");
    } catch (error) {
      target.innerHTML = "<p class='notice notice--error'>" + esc(error.message) + "</p>";
    }
  }

  async function openExam(id) {
    selected = (data.exams || []).find(function (x) { return x.id === id; });
    if (!selected) return;
    document.getElementById("cbt-staff-selected").hidden = false;
    document.getElementById("cbt-staff-selected-title").textContent = selected.title;
    var invigSelect = document.getElementById("cbt-staff-invig-exam");
    if (invigSelect) invigSelect.innerHTML = '<option value="' + esc(id) + '">' + esc(selected.title) + "</option>";
    if (data.staff_role === "teacher") {
      try {
        var result = await call("admin.questions", { exam_id: id });
        questions = result.questions || [];
        document.getElementById("cbt-staff-question-list").innerHTML = questions.length
          ? questions.map(function (q) { return "<li><strong>" + esc(q.position) + ". " + esc(q.prompt) +
            "</strong><span class='muted'> · " + esc(q.question_type) + " · " + esc(q.marks) + " marks</span></li>"; }).join("")
          : "<li class='muted'>No questions added yet.</li>";
        document.getElementById("cbt-staff-position").value = String(questions.length + 1);
        await loadManualReviews(id);
      } catch (error) { status(error.message, true); }
    }
  }

  var section = document.createElement("section");
  section.className = "panel mt-2";
  section.id = "staff-cbt-panel";
  section.hidden = true;
  section.innerHTML =
    '<div class="panel__head"><div><span class="eyebrow">Examination operations</span><h2>CBT Staff Tools</h2><p id="cbt-staff-role" class="muted">Loading…</p></div><button class="btn btn--outline-navy btn--small" id="cbt-staff-refresh" type="button">Refresh</button></div>' +
    '<div id="cbt-staff-message" class="notice notice--info" hidden role="status"></div>' +
    '<h3>Your assigned examinations</h3><div class="table-wrap"><table class="table"><thead><tr><th>Examination</th><th>Scheduled start</th><th>Status</th><th></th></tr></thead><tbody id="cbt-staff-exams"></tbody></table></div>' +
    '<section id="cbt-staff-selected" class="panel mt-2" hidden><h3 id="cbt-staff-selected-title">Selected exam</h3>' +
      '<section id="cbt-teacher-panel" hidden><h4>Questions</h4><ol id="cbt-staff-question-list"></ol>' +
        '<form id="cbt-staff-add-question" class="mt-2"><h4>Add question</h4><div class="grid grid--2">' +
          '<label>Type<select class="form-control" name="question_type"><option value="mcq">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Short answer</option></select></label>' +
          '<label>Marks<input class="form-control" name="marks" type="number" min="0.5" max="100" step="0.5" value="1" required></label>' +
          '<label>Position<input class="form-control" name="position" id="cbt-staff-position" type="number" min="1" value="1" required></label>' +
          '<label class="cbt-staff-mcq">Options (one per line)<textarea class="form-control" name="options" rows="4"></textarea></label>' +
          '<label class="cbt-staff-mcq">Correct option (A, B, C… or True/False)<input class="form-control" name="answer_key" placeholder="A"></label>' +
          '<label>Question<textarea class="form-control" name="prompt" rows="3" required maxlength="5000"></textarea></label></div>' +
          '<button class="btn btn--primary mt-1" type="submit">Save question</button></form>' +
        '<section class="mt-2"><h4>Written responses awaiting marking</h4><div id="cbt-manual-responses"><p class="muted">Select an examination to load written responses.</p></div></section></section>' +
      '<section id="cbt-invig-panel" hidden><p>Confirm the student's admission number and enter the examination PIN supplied by the administrator.</p>' +
        '<form id="cbt-verify-student"><label>Student admission number<input class="form-control" name="admission_no" required></label>' +
        '<label>Session PIN<input class="form-control" name="pin" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required></label>' +
        '<button class="btn btn--primary mt-1" type="submit">Authorize student</button></form></section></section>';

  var dash = main.querySelector("[data-dash-panels]");
  if (dash) dash.after(section);
  var header = main.querySelector(".dash__head");
  var link = document.createElement("a");
  link.className = "btn btn--primary btn--small";
  link.href = "#staff-cbt";
  link.textContent = "CBT Staff Tools";
  link.addEventListener("click", function (event) {
    event.preventDefault();
    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    if (!data) load();
  });
  if (header) header.appendChild(link);

  document.addEventListener("click", function (event) {
    var examButton = event.target.closest("[data-staff-exam]");
    if (examButton) openExam(examButton.getAttribute("data-staff-exam"));
    if (event.target.id === "cbt-staff-refresh") load();
  });
  section.addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.target;
    try {
      if (form.classList.contains("cbt-grade-form") && selected) {
        var grade = new FormData(form);
        var saved = await call("staff.grade_response", {
          exam_id: selected.id,
          attempt_id: grade.get("attempt_id"),
          question_id: grade.get("question_id"),
          score: Number(grade.get("score")),
          feedback: grade.get("feedback")
        });
        status(saved.complete ? "All written answers for this student's attempt are marked." : "Mark saved. Other written answers still need marking.");
        await loadManualReviews(selected.id);
      } else if (form.id === "cbt-staff-add-question" && selected) {
        var q = new FormData(form);
        var type = q.get("question_type");
        var lines = String(q.get("options") || "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
        var options = lines.map(function (label, i) { return { label: label, value: String.fromCharCode(65 + i) }; });
        var answer = String(q.get("answer_key") || "").trim();
        await call("admin.save_question", {
          exam_id: selected.id, question_type: type, prompt: q.get("prompt"),
          position: Number(q.get("position")), marks: Number(q.get("marks")),
          options: options, answer_key: type === "short_answer" ? {} : (type === "true_false" ? answer.toLowerCase() : answer.toUpperCase())
        });
        form.reset();
        form.elements.position.value = String(questions.length + 2);
        await openExam(selected.id);
        status("Question saved.");
      } else if (form.id === "cbt-verify-student" && selected) {
        var dataForm = new FormData(form);
        var result = await call("invigilator.verify_student", {
          exam_id: selected.id, admission_no: dataForm.get("admission_no"), pin: dataForm.get("pin")
        });
        status("Student authorized: " + result.student.name + " (" + result.student.admission_no + ").");
        form.reset();
      }
    } catch (error) { status(error.message, true); }
  });
  section.addEventListener("change", function (event) {
    if (event.target.name === "question_type") {
      var show = event.target.value === "mcq";
      section.querySelectorAll(".cbt-staff-mcq").forEach(function (node) { node.hidden = !show; });
    }
  });
  if (location.hash === "#staff-cbt") {
    section.hidden = false;
    load();
  }
})();