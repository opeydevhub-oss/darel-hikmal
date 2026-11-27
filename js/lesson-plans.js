/* Darel Hikmah lesson-plan workflow.
   Loaded after portal.js on the administrator and staff dashboards. */
(function () {
  "use strict";

  if (!window.PortalData || !window.PortalDashboard || !window.SupabaseClient) return;

  function getClient() {
    return window.SupabaseClient.getClient();
  }

  function esc(value) {
    return typeof window.portalEscape === "function"
      ? window.portalEscape(value == null ? "" : value)
      : String(value == null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
  }

  function sectionLabel(value) {
    return String(value || "").toLowerCase() === "basic" ? "Primary" : (value || "");
  }

  function dateLabel(value) {
    if (!value) return "—";
    var date = new Date(value + (String(value).length === 10 ? "T00:00:00" : ""));
    return isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function weekLabel(plan) {
    return dateLabel(plan.week_start) + " – " + dateLabel(plan.week_end);
  }

  function statusInfo(status) {
    var values = {
      draft: { label: "Draft", tone: "muted" },
      submitted: { label: "Pending review", tone: "due" },
      approved: { label: "Approved", tone: "ok" },
      revision_requested: { label: "Revision requested", tone: "late" }
    };
    return values[status] || { label: "Unknown", tone: "muted" };
  }

  function detailMarkup(label, value) {
    if (!value) return "";
    return '<div class="lesson-plan-detail"><strong>' + esc(label) +
      '</strong><p style="white-space:pre-wrap">' + esc(value) + "</p></div>";
  }

  function planDetailsMarkup(plan) {
    return '<div class="lesson-plan-details">' +
      detailMarkup("Topic", plan.topic) +
      detailMarkup("Subtopic", plan.subtopic) +
      detailMarkup("Learning objectives", plan.learning_objectives) +
      detailMarkup("Previous knowledge", plan.previous_knowledge) +
      detailMarkup("Instructional materials", plan.instructional_materials) +
      detailMarkup("Introduction", plan.introduction) +
      detailMarkup("Lesson development", plan.lesson_development) +
      detailMarkup("Teacher activities", plan.teacher_activities) +
      detailMarkup("Learner activities", plan.learner_activities) +
      detailMarkup("Evaluation", plan.evaluation) +
      detailMarkup("Assignment / homework", plan.assignment) +
      "</div>";
  }

  function addStaffLessonPlans(result) {
    var client = getClient();
    if (!client || !result || !result.data) return Promise.resolve(result);

    return client.auth.getUser().then(function (auth) {
      var user = auth && auth.data && auth.data.user;
      if (!user) return result;

      return Promise.all([
        client.from("staff").select("id").eq("profile_id", user.id).eq("status", "active").maybeSingle(),
        client.from("terms").select("id,name,session_id").eq("is_current", true).maybeSingle()
      ]).then(function (base) {
        var staff = base[0] && base[0].data;
        var term = base[1] && base[1].data;
        var panel = {
          id: "lesson-plans",
          title: "Lesson Notes & Plans",
          intro: "Prepare weekly lesson plans, save drafts and submit completed notes for administrator review.",
          kind: "lesson-plans-staff",
          lessonPlans: [],
          teachingOptions: [],
          termId: term ? term.id : null,
          sessionId: term ? term.session_id : null,
          termName: term ? term.name : "",
          error: null
        };

        if (base[0].error || base[1].error) {
          panel.error = (base[0].error || base[1].error).message || "Could not load lesson-plan information.";
          result.data.panels.push(panel);
          return result;
        }

        if (!staff) {
          panel.error = "Your active staff record could not be found. Please contact the school administrator.";
          result.data.panels.push(panel);
          return result;
        }

        var assignmentQuery = term && term.session_id
          ? client.from("teaching_assignments")
              .select("class_id,subject_id,classes!inner(id,name,level,arm),subjects(name)")
              .eq("staff_id", staff.id)
              .eq("session_id", term.session_id)
          : Promise.resolve({ data: [], error: null });

        return Promise.all([
          assignmentQuery,
          client.from("lesson_plans")
            .select("id,class_id,subject_id,week_start,week_end,plan_date,class_size,average_age,time_from,time_to,duration,lesson_stages,references_text,title,topic,subtopic,learning_objectives,previous_knowledge,instructional_materials,introduction,lesson_development,teacher_activities,learner_activities,evaluation,assignment,status,review_comment,created_at,class:classes(name,level),subject:subjects(name)")
            .eq("staff_id", staff.id)
            .order("created_at", { ascending: false })
        ]).then(function (data) {
          var failed = data.find(function (item) { return item && item.error; });
          if (failed) {
            panel.error = failed.error.message || "Could not load lesson plans.";
          } else {
            var assignments = data[0].data || [];
            var seenClasses = {};
            panel.teachingOptions = assignments.map(function (item) {
              return {
                class_id: item.class_id,
                class_name: item.classes ? item.classes.name : "Class",
                class_level: item.classes ? sectionLabel(item.classes.level) : "",
                arm: item.classes ? item.classes.arm : "",
                subject_id: item.subject_id,
                subject_name: item.subjects ? item.subjects.name : ""
              };
            });
            panel.classes = panel.teachingOptions.filter(function (item) {
              if (seenClasses[item.class_id]) return false;
              seenClasses[item.class_id] = true;
              return true;
            });
            panel.lessonPlans = data[1].data || [];
          }
          var count = panel.lessonPlans.length;
          result.data.stats.push({
            label: "My lesson plans",
            value: String(count),
            hint: count ? "saved in this account" : "none created yet",
            tone: count ? "good" : "muted"
          });
          result.data.panels.push(panel);
          return result;
        });
      });
    }).catch(function (error) {
      result.data.panels.push({
        id: "lesson-plans",
        title: "Lesson Notes & Plans",
        intro: "Prepare weekly lesson plans and submit them for review.",
        kind: "lesson-plans-staff",
        lessonPlans: [],
        teachingOptions: [],
        error: error.message || "Could not load lesson plans."
      });
      return result;
    });
  }

  function addAdminLessonPlans(result) {
    var client = getClient();
    if (!client || !result || !result.data) return Promise.resolve(result);

    return client.from("lesson_plans")
      .select("id,staff_id,class_id,subject_id,week_start,week_end,title,topic,subtopic,learning_objectives,previous_knowledge,instructional_materials,introduction,lesson_development,teacher_activities,learner_activities,evaluation,assignment,status,review_comment,reviewed_at,created_at,staff:staff!inner(full_name,staff_no),class:classes!inner(name,level,arm),subject:subjects(name),term:terms(name)")
      .order("created_at", { ascending: false })
      .then(function (response) {
        var plans = response.data || [];
        var panel = {
          id: "lesson-plan-review",
          title: "Lesson Plan Reviews",
          intro: "Review teacher submissions, approve completed plans or return them with clear feedback.",
          kind: "lesson-plans-admin",
          lessonPlans: plans,
          error: response.error ? (response.error.message || "Could not load lesson plans.") : null
        };
        var pending = plans.filter(function (plan) { return plan.status === "submitted"; }).length;
        result.data.stats.push({
          label: "Lesson plans to review",
          value: String(pending),
          hint: pending ? "awaiting your decision" : "none awaiting review",
          tone: pending ? "warn" : "muted"
        });
        result.data.panels.push(panel);
        return result;
      }).catch(function (error) {
        result.data.panels.push({
          id: "lesson-plan-review",
          title: "Lesson Plan Reviews",
          intro: "Review teacher submissions and provide feedback.",
          kind: "lesson-plans-admin",
          lessonPlans: [],
          error: error.message || "Could not load lesson plans."
        });
        return result;
      });
  }

  var originalStaffDashboard = window.PortalData.getStaffDashboard;
  window.PortalData.getStaffDashboard = function () {
    return originalStaffDashboard.call(window.PortalData).then(addStaffLessonPlans);
  };

  var originalAdminDashboard = window.PortalData.getAdminDashboard;
  window.PortalData.getAdminDashboard = function () {
    return originalAdminDashboard.call(window.PortalData).then(addAdminLessonPlans);
  };

  window.PortalData.createLessonPlan = function (payload) {
    var client = getClient();
    if (!client) return Promise.resolve({ data: null, error: { message: "The school database is unavailable." } });
    return client.from("lesson_plans").insert(payload).select("id,status").single();
  };

  window.PortalData.updateLessonPlan = function (id, payload) {
    var client = getClient();
    if (!client) return Promise.resolve({ data: null, error: { message: "The school database is unavailable." } });
    return client.from("lesson_plans").update(payload).eq("id", id).select("id,status").single();
  };

  window.PortalData.reviewLessonPlan = function (id, status, comment) {
    var client = getClient();
    if (!client) return Promise.resolve({ data: null, error: { message: "The school database is unavailable." } });
    return client.from("lesson_plans")
      .update({ status: status, review_comment: comment || null })
      .eq("id", id)
      .eq("status", "submitted")
      .select("id,status")
      .maybeSingle()
      .then(function (response) {
        if (response.error || response.data) return response;
        return { data: null, error: { message: "This submission has already changed. Refresh the dashboard and try again." } };
      });
  };

  function staffPanelMarkup(panel) {
    if (panel.error) return '<p class="notice notice--error">' + esc(panel.error) + "</p>";

    var html = '<div class="btn-row"><button class="btn btn--primary" type="button" data-lesson-plan-create' +
      (panel.termId && panel.teachingOptions.length ? "" : " disabled") +
      '>Create lesson plan</button></div>';

    if (panel.termName) {
      html += '<p class="muted mt-1">Current term: ' + esc(panel.termName) + "</p>";
    } else {
      html += '<p class="notice notice--warn mt-1">The administrator must set the current academic session and term before lesson plans can be submitted.</p>';
    }

    if (!panel.teachingOptions.length && !panel.lessonPlans.length) {
      html += '<div class="empty-state"><h3>No teaching assignments</h3><p>You need an active class and subject assignment before creating a lesson plan.</p></div>';
      return html;
    }

    if (!panel.lessonPlans.length) {
      html += '<div class="empty-state"><h3>No lesson plans yet</h3><p>Your saved drafts and submitted lesson plans will appear here.</p></div>';
      return html;
    }

    html += '<div class="record-list">';
    panel.lessonPlans.forEach(function (plan) {
      var status = statusInfo(plan.status);
      var className = plan.class ? plan.class.name : "Class";
      var level = plan.class ? sectionLabel(plan.class.level) : "";
      var subject = plan.subject ? plan.subject.name : "Integrated learning";
      html += '<article class="record">' +
        '<div class="record__top"><h3 class="record__title">' + esc(plan.title) + '</h3>' +
        '<span class="badge badge--' + status.tone + '">' + status.label + "</span></div>" +
        '<p class="record__meta">' + esc(className) + (level ? " · " + esc(level) : "") +
        " · " + esc(subject) + " · Week " + esc(weekLabel(plan)) + "</p>" +
        '<p><strong>Topic:</strong> ' + esc(plan.topic) + "</p>" +
        (plan.review_comment ? '<p class="notice notice--warn"><strong>Administrator feedback:</strong> ' + esc(plan.review_comment) + "</p>" : "") +
        '<details><summary>View lesson note</summary>' + planDetailsMarkup(plan) + "</details>" +
        (plan.status === "draft" || plan.status === "revision_requested"
          ? '<div class="btn-row mt-1"><button class="btn btn--small btn--outline-navy" type="button" data-lesson-plan-edit="' + esc(plan.id) + '">Edit lesson plan</button></div>'
          : "") +
        "</article>";
    });
    html += "</div>";
    return html;
  }

  function adminPanelMarkup(panel) {
    if (panel.error) return '<p class="notice notice--error">' + esc(panel.error) + "</p>";
    if (!panel.lessonPlans.length) {
      return '<div class="empty-state"><h3>No lesson plans submitted</h3><p>Teacher submissions will appear here when they are sent for review.</p></div>';
    }

    var html = '<div class="record-list">';
    panel.lessonPlans.forEach(function (plan) {
      var status = statusInfo(plan.status);
      var teacher = plan.staff ? plan.staff.full_name : "Staff member";
      var className = plan.class ? plan.class.name : "Class";
      var level = plan.class ? sectionLabel(plan.class.level) : "";
      var subject = plan.subject ? plan.subject.name : "Integrated learning";
      html += '<article class="record">' +
        '<div class="record__top"><h3 class="record__title">' + esc(plan.title) + '</h3>' +
        '<span class="badge badge--' + status.tone + '">' + status.label + "</span></div>" +
        '<p class="record__meta">' + esc(teacher) + " · " + esc(className) +
        (level ? " · " + esc(level) : "") + " · " + esc(subject) +
        " · Week " + esc(weekLabel(plan)) + "</p>" +
        '<p><strong>Topic:</strong> ' + esc(plan.topic) + "</p>" +
        '<details><summary>Read full lesson plan</summary>' + planDetailsMarkup(plan) + "</details>" +
        (plan.review_comment ? '<p class="notice notice--warn"><strong>Previous feedback:</strong> ' + esc(plan.review_comment) + "</p>" : "") +
        (plan.status === "submitted"
          ? '<form class="form-stack mt-1" data-lesson-plan-review-form data-plan-id="' + esc(plan.id) + '">' +
            '<label>Feedback for the teacher<textarea class="form-control" name="review_comment" rows="3" maxlength="2000" placeholder="Add guidance if changes are needed">' + esc(plan.review_comment || "") + '</textarea></label>' +
            '<div class="btn-row"><button class="btn btn--primary btn--small" type="button" data-plan-review="approved">Approve</button>' +
            '<button class="btn btn--outline-navy btn--small" type="button" data-plan-review="revision_requested">Request revision</button></div>' +
            "</form>"
          : "") +
        "</article>";
    });
    html += "</div>";
    return html;
  }

  function subjectOptions(panel, classId, selectedSubjectId) {
    var rows = panel.teachingOptions.filter(function (item) { return item.class_id === classId; });
    var hasGeneral = rows.some(function (item) { return !item.subject_id; });
    var seen = {};
    var html = '<option value="">Choose an assigned subject…</option>';
    if (hasGeneral) {
      html += '<option value="__general__"' + (!selectedSubjectId ? " selected" : "") + '>General / Integrated learning</option>';
    }
    rows.forEach(function (item) {
      if (!item.subject_id || seen[item.subject_id]) return;
      seen[item.subject_id] = true;
      html += '<option value="' + esc(item.subject_id) + '"' +
        (selectedSubjectId === item.subject_id ? " selected" : "") + ">" +
        esc(item.subject_name || "Subject") + "</option>";
    });
    return html;
  }

  function openLessonPlanEditor(dashboard, panel, record) {
    if (!panel.termId || !panel.sessionId) {
      window.alert("The administrator must set the current academic session and term first.");
      return;
    }

    var dialog = document.getElementById("lesson-plan-editor");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "lesson-plan-editor";
      dialog.className = "portal-editor-dialog";
      document.body.appendChild(dialog);
    }

    var classOptions = "";
    var seen = {};
    panel.teachingOptions.forEach(function (item) {
      if (seen[item.class_id]) return;
      seen[item.class_id] = true;
      var label = [item.class_name, item.class_level, item.arm].filter(Boolean).join(" · ");
      classOptions += '<option value="' + esc(item.class_id) + '"' +
        (record && record.class_id === item.class_id ? " selected" : "") + ">" + esc(label) + "</option>";
    });

    var classId = record ? record.class_id : (panel.teachingOptions[0] ? panel.teachingOptions[0].class_id : "");
    var subjectId = record ? record.subject_id : null;

    function inputField(label, name, type, value, required) {
      return '<label>' + label + '<input class="form-control" type="' + type + '" name="' + name + '"' +
        (required ? " required" : "") + ' value="' + esc(value || "") + '"></label>';
    }

    function textField(label, name, value, required, rows) {
      return '<label>' + label + '<textarea class="form-control" name="' + name + '" rows="' + (rows || 3) + '"' +
        (required ? " required" : "") + '>' + esc(value || "") + "</textarea></label>";
    }

    dialog.innerHTML = '<form id="lesson-plan-editor-form" class="form-stack" novalidate>' +
      '<div class="panel__head"><div><span class="eyebrow">Staff workspace</span><h2>' +
      (record ? "Edit lesson plan" : "Create lesson plan") +
      '</h2><p>Current term: ' + esc(panel.termName || "Not set") + '</p></div>' +
      '<button type="button" class="btn btn--ghost btn--small" data-plan-close>Close</button></div>' +
      '<div class="form-grid">' +
      inputField("Plan title", "title", "text", record && record.title, true) +
      inputField("Week starts", "week_start", "date", record && record.week_start, true) +
      inputField("Week ends", "week_end", "date", record && record.week_end, true) +
      '</div><label>Assigned class<select class="form-control" name="class_id" required>' + classOptions + '</select></label>' +
      '<label>Assigned subject<select class="form-control" name="subject_id" required>' +
      subjectOptions(panel, classId, subjectId) + "</select></label>" +
      textField("Topic", "topic", record && record.topic, true, 2) +
      textField("Subtopic", "subtopic", record && record.subtopic, false, 2) +
      textField("Learning objectives", "learning_objectives", record && record.learning_objectives, true, 3) +
      textField("Previous knowledge", "previous_knowledge", record && record.previous_knowledge, false, 2) +
      textField("Instructional materials", "instructional_materials", record && record.instructional_materials, false, 2) +
      textField("Introduction", "introduction", record && record.introduction, false, 3) +
      textField("Lesson development", "lesson_development", record && record.lesson_development, true, 4) +
      textField("Teacher activities", "teacher_activities", record && record.teacher_activities, false, 3) +
      textField("Learner activities", "learner_activities", record && record.learner_activities, false, 3) +
      textField("Evaluation", "evaluation", record && record.evaluation, false, 3) +
      textField("Assignment / homework", "assignment", record && record.assignment, false, 2) +
      '<p class="notice" data-plan-message role="status" aria-live="polite" hidden></p>' +
      '<div class="btn-row"><button class="btn btn--outline-navy" type="button" data-plan-save="draft">Save draft</button>' +
      '<button class="btn btn--primary" type="button" data-plan-save="submitted">Submit for review</button></div>' +
      "</form>";

    if (dialog.open) dialog.close();
    dialog.showModal();

    var form = dialog.querySelector("#lesson-plan-editor-form");
    var classSelect = form.querySelector('[name="class_id"]');
    var subjectSelect = form.querySelector('[name="subject_id"]');
    var message = form.querySelector("[data-plan-message]");

    dialog.querySelectorAll("[data-plan-close]").forEach(function (button) {
      button.addEventListener("click", function () { dialog.close(); });
    });

    classSelect.addEventListener("change", function () {
      subjectSelect.innerHTML = subjectOptions(panel, classSelect.value, null);
    });

    form.addEventListener("submit", function (event) { event.preventDefault(); });

    form.querySelectorAll("[data-plan-save]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!form.reportValidity()) return;
        var data = new FormData(form);
        var weekStart = String(data.get("week_start") || "");
        var weekEnd = String(data.get("week_end") || "");
        if (weekEnd < weekStart) {
          message.hidden = false;
          message.className = "notice notice--error";
          message.textContent = "The week end date must be on or after the start date.";
          return;
        }

        var payload = {
          class_id: data.get("class_id"),
          subject_id: data.get("subject_id") === "__general__" ? null : data.get("subject_id"),
          session_id: panel.sessionId,
          term_id: panel.termId,
          week_start: weekStart,
          week_end: weekEnd,
          title: String(data.get("title") || "").trim(),
          topic: String(data.get("topic") || "").trim(),
          subtopic: String(data.get("subtopic") || "").trim(),
          learning_objectives: String(data.get("learning_objectives") || "").trim(),
          previous_knowledge: String(data.get("previous_knowledge") || "").trim(),
          instructional_materials: String(data.get("instructional_materials") || "").trim(),
          introduction: String(data.get("introduction") || "").trim(),
          lesson_development: String(data.get("lesson_development") || "").trim(),
          teacher_activities: String(data.get("teacher_activities") || "").trim(),
          learner_activities: String(data.get("learner_activities") || "").trim(),
          evaluation: String(data.get("evaluation") || "").trim(),
          assignment: String(data.get("assignment") || "").trim(),
          status: button.getAttribute("data-plan-save")
        };

        form.querySelectorAll("button").forEach(function (item) { item.disabled = true; });
        message.hidden = false;
        message.className = "notice notice--info";
        message.textContent = payload.status === "submitted" ? "Submitting lesson plan…" : "Saving draft…";

        var request = record
          ? window.PortalData.updateLessonPlan(record.id, payload)
          : window.PortalData.createLessonPlan(payload);

        request.then(function (response) {
          if (response.error) throw new Error(response.error.message || "Could not save this lesson plan.");
          dialog.close();
          dashboard.refresh();
        }).catch(function (error) {
          message.className = "notice notice--error";
          message.textContent = error.message || "Could not save this lesson plan.";
          form.querySelectorAll("button").forEach(function (item) { item.disabled = false; });
        });
      });
    });
  }

  function wireLessonPlanPanel(dashboard) {
    var container = document.querySelector("[data-dash-panels]");
    if (!container || !dashboard.config) return;

    var staffPanel = (dashboard.config.panels || []).find(function (panel) {
      return panel.id === "lesson-plans";
    });

    if (staffPanel) {
      var createButton = container.querySelector("[data-lesson-plan-create]");
      if (createButton) {
        createButton.addEventListener("click", function () {
          openLessonPlanEditor(dashboard, staffPanel, null);
        });
      }

      container.querySelectorAll("[data-lesson-plan-edit]").forEach(function (button) {
        button.addEventListener("click", function () {
          var id = button.getAttribute("data-lesson-plan-edit");
          var record = staffPanel.lessonPlans.find(function (plan) { return plan.id === id; });
          if (record) openLessonPlanEditor(dashboard, staffPanel, record);
        });
      });
    }

    container.querySelectorAll("[data-lesson-plan-review-form]").forEach(function (form) {
      form.querySelectorAll("[data-plan-review]").forEach(function (button) {
        button.addEventListener("click", function () {
          var status = button.getAttribute("data-plan-review");
          var id = form.getAttribute("data-plan-id");
          var comment = form.querySelector('[name="review_comment"]').value.trim();
          if (status === "revision_requested" && !comment) {
            window.alert("Add a short comment explaining what the teacher should revise.");
            form.querySelector('[name="review_comment"]').focus();
            return;
          }
          form.querySelectorAll("button").forEach(function (item) { item.disabled = true; });
          window.PortalData.reviewLessonPlan(id, status, comment).then(function (response) {
            if (response.error) throw new Error(response.error.message || "Could not update this lesson plan.");
            dashboard.refresh();
          }).catch(function (error) {
            window.alert(error.message || "Could not update this lesson plan.");
            form.querySelectorAll("button").forEach(function (item) { item.disabled = false; });
          });
        });
      });
    });
  }

  var originalPanelBody = window.PortalDashboard.panelBody;
  window.PortalDashboard.panelBody = function (panel, forcedEmpty) {
    if (!forcedEmpty && panel.kind === "lesson-plans-staff") return staffPanelMarkup(panel);
    if (!forcedEmpty && panel.kind === "lesson-plans-admin") return adminPanelMarkup(panel);
    return originalPanelBody.call(this, panel, forcedEmpty);
  };

  var originalRenderPanels = window.PortalDashboard.renderPanels;
  window.PortalDashboard.renderPanels = function () {
    originalRenderPanels.call(this);
    wireLessonPlanPanel(this);
  };
})();