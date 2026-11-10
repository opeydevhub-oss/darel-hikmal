(function () {
  "use strict";

  var main = document.querySelector('main[data-portal-dashboard="staff"]');
  if (!main) return;

  var API_URL = "https://gyrucocuozyhlnzgkzvd.supabase.co/functions/v1/cbt-api";
  var API_KEY = "sb_publishable_tIWx7KNFDaAUEw2xQnJ3cQ_zwTPQ4eT";
  var data = null;
  var selected = null;
  var questions = [];
  var lastPinMessage = "";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function status(message, error) {
    var node = document.getElementById("cbt-staff-message");
    if (!node) return;
    node.hidden = !message;
    node.className = "notice " + (error ? "notice--error" : "notice--info");
    node.textContent = message || "";
  }

  async function call(action, payload) {
    var client = window.SupabaseClient && window.SupabaseClient.getClient();
    var session = client && await client.auth.getSession();
    var token = session && session.data && session.data.session && session.data.session.access_token;
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

  function assignmentForExam(exam) {
    return (data.assignments || []).find(function (item) {
      return item.class_id === exam.class_id &&
        item.subject_id === exam.subject_id &&
        item.session_id === exam.session_id;
    }) || null;
  }

  function renderAssignments() {
    var target = document.getElementById("cbt-staff-assignment");
    if (!target) return;
    var assignments = data.assignments || [];
    target.innerHTML = '<option value="">Choose an assigned subject and class…</option>' +
      assignments.map(function (item, index) {
        return '<option value="' + index + '">' + esc(item.label || (item.subject_name + " · " + item.class_name)) + "</option>";
      }).join("");
    var hint = document.getElementById("cbt-staff-assignment-hint");
    if (hint) hint.textContent = assignments.length
      ? "You can create examinations only for the subjects and classes assigned to your staff account."
      : "No subject-specific teaching assignment was found. Ask the school administrator to assign your subject and class.";
    var form = document.getElementById("cbt-staff-create-exam");
    if (form) form.querySelector('button[type="submit"]').disabled = assignments.length === 0;
  }

  function renderExams() {
    var isInvigilator = data && data.staff_role === "invigilator";
    var target = document.getElementById(isInvigilator ? "cbt-staff-invig-exams" : "cbt-staff-exams");
    if (!target) return;
    var exams = data.exams || [];
    if (!exams.length) {
      target.innerHTML = '<tr><td colspan="' + (isInvigilator ? "4" : "5") +
        '" class="muted">' + (isInvigilator
          ? "No invigilation assignments have been added to your account yet."
          : "No examinations have been created for your assigned subjects yet.") + "</td></tr>";
      return;
    }
    target.innerHTML = exams.map(function (exam) {
      var assignment = assignmentForExam(exam);
      if (isInvigilator) {
        return "<tr><td>" + esc(exam.title) + "</td><td>" +
          esc(new Date(exam.starts_at).toLocaleString()) + "</td><td>" +
          esc(exam.status) + "</td><td><button class='btn btn--outline-navy btn--small' type='button' data-staff-exam='" +
          esc(exam.id) + "'>Select</button></td></tr>";
      }
      return "<tr><td>" + esc(exam.title) + "</td><td>" +
        esc(assignment ? assignment.class_name : "Assigned class") + "</td><td>" +
        esc(assignment ? assignment.subject_name : "Assigned subject") + "</td><td>" +
        esc(exam.status) + "</td><td><button class='btn btn--outline-navy btn--small' type='button' data-staff-exam='" +
        esc(exam.id) + "'>Open</button></td></tr>";
    }).join("");
  }
  function localDateTime(value) {
    var local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function setScheduleDefaults() {
    var form = document.getElementById("cbt-staff-create-exam");
    if (!form) return;
    var start = new Date(Date.now() + 60 * 60 * 1000);
    var end = new Date(start.getTime() + 60 * 60 * 1000);
    form.elements.starts_at.value = localDateTime(start);
    form.elements.ends_at.value = localDateTime(end);
    form.elements.duration_minutes.value = "60";
  }

  async function load() {
    status("Loading your CBT access and subject assignments…");
    try {
      data = await call("staff.dashboard");
      document.getElementById("cbt-staff-role").textContent =
        data.staff_role === "teacher" ? "Subject teacher · Exam creation and marking" : "Invigilator · Student entry verification";
      var teacher = data.staff_role === "teacher";
      document.getElementById("cbt-teacher-panel").hidden = !teacher;
      document.getElementById("cbt-invig-panel").hidden = teacher;
      if (teacher) renderAssignments();
      renderExams();
      status(teacher ? "Your subject-teacher CBT access is active." : "Your invigilator CBT access is active.");
    } catch (error) {
      status(error.message, true);
    }
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
        return '<article class="panel mt-1"><h4>' + esc(response.student_name) + " · " +
          esc(response.admission_no) + "</h4>" + response.answers.map(function (answer) {
            return '<form class="cbt-grade-form mt-1"><input type="hidden" name="attempt_id" value="' +
              esc(response.attempt_id) + '"><input type="hidden" name="question_id" value="' +
              esc(answer.question_id) + '"><p><strong>' + esc(answer.prompt) + "</strong></p>" +
              "<blockquote>" + esc(answer.answer || "No answer provided") + "</blockquote>" +
              '<label>Mark (maximum ' + esc(answer.marks) + ')<input class="form-control" type="number" name="score" min="0" max="' +
              esc(answer.marks) + '" step="0.5" value="' + esc(answer.score) + '" required></label>' +
              '<label>Feedback<textarea class="form-control" name="feedback" rows="2" maxlength="1000">' +
              esc(answer.feedback) + '</textarea></label><button class="btn btn--primary btn--small mt-1" type="submit">Save mark</button></form>';
          }).join("") + "</article>";
      }).join("");
    } catch (error) {
      target.innerHTML = "<p class='notice notice--error'>" + esc(error.message) + "</p>";
    }
  }

  function renderQuestionList() {
    var target = document.getElementById("cbt-staff-question-list");
    if (!target) return;
    target.innerHTML = questions.length ? questions.map(function (question) {
      var answer = question.answer_key;
      var answerText = question.question_type === "short_answer"
        ? "Manual marking"
        : (answer && typeof answer === "object" ? JSON.stringify(answer) : answer);
      return "<li><strong>" + esc(question.position) + ". " + esc(question.prompt) +
        "</strong><span class='muted'> · " + esc(question.question_type) + " · " +
        esc(question.marks) + " marks</span><p class='muted'>Correct answer: " +
        esc(answerText == null || answerText === "" ? "Manual marking" : answerText) + "</p></li>";
    }).join("") : "<li class='muted'>No questions added yet.</li>";
    var position = document.getElementById("cbt-staff-position");
    if (position) position.value = String(questions.length + 1);
  }

  function renderExamActions() {
    if (!selected) return;
    var questionForm = document.getElementById("cbt-staff-add-question");
    var schedulePin = document.getElementById("cbt-staff-schedule-pin");
    var close = document.getElementById("cbt-staff-close-exam");
    var report = document.getElementById("cbt-staff-review-report");
    if (questionForm) questionForm.hidden = selected.status !== "draft";
    if (schedulePin) {
      schedulePin.hidden = !["draft", "scheduled", "open"].includes(selected.status);
      schedulePin.textContent = selected.status === "draft" ? "Schedule & generate PIN" : "Generate / rotate PIN";
    }
    if (close) close.hidden = !["scheduled", "open"].includes(selected.status) ||
      Date.now() < new Date(selected.ends_at).getTime();
    if (report) report.hidden = selected.status !== "closed";
  }

  async function openExam(id) {
    selected = (data.exams || []).find(function (item) { return item.id === id; });
    if (!selected) return;
    lastPinMessage = "";
    var selectedPanel = document.getElementById("cbt-staff-selected");
    selectedPanel.hidden = false;
    document.getElementById("cbt-staff-selected-title").textContent = selected.title;
    var assignment = assignmentForExam(selected);
    document.getElementById("cbt-staff-selected-meta").textContent =
      (assignment ? assignment.class_name + " · " + assignment.subject_name : "Assigned subject") +
      " · " + selected.status + " · " + new Date(selected.starts_at).toLocaleString();
    var reportForm = document.getElementById("cbt-staff-review-report");
    if (reportForm) {
      reportForm.reset();
      document.getElementById("cbt-review-report-status").textContent = "";
      reportForm.querySelector('button[type="submit"]').disabled = false;
    }
    var invigSelect = document.getElementById("cbt-staff-invig-exam");
    if (invigSelect) invigSelect.innerHTML = '<option value="' + esc(id) + '">' + esc(selected.title) + "</option>";
    renderExamActions();
    document.getElementById("cbt-pin-result").hidden = true;

    if (data.staff_role === "teacher") {
      try {
        var result = await call("staff.questions", { exam_id: id });
        questions = result.questions || [];
        renderQuestionList();
        var review = await call("staff.exam_review", { exam_id: id });
        var reviewTarget = document.getElementById("cbt-staff-results-review");
        reviewTarget.innerHTML = (review.results || []).length
          ? '<table class="table"><thead><tr><th>Student</th><th>Status</th><th>Objective</th><th>Manual</th><th>Total</th><th>Review</th></tr></thead><tbody>' +
            review.results.map(function (row) {
              return "<tr><td>" + esc(row.student_name + (row.admission_no ? " · " + row.admission_no : "")) +
                "</td><td>" + esc(row.status) + "</td><td>" +
                esc(row.objective_score == null ? "—" : row.objective_score) + " / " + esc(row.max_score) +
                "</td><td>" + esc(row.manual_score == null ? "0" : row.manual_score) +
                "</td><td>" + esc(row.score == null ? "—" : row.score) + " / " + esc(row.max_score) +
                "</td><td>" + (row.requires_manual_review ? "Pending" : "Ready") + "</td></tr>";
            }).join("") + "</tbody></table>"
          : '<p class="muted">No submitted attempts are available for review yet.</p>';
        await loadManualReviews(id);
      } catch (error) {
        status(error.message, true);
      }
    }
  }

  var section = document.createElement("section");
  section.className = "panel mt-2";
  section.id = "cbt-staff-tools";
  section.hidden = true;
  section.innerHTML =
    '<div class="panel__head"><div><span class="eyebrow">Teaching and assessment</span><h2>CBT & Examinations</h2><p id="cbt-staff-role" class="muted">Loading staff permissions…</p></div><button class="btn btn--outline-navy btn--small" id="cbt-staff-refresh" type="button">Refresh</button></div>' +
    '<div id="cbt-staff-message" class="notice notice--info" hidden role="status"></div>' +
    '<section id="cbt-teacher-panel" hidden>' +
      '<section class="panel"><h3>Create an examination</h3><p class="muted">Choose one of your assigned subjects. The examination will be limited to that class, subject and academic session.</p>' +
        '<form id="cbt-staff-create-exam" class="form-stack">' +
          '<label>Assigned subject and class<select class="form-control" id="cbt-staff-assignment" name="assignment" required><option value="">Loading assignments…</option></select></label>' +
          '<p id="cbt-staff-assignment-hint" class="form-field__hint"></p>' +
          '<label>Examination title<input class="form-control" name="title" maxlength="180" required placeholder="e.g. English Language Test"></label>' +
          '<label>Instructions<textarea class="form-control" name="instructions" rows="2" maxlength="5000" placeholder="Instructions for students (optional)"></textarea></label>' +
          '<div class="grid grid--2"><label>Starts at<input class="form-control" type="datetime-local" name="starts_at" required></label>' +
          '<label>Ends at<input class="form-control" type="datetime-local" name="ends_at" required></label>' +
          '<label>Exam duration (minutes)<input class="form-control" type="number" name="duration_minutes" min="1" max="300" value="60" required></label></div>' +
          '<button class="btn btn--primary" type="submit">Create draft examination</button>' +
        '</form></section>' +
      '<section class="panel mt-2"><h3>Your subject examinations</h3><div class="table-wrap"><table class="table"><thead><tr><th>Examination</th><th>Class</th><th>Subject</th><th>Status</th><th></th></tr></thead><tbody id="cbt-staff-exams"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody></table></div></section>' +
      '<section id="cbt-staff-selected" class="panel mt-2" hidden><div class="panel__head"><div><h3 id="cbt-staff-selected-title">Selected exam</h3><p id="cbt-staff-selected-meta" class="muted"></p></div>' +
        '<div class="btn-row"><button class="btn btn--primary btn--small" id="cbt-staff-schedule-pin" type="button">Schedule & generate PIN</button><button class="btn btn--outline-navy btn--small" id="cbt-staff-close-exam" type="button" hidden>Close examination</button></div></div>' +
        '<div id="cbt-pin-result" class="notice notice--info" hidden><p><strong>Examination PIN</strong></p><p id="cbt-pin-value" class="cbt-pin-value"></p><p id="cbt-pin-expiry"></p><p class="muted">Give this PIN to the assigned invigilator. Students enter their student number and this same PIN on the separate CBT portal.</p><button class="btn btn--outline-navy btn--small" id="cbt-pin-copy" type="button">Copy invigilator message</button></div>' +
        '<h4>Questions and correct answers</h4><ol id="cbt-staff-question-list"><li class="muted">Loading questions…</li></ol>' +
        '<form id="cbt-staff-add-question" class="mt-2"><h4>Add question</h4><div class="grid grid--2">' +
          '<label>Question type<select class="form-control" name="question_type"><option value="mcq">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Short answer (manual marking)</option></select></label>' +
          '<label>Marks<input class="form-control" name="marks" type="number" min="0.5" max="100" step="0.5" value="1" required></label>' +
          '<label>Position<input class="form-control" name="position" id="cbt-staff-position" type="number" min="1" value="1" required></label>' +
          '<label class="cbt-staff-mcq">Options (one per line)<textarea class="form-control" name="options" rows="4" placeholder="First option&#10;Second option&#10;Third option&#10;Fourth option"></textarea></label>' +
          '<label id="cbt-staff-answer-wrap">Correct answer<input class="form-control" name="answer_key" placeholder="A, B, C… or True/False"></label>' +
          '<label>Question<textarea class="form-control" name="prompt" rows="3" required maxlength="5000"></textarea></label></div>' +
          '<button class="btn btn--primary mt-1" type="submit">Save question</button></form>' +
        '<form id="cbt-staff-review-report" class="mt-2" hidden><h4>Teacher review and submission</h4><p class="muted">After the examination is closed, check the automatically marked scores and submit this report to the administrator. If the exam contains only multiple-choice or true/false questions, no manual Save mark step is needed.</p><label>Review notes (optional)<textarea class="form-control" name="note" rows="3" maxlength="1500"></textarea></label><button class="btn btn--primary mt-1" type="submit">Submit results for administrator review</button><p class="form-field__hint" id="cbt-review-report-status" role="status"></p></form>' +
        '<section class="mt-2"><h4>Automatically marked results</h4><p class="muted">Objective questions are marked automatically from the correct answers you select.</p><div id="cbt-staff-results-review" class="table-wrap"><p class="muted">No results loaded.</p></div></section>' +
        '<section class="mt-2"><h4>Written responses awaiting marking</h4><div id="cbt-manual-responses"><p class="muted">Select an examination to load written responses.</p></div></section>' +

      "</section>" +
    "</section>" +
    '<section id="cbt-invig-panel" hidden><h3>Invigilator verification</h3><p>Use the examination PIN supplied by the subject teacher to authorize each student by admission number.</p>' +
      '<form id="cbt-verify-student"><label>Student admission number<input class="form-control" name="admission_no" required></label>' +
      '<label>Examination PIN<input class="form-control" name="pin" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" required></label>' +
      '<button class="btn btn--primary mt-1" type="submit">Authorize student</button></form>' +
      '<h3 class="mt-2">Your invigilation assignments</h3><div class="table-wrap"><table class="table"><thead><tr><th>Examination</th><th>Start</th><th>Status</th><th></th></tr></thead><tbody id="cbt-staff-invig-exams"></tbody></table></div>' +
    "</section>";

  var dash = main.querySelector("[data-dash-panels]");
  if (dash) dash.after(section);

  document.addEventListener("click", async function (event) {
    var cbtOpenButton = event.target.closest("[data-cbt-open]");
    if (cbtOpenButton) {
      event.preventDefault();
      if (window.PortalDashboard && window.PortalDashboard.config) {
        window.PortalDashboard.activate("cbt-staff-tools", false);
      } else {
        section.hidden = false;
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (!data) load();
    }
    var cbtNavigationLink = event.target.closest('[data-dash-link="cbt-staff-tools"]');
    if (cbtNavigationLink && !data) load();
    var examButton = event.target.closest("[data-staff-exam]");
    if (examButton) {
      if (data && data.staff_role === "invigilator") {
        var examId = examButton.getAttribute("data-staff-exam");
        selected = (data.exams || []).find(function (item) { return item.id === examId; });
        var select = document.getElementById("cbt-staff-invig-exam");
        if (select && selected) select.innerHTML = '<option value="' + esc(examId) + '">' + esc(selected.title) + "</option>";
        var invigForm = document.getElementById("cbt-verify-student");
        if (invigForm) invigForm.dataset.examId = examId;
        status("Selected " + (selected ? selected.title : "examination") + ". Enter a student's admission number and the teacher-issued PIN.");
      } else {
        await openExam(examButton.getAttribute("data-staff-exam"));
      }
    }
    if (event.target.id === "cbt-staff-refresh") load();

    if (event.target.id === "cbt-staff-schedule-pin" && selected) {
      var button = event.target;
      button.disabled = true;
      try {
        if (selected.status === "draft") {
          var scheduled = await call("staff.schedule_exam", { exam_id: selected.id });
          selected.status = scheduled.status;
          selected = Object.assign({}, selected, scheduled);
          data.exams = (data.exams || []).map(function (exam) {
            return exam.id === selected.id ? selected : exam;
          });
        }
        var pin = await call("staff.generate_pin", { exam_id: selected.id });
        var assignment = assignmentForExam(selected);
        var expiry = new Date(pin.expires_at).toLocaleString();
        lastPinMessage = "Darel Hikmah International Academy\nExamination: " + selected.title +
          "\nClass: " + (assignment ? assignment.class_name : "Assigned class") +
          "\nSubject: " + (assignment ? assignment.subject_name : "Assigned subject") +
          "\nExamination PIN: " + pin.pin +
          "\nExpires: " + expiry +
          "\nPlease use this PIN to authorize students. Students must also enter their student number and this PIN on the separate CBT portal.";
        document.getElementById("cbt-pin-value").textContent = pin.pin;
        document.getElementById("cbt-pin-expiry").textContent = "Expires: " + expiry;
        document.getElementById("cbt-pin-result").hidden = false;
        renderExams();
        renderExamActions();
        status("Examination PIN generated. Share it directly with the assigned invigilator.");
      } catch (error) {
        status(error.message, true);
      } finally {
        button.disabled = false;
      }
    }

    if (event.target.id === "cbt-pin-copy") {
      if (!lastPinMessage) return;
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        status("Copy is unavailable here. Select the PIN above and copy it manually.", true);
        return;
      }
      navigator.clipboard.writeText(lastPinMessage).then(function () {
        event.target.textContent = "Message copied";
        status("Invigilator message copied.");
      }).catch(function () {
        status("Could not copy automatically. Select the PIN and copy it manually.", true);
      });
    }

    if (event.target.id === "cbt-staff-close-exam" && selected) {
      event.target.disabled = true;
      try {
        await call("staff.close_exam", { exam_id: selected.id });
        await load();
        await openExam(selected.id);
        status("Examination closed. Review the automatically marked scores, then submit the review report to the administrator.");
      } catch (error) {
        status(error.message, true);
      } finally {
        event.target.disabled = false;
      }
    }
  });

  section.addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.target;
    try {
      if (form.id === "cbt-staff-create-exam") {
        var examData = new FormData(form);
        var assignmentIndex = Number(examData.get("assignment"));
        var assignment = (data.assignments || [])[assignmentIndex];
        if (!assignment) throw new Error("Choose one of your assigned subjects and classes.");
        var starts = new Date(String(examData.get("starts_at") || ""));
        var ends = new Date(String(examData.get("ends_at") || ""));
        if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime())) {
          throw new Error("Choose valid examination dates and times.");
        }
        var created = await call("staff.create_exam", {
          title: examData.get("title"),
          instructions: examData.get("instructions"),
          class_id: assignment.class_id,
          subject_id: assignment.subject_id,
          session_id: assignment.session_id,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          duration_minutes: Number(examData.get("duration_minutes"))
        });
        await load();
        await openExam(created.id);
        status("Draft examination created. Add your questions and correct answers below.");
      } else if (form.classList.contains("cbt-grade-form") && selected) {
        var grade = new FormData(form);
        var saved = await call("staff.grade_response", {
          attempt_id: grade.get("attempt_id"),
          question_id: grade.get("question_id"),
          score: Number(grade.get("score")),
          feedback: grade.get("feedback")
        });
        status(saved.complete
          ? "All written answers for this student's attempt are marked."
          : "Mark saved. Other written answers still need marking.");
        await loadManualReviews(selected.id);
      } else if (form.id === "cbt-staff-review-report" && selected) {
        var reportData = new FormData(form);
        var report = await call("staff.submit_review_report", {
          exam_id: selected.id, note: reportData.get("note")
        });
        document.getElementById("cbt-review-report-status").textContent =
          "Report submitted to the administrator at " + new Date(report.submitted_at).toLocaleString() + ".";
        form.querySelector('button[type="submit"]').disabled = true;
      } else if (form.id === "cbt-staff-add-question" && selected) {
        var questionData = new FormData(form);
        var type = String(questionData.get("question_type") || "mcq");
        var lines = String(questionData.get("options") || "").split(/\r?\n/)
          .map(function (line) { return line.trim(); }).filter(Boolean);
        var options = lines.map(function (label, index) {
          return { label: label, value: String.fromCharCode(65 + index) };
        });
        var answer = String(questionData.get("answer_key") || "").trim();
        if (type === "mcq") answer = answer.toUpperCase();
        if (type === "true_false") answer = answer.toLowerCase();
        await call("staff.save_question", {
          exam_id: selected.id,
          question_type: type,
          prompt: questionData.get("prompt"),
          position: Number(questionData.get("position")),
          marks: Number(questionData.get("marks")),
          options: options,
          answer_key: type === "short_answer" ? {} : answer
        });
        form.reset();
        form.elements.marks.value = "1";
        section.querySelector('[name="question_type"]').dispatchEvent(new Event("change", { bubbles: true }));
        await openExam(selected.id);
        status("Question saved. The correct answer is stored for automatic marking.");
      } else if (form.id === "cbt-verify-student") {
        if (!selected) throw new Error("Choose an examination first.");
        var verifyData = new FormData(form);
        var result = await call("invigilator.verify_student", {
          exam_id: selected.id,
          admission_no: verifyData.get("admission_no"),
          pin: verifyData.get("pin")
        });
        status("Student authorized: " + result.student.name + " (" + result.student.admission_no + ").");
        form.reset();
      }
    } catch (error) {
      status(error.message, true);
    }
  });

  section.addEventListener("change", function (event) {
    if (event.target.name !== "question_type") return;
    var type = event.target.value;
    var options = section.querySelector(".cbt-staff-mcq");
    var answer = document.getElementById("cbt-staff-answer-wrap");
    if (options) options.hidden = type !== "mcq";
    if (answer) {
      answer.hidden = type === "short_answer";
      var input = answer.querySelector("input");
      if (input) input.placeholder = type === "true_false" ? "True or False" : "A, B, C…";
    }
  });

  setScheduleDefaults();
  if (location.hash === "#cbt-staff-tools") load();
})();
