/* DAREL HIKMAH INTERNATIONAL ACADEMY
   Portal behaviour. Plain vanilla JavaScript, no libraries.

   What this file does
   1. PortalAuth  — real Supabase Auth (email + password) for every role.
   2. PortalDashboard — renders each dashboard from the config object
                       returned by PortalData (real Supabase reads). The
                       renderer never invents data: when the database is
                       empty it shows an empty state, on error it shows an
                       error state with a retry.
   3. Sign-in page — validates the form, signs in against Supabase, and
                       redirects to the dashboard that matches the role in
                       the authenticated user's profile.

   Authorization ALWAYS comes from the authenticated user's row in
   public.profiles, never from a URL parameter, HTML attribute, localStorage
   or a role picked on the sign-in screen. */

/* -------------------------------------------------------------- utils */
function portalEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function portalQuery(selector, scope) {
  return (scope || document).querySelector(selector);
}

function portalQueryAll(selector, scope) {
  return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
}

/* A small delay so a loading state is visible while a real request is in flight. */
function portalDelay(value, milliseconds) {
  return new Promise(function (resolve) {
    window.setTimeout(function () { resolve(value); }, milliseconds || 420);
  });
}

/* -------------------------------------------------------------- icons */
var PORTAL_ICONS = {
  record: '<path d="M5 3.5h9l5 5V20.5H5z"/><path d="M14 3.5v5h5"/><path d="M8 13h8M8 16.5h5"/>',
  attendance: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/><path d="m8.5 15 2 2 4.5-4.5"/>',
  results: '<path d="M4 19.5V11M9.5 19.5V5M15 19.5v-6M20.5 19.5V8"/>',
  assignments: '<path d="M5 4.5h9l5 5v11H5z"/><path d="M14 4.5v5h5"/><path d="M8.5 14.5h7M8.5 17.5h4"/>',
  announcements: '<path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l6 4.5V6L8 10.5H5.5A1.5 1.5 0 0 0 4 12z"/><path d="M17.5 9a4.5 4.5 0 0 1 0 6"/>',
  fees: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h3"/>',
  admissions: '<path d="M4 6h16v14H4z"/><path d="M8 3.5v3M16 3.5v3"/><path d="m9 14 2 2 4-4"/>',
  class: '<path d="M3 6.5 12 3.5l9 3-9 3z"/><path d="M7 8v5c0 1.5 2.2 2.5 5 2.5s5-1 5-2.5V8"/>',
  materials: '<path d="M4 5h6v14H4z"/><path d="M14 5h6v14h-6z"/><path d="M6 9h2M16 9h2"/>',
  pupils: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 8.5a2.5 2.5 0 1 1 0 5M17.5 19c0-2-.5-3.5-1.5-4.5"/>',
  staff: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
  activities: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>'
};

function portalIcon(name) {
  var path = PORTAL_ICONS[name] || PORTAL_ICONS.record;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + "</svg>";
}

/* Status tones for table badges (school policy, not per-pupil data). */
var PORTAL_STATUS_TONE = {
  "Present": "ok", "present": "ok", "Published": "ok", "Delivered": "ok",
  "Submitted": "ok", "Enrolled": "ok", "paid": "ok", "Active": "ok",
  "Part paid": "due", "Awaiting documents": "due", "Under review": "due",
  "Awaiting interview": "due", "late": "due", "pending": "due", "draft": "muted",
  "Not started": "due", "On request": "alert", "Outstanding": "late",
  "Absent": "late", "Overdue": "late", "Inactive": "muted"
};

function statusTone(value) {
  return PORTAL_STATUS_TONE[String(value)] || "muted";
}

function money(n) {
  if (n == null || n === "") { return ""; }
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN" }).format(Number(n)); }
  catch (e) { return String(n); }
}

function fmtDate(d) {
  if (!d) { return ""; }
  try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch (e) { return ""; }
}

/* --------------------------------------------------------- PortalAuth
   Real Supabase authentication for every role. Signs in with email +
   password, then reads the profile from the server to derive the role.
   Returns { data: { user, profile, role } | null, error }. */
var PortalAuth = (function () {
  function client() {
    return (typeof SupabaseClient !== "undefined" && SupabaseClient.isConfigured())
      ? SupabaseClient.getClient() : null;
  }

  return {
    isConnected: true,
    provider: "supabase",

    signIn: function (email, password) {
      var c = client();
      if (!c) {
        return Promise.resolve({ data: null, error: { message: "The school sign-in service is not available on this page." } });
      }
      if (!email || !password) {
        return Promise.resolve({ data: null, error: { message: "Enter your email address and password to continue." } });
      }
      return c.auth.signInWithPassword({ email: email, password: password })
        .then(function (authResponse) {
          if (authResponse.error) { return { data: null, error: authResponse.error }; }
          var user = authResponse.data && authResponse.data.user;
          if (!user || !user.id) { return { data: null, error: { message: "Sign-in did not return a user." } }; }

          return c.from("profiles")
            .select("id,email,full_name,role,is_active,created_at,updated_at")
            .eq("id", user.id)
            .maybeSingle()
            .then(function (profRes) {
              if (profRes.error) {
                c.auth.signOut();
                return { data: null, error: { message: "We could not verify your account. Please contact the school office." } };
              }
              var profile = profRes.data;
              if (!profile) {
                c.auth.signOut();
                return { data: null, error: { message: "No account profile is recorded for this address. Please contact the school office." } };
              }
              if (profile.is_active !== true) {
                c.auth.signOut();
                return { data: null, error: { message: "This account has been deactivated. Please contact the school office." } };
              }
              return { data: { user: user, profile: profile, role: profile.role }, error: null };
            });
        });
    },

    signOut: function () {
      var c = client();
      if (!c) { return Promise.resolve({ error: { message: "No sign-in service on this page." } }); }
      return c.auth.signOut().then(function () { return { error: null }; },
        function (err) { return { error: err }; });
    },

    getSession: function () {
      var c = client();
      if (!c) { return Promise.resolve({ data: null, error: { message: "Not configured." } }); }
      return c.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        if (!session) { return { data: null, error: null }; }
        return c.auth.getUser().then(function (u) {
          return { data: { session: session, user: (u && u.data && u.data.user) || null }, error: null };
        });
      });
    }
  };
})();

/* ---------------------------------------------------------- dashboard */
var PortalDashboard = {
  role: null,
  config: null,
  state: "data",
  activePanel: null,

  start: function () {
    var shell = portalQuery("[data-portal-dashboard]");
    if (!shell) { return; }

    this.role = shell.getAttribute("data-portal-dashboard");

    // Protected pages: verify the session + role server-side BEFORE fetching
    // any dashboard data. This uses the SAME shared client/Session as sign-in.
    if (typeof PortalSession !== "undefined") {
      PortalSession.protect().then(function (result) {
        if (!result || !result.allowed) { return; } // protect() already redirected
        PortalDashboard.load();
      });
    } else {
      PortalDashboard.load();
    }
  },

  
  load: function () {
    var self = this;
    var panels = portalQuery("[data-dash-panels]");
    if (!panels) { return; }

    panels.innerHTML = this.skeletonMarkup("Loading your dashboard…");

    PortalData.getDashboard(this.role)
      .then(function (response) {
        if (response.error) {
          self.renderError(
            panels,
            response.error.message || "Could not load the dashboard."
          );
          return;
        }

        self.config = response.data;
        self.renderSide();
        self.renderHeader();
        self.renderStats();
        self.renderPanels();

        var wanted = (window.location.hash || "").replace("#", "");
        if (wanted && self.panelById(wanted)) {
          self.activate(wanted, false);
        }
      })
      .catch(function () {
        self.renderError(
          panels,
          "The dashboard could not connect successfully. Check your connection and try again."
        );
      });
  },


  refresh: function () {
    this.config = null;
    this.load();
  },

  panelById: function (id) {
    if (!this.config) { return null; }
    return this.config.panels.filter(function (panel) { return panel.id === id; })[0] || null;
  },

  renderSide: function () {
    var nameEl = portalQuery("[data-dash-name]");
    var metaEl = portalQuery("[data-dash-meta]");
    var nav = portalQuery("[data-dash-nav]");

    if (!this.config) { return; }
    if (nameEl) { nameEl.textContent = this.config.person ? this.config.person.name : ""; }
    if (metaEl) { metaEl.textContent = this.config.person ? this.config.person.meta : ""; }

    if (!nav || !this.config.panels) { return; }
    nav.innerHTML = this.config.panels.map(function (panel) {
      return '<a class="dash__nav-link" href="#' + panel.id + '" data-dash-link="' + panel.id + '">' +
        portalIcon(panel.kind === "register" ? "attendance" : panel.id) +
        "<span>" + portalEscape(panel.title) + "</span></a>";
    }).join("");

    nav.addEventListener("click", function (event) {
      var link = event.target.closest("[data-dash-link]");
      if (!link) { return; }
      event.preventDefault();
      selfFromNav(PortalDashboard, link.getAttribute("data-dash-link"));
    });
  },

  renderHeader: function () {
    var heading = portalQuery("[data-dash-title]");
    var caption = portalQuery("[data-dash-term]");
    if (!this.config) { return; }
    if (heading) { heading.textContent = this.config.roleLabel || ""; }
    if (caption) {
      caption.textContent = (this.config.metaTerm || "") + " — " + (this.config.metaSession || "");
    }
  },

  renderStats: function () {
    var container = portalQuery("[data-dash-stats]");
    if (!container || !this.config) { return; }
    var stats = this.config.stats || [];
    container.innerHTML = stats.length
      ? stats.map(function (stat) {
          return '<div class="stat' + (stat.tone ? " stat--" + stat.tone : "") + '">' +
            '<span class="stat__label">' + portalEscape(stat.label) + "</span>" +
            '<span class="stat__value">' + portalEscape(stat.value) + "</span>" +
            '<span class="stat__hint">' + portalEscape(stat.hint) + "</span></div>";
        }).join("")
      : '<p class="muted">No dashboard statistics are available yet.</p>';
  },

  activate: function (id, moveFocus) {
    var panel = this.panelById(id);
    if (!panel) { return; }
    this.activePanel = id;
    this.markActive(id);

    var target = portalQuery("#panel-" + id);
    if (target) {
      var reduced = typeof REDUCED_MOTION !== "undefined" && REDUCED_MOTION.matches;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    if (window.location.hash !== "#" + id) {
      window.history.replaceState(null, "", "#" + id);
    }
    if (moveFocus && target) {
      var heading = portalQuery("h2", target);
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
  },

  markActive: function (id) {
    portalQueryAll("[data-dash-link]").forEach(function (link) {
      var isCurrent = link.getAttribute("data-dash-link") === id;
      link.classList.toggle("is-active", isCurrent);
      link.setAttribute("aria-current", isCurrent ? "true" : "false");
    });
  },

  skeletonMarkup: function (label) {
    var row =
      '<div class="skeleton-row">' +
      '<span class="skeleton skeleton--avatar"></span>' +
      '<span class="skeleton skeleton--title"></span>' +
      '<span class="skeleton skeleton--line"></span>' +
      '<span class="skeleton skeleton--short"></span>' +
      "</div>";
    return '<div class="panel" aria-busy="true"><p class="muted">' + portalEscape(label) + '</p>' +
      '<div class="skeleton-list">' + row + row + row + row + "</div></div>";
  },

  renderError: function (container, message) {
    container.innerHTML =
      '<div class="panel">' +
      '<div class="notice notice--error" role="alert">' + portalIcon("admissions") +
      "<div><h3>We could not load this information</h3><p>" +
      portalEscape(message) +
      "</p></div></div>" +
      '<div class="btn-row"><button class="btn btn--primary" type="button" data-dash-retry>Try again</button></div>' +
      "</div>";
    var retry = portalQuery("[data-dash-retry]", container);
    if (retry) { retry.addEventListener("click", function () { PortalDashboard.load(); }); }
  },

  renderPanels: function () {
    var self = this;
    var container = portalQuery("[data-dash-panels]");
    if (!container || !this.config) { return; }

    container.innerHTML = (this.config.panels || []).map(function (panel) {
      var actionsHtml = panel.actions && panel.actions.length
        ? '<div class="panel__actions">' + panel.actions.map(function (a) {
            return '<button class="btn btn--small btn--ghost" type="button" data-panel-action="' + a + '">' +
              portalIcon(a === "add" ? "pupils" : a === "edit" ? "record" : "admissions") + a + "</button>";
          }).join("") + "</div>"
        : "";
      return '<section class="panel" id="panel-' + panel.id + '" data-dash-panel="' + panel.id + '" ' +
        'aria-labelledby="heading-' + panel.id + '" tabindex="-1">' +
        '<div class="panel__head"><div>' +
        '<h2 id="heading-' + panel.id + '">' + portalEscape(panel.title) + "</h2>" +
        "<p>" + portalEscape(panel.intro) + "</p>" +
        "</div>" + actionsHtml + "</div>" +
        self.panelBody(panel, false) +
        "</section>";
    }).join("");

    portalQueryAll("[data-dash-panel]").forEach(function (section) {
      var panel = self.panelById(section.getAttribute("data-dash-panel"));
      if (panel && panel.kind === "register") { self.wireRegister(section, panel); }
    });

    // Wire table action buttons (admin CRUD).
    portalQueryAll("[data-panel-action]").forEach(function (button) {
      var panelId = button.closest("[data-dash-panel]").getAttribute("data-dash-panel");
      button.addEventListener("click", function () { self.startPanelAction(panelId, button.getAttribute("data-panel-action")); });
    });
  },

  panelBody: function (panel, forcedEmpty) {
    var emptyMessage = panel.emptyMessage || "There is nothing to show here yet.";

    if (forcedEmpty) { return this.emptyMarkup(emptyMessage); }

    if (panel.kind === "table") {
      var rows = panel.rows || [];
      return rows.length ? this.tableMarkup(panel, rows) : this.emptyMarkup(emptyMessage);
    }
    if (panel.kind === "records") {
      var records = panel.records || [];
      return records.length ? this.recordsMarkup(records) : this.emptyMarkup(emptyMessage);
    }
    if (panel.kind === "results") {
      return this.resultsMarkup(panel);
    }
    if (panel.kind === "register") {
      return this.registerMarkup(panel);
    }
    return this.emptyMarkup(emptyMessage);
  },

  emptyMarkup: function (message) {
    return '<div class="empty-state">' +
      '<span class="empty-state__icon">' + portalIcon("records") + "</span>" +
      "<h3>Nothing to show yet</h3><p>" + portalEscape(message) + "</p></div>";
  },

  tableMarkup: function (panel, rows) {
    var head = (panel.columns || []).map(function (column, index) {
      return "<th scope=\"col\" class=\"" + (index > 1 ? "wrap" : "") + "\">" + portalEscape(column) + "</th>";
    }).join("");

    var body = rows.map(function (row, rowIndex) {
      return "<tr data-table-row=\"" + rowIndex + "\">" + row.map(function (cell, index) {
        var first = index === 0 ? ' scope="row"' : "";
        var tone = statusTone(cell);
        var content = tone
          ? '<span class="badge badge--' + tone + '">' + portalEscape(cell) + "</span>"
          : portalEscape(cell);
        return "<td" + first + ' class="' + (index > 1 ? "wrap" : "") + '">' + content + "</td>";
      }).join("") + "</tr>";
    }).join("");

    return '<div class="table-wrap"><table class="table">' +
      "<caption>" + portalEscape(panel.caption || "Data") + "</caption>" +
      "<thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  },

  recordsMarkup: function (records) {
    return '<div class="record-list">' + records.map(function (record) {
      var badge = record.badge
        ? ' <span class="badge badge--' + (record.badge.tone || "muted") + '">' + portalEscape(record.badge.text) + "</span>"
        : "";
      var dot = record.isNew ? '<span class="dot-new"></span>' : "";
      return '<article class="record">' +
        '<div class="record__top"><h3 class="record__title">' + dot + portalEscape(record.title) + "</h3>" +
        badge + "</div>" +
        '<p class="record__meta">' + portalEscape(record.meta) + "</p>" +
        "<p>" + portalEscape(record.body) + "</p></article>";
    }).join("") + "</div>";
  },

  resultsMarkup: function (panel) {
    var subjects = panel.subjects || [];
    var gradeKey = panel.gradeKey || [];
    var results = panel.results || {};
    var emptyMessage = panel.emptyMessage || "No published results are available yet.";

    if (!subjects.length) {
      return this.emptyMarkup(emptyMessage);
    }

    var rows = subjects.map(function (subject) {
      var r = results[subject];
      if (r && r.status === "published") {
        var total = r.max_score ? (Number(r.score || 0) + Number(r.max_score || 0)) : "";
        var grade = r.grade || "—";
        var score = r.score != null ? r.score : "—";
        return "<tr><th scope=\"row\" class=\"wrap\">" + portalEscape(subject) + "</th>" +
          "<td>" + portalEscape(score) + "</td><td>" + portalEscape(r.max_score) + "</td>" +
          "<td>" + portalEscape(total) + "</td><td>" + portalEscape(grade) + "</td></tr>";
      }
      return "<tr><th scope=\"row\" class=\"wrap\">" + portalEscape(subject) + "</th>" +
        "<td>&mdash;</td><td>&mdash;</td><td>&mdash;</td><td>&mdash;</td></tr>";
    }).join("");

    var key = gradeKey.map(function (item) {
      return "<tr><th scope=\"row\">" + portalEscape(item.grade) + "</th>" +
        '<td class="wrap">' + portalEscape(item.meaning) + "</td></tr>";
    }).join("");

    return '<div class="notice notice--warn">' + portalIcon("results") +
      "<div><h3>Results</h3><p>" + portalEscape(panel.caption || "") + "</p></div></div>" +
      '<div class="table-wrap"><table class="table">' +
      "<caption>Report card — " + portalEscape(panel.metaTerm || "Current term") + "</caption>" +
      '<thead><tr><th scope="col" class="wrap">Subject</th><th scope="col">Continuous assessment</th>' +
      "<th scope=\"col\">Examination</th><th scope=\"col\">Total</th><th scope=\"col\">Grade</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      '<details class="mt-1"><summary>How grades are shown</summary>' +
      '<div class="table-wrap mt-1"><table class="table"><caption>Grade key (curriculum policy).</caption>' +
      "<thead><tr><th scope=\"col\">Grade</th><th scope=\"col\">Meaning</th></tr></thead><tbody>" + key + "</tbody></table></div></details>";
  },

  registerMarkup: function (panel) {
    var emptyMessage = panel.emptyMessage || "There is nothing to mark yet.";
    if (!panel.classes || !panel.classes.length) {
      return this.emptyMarkup(emptyMessage) +
        "<p class=\"mt-1 muted\">No classes are assigned to you.</p>";
    }
    return '<form data-register-form novalidate>' +
      '<div class="toolbar"><div><label for="register-class">Class</label>' +
      '<select class="filter-input" id="register-class">' +
      panel.classes.map(function (cl) {
        return '<option value="' + cl.id + '">' + portalEscape(cl.name + (cl.level ? " (" + cl.level + ")" : "")) + "</option>";
      }).join("") +
      "</select></div>" +
      '<div><label for="register-date">Date</label>' +
      '<input class="filter-input" type="date" id="register-date" value="' + new Date().toISOString().split("T")[0] + '"></div>' +
      "</div>" +
      '<div class="table-wrap"><table class="table"><caption>Register</caption>' +
      '<thead><tr><th scope="col">Roll no.</th><th scope="col">Pupil</th><th scope="col">Subject</th><th scope="col">Status</th></tr></thead>' +
      '<tbody data-register-body><tr><td colspan="4" class="muted">Choose a subject to load the register.</td></tr></tbody>' +
      "</table></div>" +
      '<div class="btn-row mt-1"><button class="btn btn--primary" type="submit">Save register</button></div>' +
      '<div class="notice mt-1" data-register-result hidden role="status"></div>' +
      "</form>";
  },

  wireRegister: function (section, panel) {
    var self = this;
    var form = portalQuery("[data-register-form]", section);
    var body = portalQuery("[data-register-body]", section);
    var result = portalQuery("[data-register-result]", section);
    if (!form || !body) { return; }

    var currentRows = [];

    function setBusy(busy) {
      if (form) { form.classList.toggle("is-busy", busy); }
      var btn = portalQuery("button[type=submit]", form);
      if (btn) { btn.disabled = busy; }
    }

    function renderRows() {
      body.innerHTML = currentRows.map(function (row, i) {
        return "<tr data-student=\"" + row.id + "\">" +
          "<td>" + portalEscape(row.admission_number || row.ref || i + 1) + "</td>" +
          "<td>" + portalEscape(row.full_name || row.name || "") + "</td>" +
          "<td><select class=\"filter-input\" data-att-status>" +
          "<option value=\"\">Not marked</option>" +
          "<option value=\"present\"" + (row.state === "present" ? " selected" : "") + ">Present</option>" +
          "<option value=\"absent\"" + (row.state === "absent" ? " selected" : "") + ">Absent</option>" +
          "<option value=\"late\"" + (row.state === "late" ? " selected" : "") + ">Late</option>" +
          "</select></td></tr>";
      }).join("");
    }

    function load() {
      var classId = form.elements.registerClass ? form.elements.registerClass.value : panel.classes[0].id;
      var date = form.elements.registerDate ? form.elements.registerDate.value : new Date().toISOString().split("T")[0];
      setBusy(true);
      PortalData.getClassStudents(classId).then(function (res) {
        if (res.error || !res.data) {
          currentRows = [];
          body.innerHTML = "<tr><td colspan=\"4\"><p class=\"muted\">No pupils found.</p></td></tr>";
          setBusy(false);
          return;
        }
        var students = res.data;
        PortalData.getAttendanceRows(classId, date).then(function (attRes) {
          var existing = {};
          (attRes.data || []).forEach(function (a) { existing[a.student_id] = a; });
          currentRows = students.map(function (s) {
            var a = existing[s.id];
            return { id: s.id, admission_number: s.admission_number, full_name: s.full_name, state: a ? a.status : "" };
          });
          renderRows();
          setBusy(false);
        });
      });
    }

    form.elements.registerClass.addEventListener("change", load);
    form.elements.registerDate.addEventListener("change", load);
    load();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setBusy(true);
      var date = form.elements.registerDate.value;
      var rows = portalQueryAll("[data-student]", section).map(function (tr) {
        var id = tr.getAttribute("data-student");
        var status = tr.querySelector("[data-att-status]").value;
        return { student_id: Number(id), session_date: date, subject_id: null, status: status };
      });

      PortalData.upsertAttendance(rows).then(function (res) {
        if (res.error) {
          if (result) {
            result.hidden = false;
            result.className = "notice notice--error";
            result.innerHTML = portalIcon("attendance") + "<div><h3>Could not save the register</h3><p>" + portalEscape(res.error.message || "Save failed.") + "</p></div>";
          }
          return;
        }
        if (result) {
          result.hidden = false;
          result.className = "notice notice--ok";
          result.innerHTML = portalIcon("attendance") + "<div><h3>Register saved</h3><p>The attendance marks have been recorded for " + fmtDate(date) + ".</p></div>";
        }
        load();
      });
    });
  },

  startPanelAction: function (panelId, action) {
    var self = this;
    if (action === "add") { self.openRowEditor(panelId, null); }
  },

  openRowEditor: function (panelId, row) {
    // Lightweight inline add/edit form for table panels (admin CRUD).
    var panel = this.panelById(panelId);
    if (!panel) { return; }
    var section = portalQuery("#panel-" + panelId);
    if (!section) { return; }

    var isNew = !row;
    var fields = this.editorFields(panel);
    var values = row ? row : {};
    var form = document.createElement("form");
    form.className = "editor-form";
    form.setAttribute("novalidate", "novalidate");
    form.innerHTML = fields.map(function (f) {
      var val = values[f.name] != null ? values[f.name] : "";
      var control;
      if (f.type === "select") {
        control = '<select class="form-control" name="' + f.name + '">' +
          f.options.map(function (o) {
            return '<option value="' + o.value + '"' + (o.value == val ? " selected" : "") + ">" + portalEscape(o.label) + "</option>";
          }).join("") + "</select>";
      } else {
        control = '<input class="form-control" type="' + (f.type || "text") + '" name="' + f.name + '" value="' + portalEscape(val) + '">';
      }
      return '<div class="form-row"><label for="' + f.name + '">' + portalEscape(f.label) + "</label>" + control +
        '<span class="form-field-error" role="alert"></span></div>';
    }).join("");
    form.innerHTML += '<div class="btn-row mt-1"><button class="btn btn--primary" type="submit">' + (isNew ? "Add" : "Save") + "</button>" +
      '<button class="btn btn--ghost" type="button" data-editor-cancel>Cancel</button></div>' +
      '<div class="notice mt-1" data-editor-result hidden role="status"></div>';

    var head = portalQuery(".panel__head", section);
    if (head) { head.parentNode.insertBefore(form, head.nextSibling); }

    form.querySelector("[data-editor-cancel]").addEventListener("click", function () {
      form.remove();
    });

    var entity = this.entityForPanel(panelId);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var payload = {};
      new FormData(form).forEach(function (v, k) { payload[k] = v; });
      var promise;
      if (isNew) {
        promise = PortalData["create" + entity](payload);
      } else {
        promise = PortalData["update" + entity](row.id, payload);
      }
      promise.then(function (res) {
        var result = form.querySelector("[data-editor-result]");
        if (res.error) {
          if (result) {
            result.hidden = false;
            result.className = "notice notice--error";
            result.innerHTML = portalIcon("admissions") + "<div><h3>Could not save</h3><p>" + portalEscape(res.error.message || "Save failed.") + "</p></div>";
          }
          return;
        }
        form.remove();
        PortalDashboard.refresh();
      });
    });
  },

  editorFields: function (panel) {
    // Field definitions per admin table. Columns[0] is the action column? No, columns are data columns.
    var map = {
      pupils: [
        { name: "admission_number", label: "Admission number" },
        { name: "full_name", label: "Pupil name" },
        { name: "gender", label: "Gender", type: "select", options: [
          { value: "", label: "—" }, { value: "male", label: "Male" }, { value: "female", label: "Female" } ] }
      ],
      staff: [
        { name: "staff_number", label: "Staff number" },
        { name: "full_name", label: "Name" },
        { name: "department", label: "Department" }
      ],
      classes: [
        { name: "name", label: "Class name" },
        { name: "level", label: "Level / year group" }
      ]
    };
    return map[panel.id] || [{ name: "name", label: "Name" }];
  },

  entityForPanel: function (panelId) {
    var map = { pupils: "Student", staff: "Staff", classes: "Class" };
    return map[panelId] || "Item";
  },

  refresh: function () {
    this.config = null;
    this.load();
  }
};

/* A small helper to keep `self` bound inside the nav click closure above. */
function selfFromNav(ctx, id) { ctx.activate(id, true); }

/* -------------------------------------------------------- sign-in page */

function setUpSignInForm() {
  var form = portalQuery("[data-signin-form]");
  if (!form) { return; }

  var result = portalQuery("[data-signin-result]");
  var emailField = form.elements.portalEmail;
  var passwordField = form.elements.portalPassword;

  // The password field is enabled now (real sign-in). Hide the old
  // "password closed" hint.
  if (passwordField) {
    passwordField.disabled = false;
    passwordField.closest(".form-field--disabled") &&
      passwordField.closest(".form-field--disabled").classList.remove("form-field--disabled");
  }

  // The role picker is intentionally NOT consulted for authorization. It is
  // removed from the markup; sign-in is email + password for everyone and the
  // destination is chosen from the profile role by the server.
  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var email = emailField ? (emailField.value || "").trim() : "";
    var password = passwordField ? passwordField.value : "";
    var firstInvalid = null;

    portalQueryAll(".form-row", form).forEach(function (row) {
      row.classList.remove("has-error");
      var text = portalQuery(".form-field-error", row);
      if (text) { text.textContent = ""; }
    });

    if (!email) {
      if (emailField) {
        emailField.closest(".form-row").classList.add("has-error");
        portalQuery(".form-field-error", emailField.closest(".form-row")).textContent = "Enter your email address to continue.";
        firstInvalid = emailField;
      }
    } else if (email.indexOf("@") === -1) {
      if (emailField) {
        emailField.closest(".form-row").classList.add("has-error");
        portalQuery(".form-field-error", emailField.closest(".form-row")).textContent = "Enter a valid email address.";
        firstInvalid = emailField;
      }
    }

    if (!password) {
      if (passwordField) {
        passwordField.closest(".form-row").classList.add("has-error");
        portalQuery(".form-field-error", passwordField.closest(".form-row")).textContent = "Enter your password to continue.";
        firstInvalid = passwordField;
      }
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    if (result) {
      result.hidden = false;
      result.className = "notice notice--info";
      result.innerHTML = portalIcon("admissions") + "<div><h3>Signing in…</h3><p>Your details are being checked against the school sign-in service.</p></div>";
    }

    PortalAuth.signIn(email, password).then(function (response) {
      if (response.error) {
        if (result) {
          result.hidden = false;
          result.className = "notice notice--error";
          result.innerHTML = portalIcon("admissions") +
            "<div><h3>Could not sign in</h3><p>" + portalEscape(response.error.message || "Sign-in failed.") + "</p></div>";
        }
        return;
      }
      var role = response.data && response.data.role;
      var target = role ? "portal-" + role + ".html" : "portal.html";
      if (!/^portal-(student|parent|staff|admin)\.html$/.test(target)) {
        if (result) {
          result.hidden = false;
          result.className = "notice notice--error";
          result.textContent = "Your account has an invalid portal role. Please contact the school office.";
        }
        return;
      }
      window.location.href = target;
    }).catch(function () {
      if (result) {
        result.hidden = false;
        result.className = "notice notice--error";
        result.innerHTML = portalIcon("admissions") +
          "<div><h3>Sign-in service unavailable</h3><p>We could not reach the school sign-in service. Check your connection and try again.</p></div>";
      }
    });
  });
}

/* ----------------------------------------------------------------- start */
document.addEventListener("DOMContentLoaded", function () {
  setUpSignInForm();

  if (portalQuery("[data-portal-dashboard]")) {
    if (typeof PortalSession !== "undefined") {
      PortalSession.protect().then(function (result) {
        if (result && result.allowed) {
          PortalDashboard.start();
        }
      });
    } else {
      PortalDashboard.start();
    }
  }

  portalQueryAll("[data-portal-sign-out]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (typeof PortalSession !== "undefined") {
        PortalSession.signOut();
      } else if (typeof PortalAuth !== "undefined") {
        PortalAuth.signOut().then(function () { window.location.href = "portal-login.html"; });
      } else {
        window.location.href = "portal-login.html";
      }
    });
  });
});
