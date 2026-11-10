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
      var loginEmail = email.indexOf("@") === -1
        ? "dhia-" + email.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "@students.darelhikmah.school"
        : email;
      return c.auth.signInWithPassword({ email: loginEmail, password: password })
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
        } else if (self.config.panels && self.config.panels.length) {
          self.activate(self.config.panels[0].id, false);
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
    if (this.role === "admin" && (id === "cbt-administration" || id === "academic-sessions")) {
      return { id: id, title: id === "academic-sessions" ? "Academic sessions" : "CBT Management" };
    }
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
    var menuItems = this.config.panels.slice();
    if (this.role === "admin") {
      menuItems.push({ id: "academic-sessions", title: "Academic sessions", kind: "academic-sessions" });
      menuItems.push({ id: "cbt-administration", title: "CBT Management", kind: "cbt" });
    }
    nav.innerHTML = menuItems.map(function (panel) {
      return '<a class="dash__nav-link" href="#' + panel.id + '" data-dash-link="' + panel.id + '">' +
        portalIcon(panel.kind === "register" ? "attendance" : panel.id) +
        "<span>" + portalEscape(panel.title) + "</span></a>";
    }).join("");

    var toggle = portalQuery("[data-dash-menu-toggle]");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        nav.hidden = !open;
      });
    }

    nav.addEventListener("click", function (event) {
      var link = event.target.closest("[data-dash-link]");
      if (!link) { return; }
      event.preventDefault();
      nav.hidden = true;
      if (toggle) toggle.setAttribute("aria-expanded", "false");
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

    portalQueryAll("[data-dash-panel]").forEach(function (section) {
      section.hidden = section.getAttribute("data-dash-panel") !== id;
    });
    var cbtPanel = portalQuery("#cbt-admin-panel");
    if (cbtPanel) cbtPanel.hidden = id !== "cbt-administration";
    var academicPanel = portalQuery("#panel-academic-sessions");
    if (academicPanel) academicPanel.hidden = id !== "academic-sessions";

    var target = id === "cbt-administration" ? cbtPanel : portalQuery("#panel-" + id);
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

    portalQueryAll("[data-enrolment-form]", container).forEach(function (form) {
      var panel = self.panelById(form.closest("[data-dash-panel]").getAttribute("data-dash-panel"));
      self.wireEnrolment(form, panel);
    });

    if (this.role === "admin") {
      container.insertAdjacentHTML("beforeend", self.academicSessionsMarkup());
      self.loadAcademicSessions();
    }

    portalQueryAll("[data-dash-panel]").forEach(function (section) {
      var panel = self.panelById(section.getAttribute("data-dash-panel"));
      if (panel && panel.kind === "register") { self.wireRegister(section, panel); }
    });

    // Wire table action buttons (admin CRUD).
    var academicForm = portalQuery("#academic-session-form");
    if (academicForm) {
      academicForm.addEventListener("submit", function (event) {
        event.preventDefault();
        self.saveAcademicSession(new FormData(academicForm));
      });
    }

    portalQueryAll("[data-panel-action]").forEach(function (button) {
      var panelId = button.closest("[data-dash-panel]").getAttribute("data-dash-panel");
      button.addEventListener("click", function () {
        if (panelId === "classes" && button.getAttribute("data-panel-action") === "add") {
          self.openClassEditor(null);
        } else if (typeof self.startPanelAction === "function") {
          self.startPanelAction(panelId, button.getAttribute("data-panel-action"));
        }
      });
    });
    portalQueryAll("[data-record-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        self.openRecordEditor(button.getAttribute("data-record-edit"), button.getAttribute("data-record-id"));
      });
    });
    portalQueryAll("[data-class-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        self.openClassEditor(button.getAttribute("data-class-edit"));
      });
    });
    portalQueryAll("[data-class-delete]").forEach(function (button) {
      button.addEventListener("click", function () {
        var classId = button.getAttribute("data-class-delete");
        var record = (self.config.adminClasses || []).find(function (item) { return item.id === classId; });
        if (!record || !window.confirm('Delete ' + record.name + '? Classes with linked school or examination records cannot be deleted.')) return;
        button.disabled = true;
        PortalData.deleteClass(classId).then(function (result) {
          if (result.error) throw new Error(result.error.message || "Could not delete this class.");
          self.refresh();
        }).catch(function (error) {
          button.disabled = false;
          window.alert(error.message || "This class could not be deleted. Check whether it has linked records.");
        });
      });
    });
  },

  academicSessionsMarkup: function () {
    return '<section class="panel academic-session-panel" id="panel-academic-sessions" data-dash-panel="academic-sessions" hidden aria-labelledby="heading-academic-sessions" tabindex="-1">' +
      '<div class="panel__head"><div><span class="eyebrow">School calendar</span><h2 id="heading-academic-sessions">Academic sessions</h2><p>Create the school year and select its current term. This unlocks class and teacher allocations.</p></div></div>' +
      '<form id="academic-session-form" class="form-stack">' +
      '<label>Academic year<input class="form-control" name="name" placeholder="e.g. 2026/2027" required maxlength="30"></label>' +
      '<div class="form-grid"><label>Academic year starts<input class="form-control" type="date" name="start_date" required></label><label>Academic year ends<input class="form-control" type="date" name="end_date" required></label></div>' +
      '<label>Current term<select class="form-control" name="term_name" required><option value="First Term">First Term</option><option value="Second Term">Second Term</option><option value="Third Term">Third Term</option></select></label>' +
      '<div class="form-grid"><label>Term starts<input class="form-control" type="date" name="term_start_date" required></label><label>Term ends<input class="form-control" type="date" name="term_end_date" required></label></div>' +
      '<p class="muted">Choose the dates using your phone calendar. Saving makes this the active academic session and term.</p>' +
      '<p class="notice notice--warn" data-session-message role="status" aria-live="polite">No academic session has been set yet.</p>' +
      '<button class="btn btn--primary" type="submit" data-session-save>Save and activate session</button></form>' +
      '<div class="academic-session-history"><h3>Saved academic sessions</h3><div data-session-list><p class="muted">Loading sessions…</p></div></div></section>';
  },

  loadAcademicSessions: function () {
    var list = portalQuery("[data-session-list]");
    var message = portalQuery("[data-session-message]");
    if (!list || !window.PortalData) return;
    Promise.all([PortalData.getAcademicSessions(), PortalData.getAcademicTerms()])
      .then(function (results) {
        var failed = results.find(function (item) { return item.error; });
        if (failed) throw new Error(failed.error.message || "Could not load academic sessions.");
        var sessions = results[0].data || [];
        var terms = results[1].data || [];
        var currentTerm = terms.find(function (term) { return term.is_current; });
        var currentSession = sessions.find(function (session) { return session.is_current; });
        if (message) {
          message.textContent = currentSession
            ? "Current session: " + currentSession.name + (currentTerm ? " · " + currentTerm.name : " · No current term")
            : "No academic session has been set yet.";
          message.className = currentSession ? "notice notice--success" : "notice notice--warn";
        }
        list.innerHTML = sessions.length ? '<ul class="academic-session-list">' + sessions.map(function (session) {
          var term = terms.find(function (item) { return item.session_id === session.id && item.is_current; });
          return '<li><strong>' + portalEscape(session.name) + '</strong><span>' + portalEscape(session.start_date) + ' to ' + portalEscape(session.end_date) + '</span><span>' + (session.is_current ? '<b>Current</b>' : 'Previous') + (term ? ' · ' + portalEscape(term.name) : '') + '</span></li>';
        }).join("") + '</ul>' : '<p class="muted">No saved academic sessions yet.</p>';
      })
      .catch(function (error) {
        list.innerHTML = '<p class="notice notice--error">' + portalEscape(error.message) + '</p>';
      });
  },

  saveAcademicSession: function (formData) {
    var self = this;
    var payload = {
      name: String(formData.get("name") || "").trim(),
      start_date: String(formData.get("start_date") || ""),
      end_date: String(formData.get("end_date") || ""),
      term_name: String(formData.get("term_name") || "First Term"),
      term_start_date: String(formData.get("term_start_date") || ""),
      term_end_date: String(formData.get("term_end_date") || "")
    };
    var message = portalQuery("[data-session-message]");
    var button = portalQuery("[data-session-save]");
    if (!payload.name || !payload.start_date || !payload.end_date || !payload.term_start_date || !payload.term_end_date ||
        payload.end_date < payload.start_date || payload.term_start_date < payload.start_date ||
        payload.term_end_date > payload.end_date || payload.term_end_date < payload.term_start_date) {
      if (message) { message.textContent = "Enter an academic year and valid start and end dates."; message.className = "notice notice--error"; }
      return;
    }
    button.disabled = true;
    button.textContent = "Saving…";
    if (message) { message.textContent = "Saving the academic session…"; message.className = "notice"; }
    PortalData.activateAcademicSession(payload).then(function (result) {
      if (result.error) throw new Error(result.error.message || "Could not save academic session.");
      if (message) { message.textContent = "Academic session and current term saved. Class and teacher assignments are now enabled."; message.className = "notice notice--success"; }
      self.refresh();
      self.loadAcademicSessions();
    }).catch(function (error) {
      if (message) { message.textContent = error.message || "Could not save the academic session."; message.className = "notice notice--error"; }
    }).finally(function () {
      button.disabled = false;
      button.textContent = "Save and activate session";
    });
  },

  openRecordEditor: function (kind, id) {
    var record = kind === "pupils"
      ? (this.config.adminStudents || []).find(function (item) { return item.id === id; })
      : (this.config.adminStaff || []).find(function (item) { return item.id === id; });
    if (!record) { this.refresh(); return; }
    var dialog = document.getElementById("portal-record-editor");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "portal-record-editor";
      dialog.className = "portal-editor-dialog";
      document.body.appendChild(dialog);
    }
    var fields = kind === "pupils"
      ? [["admission_no","Admission number","text",true],["first_name","First name","text",true],["last_name","Last name","text",true],["date_of_birth","Date of birth","date",false],["gender","Gender","gender",false],["class_id","Current class","class",false],["status","Status","status",true]]
      : [["staff_no","Staff number","text",true],["full_name","Full name","text",true],["job_title","Job title","text",false],["status","Status","status",true]];
    var html = '<form id="portal-record-editor-form" class="form-stack" data-kind="' + kind + '" data-id="' + portalEscape(id) + '">' +
      '<div class="panel__head"><div><span class="eyebrow">School records</span><h2>Edit ' + (kind === "pupils" ? "student" : "staff") +
      ' record</h2></div><button type="button" class="btn btn--ghost btn--small" data-editor-close>Close</button></div>';
    fields.forEach(function (field) {
      var value = record[field[0]] == null ? "" : String(record[field[0]]);
      html += '<label>' + field[1];
      if (field[2] === "class") {
        var currentEnrolment = (this.config.adminEnrolments || []).find(function (item) { return item.student_id === id; });
        value = currentEnrolment ? currentEnrolment.class_id : "";
        html += '<select class="form-control" name="class_id"><option value="">Unassigned</option>' +
          (this.config.adminClasses || []).map(function (item) {
            var label = [item.name, item.level, item.arm].filter(Boolean).join(" · ");
            return '<option value="' + portalEscape(item.id) + '"' + (value === item.id ? " selected" : "") + '>' + portalEscape(label) + '</option>';
          }).join("") + '</select>';
      } else if (field[2] === "gender") {
        html += '<select class="form-control" name="' + field[0] + '"><option value="">Not recorded</option>' +
          ["Female","Male","Other"].map(function (v) { return '<option value="' + v + '"' + (value.toLowerCase() === v.toLowerCase() ? " selected" : "") + '>' + v + '</option>'; }).join("") + '</select>';
      } else if (field[2] === "status") {
        html += '<select class="form-control" name="' + field[0] + '" required>' +
          (kind === "pupils" ? ["active","graduated","withdrawn","suspended"] : ["active","inactive"]).map(function (v) { return '<option value="' + v + '"' + (value.toLowerCase() === v ? " selected" : "") + '>' + v.charAt(0).toUpperCase() + v.slice(1) + '</option>'; }).join("") + '</select>';
      } else {
        html += '<input class="form-control" type="' + field[2] + '" name="' + field[0] + '"' +
          (field[3] ? " required" : "") + ' value="' + portalEscape(value) + '">';
      }
      html += '</label>';
    });
    html += '<p class="muted" data-editor-message role="status"></p><div class="btn-row"><button class="btn btn--primary" type="submit">Save changes</button><button class="btn btn--outline-navy" type="button" data-editor-close>Cancel</button></div></form>';
    dialog.innerHTML = html;
    if (!dialog.open) dialog.showModal();
    dialog.querySelectorAll("[data-editor-close]").forEach(function (button) {
      button.addEventListener("click", function () { dialog.close(); });
    });
    var self = this;
    dialog.querySelector("form").addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var message = form.querySelector("[data-editor-message]");
      var submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      message.textContent = "Saving changes…";
      var payload = Object.fromEntries(new FormData(form).entries());
      if (kind === "pupils" && !payload.date_of_birth) payload.date_of_birth = null;
      var request = kind === "pupils" ? PortalData.updateStudent(id, payload) : PortalData.updateStaff(id, payload);
      request.then(function (result) {
        if (result.error) throw new Error(result.error.message || "Could not save this record.");
        message.textContent = "Changes saved.";
        dialog.close();
        self.refresh();
      }).catch(function (error) {
        message.textContent = error.message || "Could not save this record.";
        submit.disabled = false;
      });
    });
  },

  openClassEditor: function (classId) {
    var self = this;
    var isEdit = Boolean(classId);
    var classRecord = isEdit
      ? (this.config.adminClasses || []).find(function (item) { return item.id === classId; })
      : { name: "", level: "", arm: "" };
    if (!classRecord) { this.refresh(); return; }

    var dialog = document.getElementById("portal-class-editor");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "portal-class-editor";
      dialog.className = "portal-editor-dialog portal-class-editor";
      document.body.appendChild(dialog);
    }

    var assignedStudents = (this.config.adminEnrolments || [])
      .filter(function (item) { return item.class_id === classId; })
      .map(function (item) { return item.student_id; });
    var assignments = (this.config.adminTeachingAssignments || [])
      .filter(function (item) { return item.class_id === classId; });
    var staffList = (this.config.adminStaff || []).filter(function (item) { return item.status === "active"; });
    var students = (this.config.adminStudents || []).filter(function (item) { return item.status === "active"; });
    var subjects = this.config.adminSubjects || [];
    var standardLevels = ["Junior Secondary", "Senior Secondary"];
    if (classRecord.level && standardLevels.indexOf(classRecord.level) === -1) {
      standardLevels.unshift(classRecord.level);
    }

    var html = '<form id="portal-class-editor-form" class="form-stack" novalidate>' +
      '<div class="panel__head"><div><span class="eyebrow">Class management</span><h2>' +
      (isEdit ? "Edit class and allocations" : "Create class and allocations") +
      '</h2><p>Choose existing pupils and assign teachers to subjects.</p></div>' +
      '<button type="button" class="btn btn--ghost btn--small" data-class-close>Close</button></div>' +
      '<label>Class name<input class="form-control" name="name" required maxlength="80" value="' + portalEscape(classRecord.name || "") + '"></label>' +
      '<label>School section<select class="form-control" name="level" required><option value="">Choose a school section…</option>' +
      standardLevels.map(function (level) { return '<option value="' + portalEscape(level) + '"' + (classRecord.level === level ? " selected" : "") + '>' + portalEscape(level) + '</option>'; }).join("") +
      '</select></label>' +
      '<label>Arm (optional)<input class="form-control" name="arm" maxlength="40" value="' + portalEscape(classRecord.arm || "") + '"></label>' +
      '<section class="class-editor-section"><h3>Existing students</h3><p class="muted">Tick every student who belongs to this class for the current academic session.</p>' +
      (students.length ? '<div class="class-editor-list">' + students.map(function (student) {
        var name = [student.first_name, student.last_name].filter(Boolean).join(" ");
        return '<label class="class-editor-choice"><input type="checkbox" name="student_ids" value="' + portalEscape(student.id) + '"' +
          (assignedStudents.indexOf(student.id) !== -1 ? " checked" : "") + '><span><strong>' + portalEscape(name) +
          '</strong><small>' + portalEscape(student.admission_no || "No admission number") + '</small></span></label>';
      }).join("") + '</div>' : '<p class="muted">No active student records are available.</p>') +
      '</section><section class="class-editor-section"><h3>Teachers and subjects</h3>' +
      '<p class="muted">Add the subjects the school offers, then select each teacher and their subjects. You can designate one class teacher.</p>' +
      '<div class="class-subject-add"><label for="class-new-subject">Add a subject</label><div class="class-subject-add__row"><input class="form-control" id="class-new-subject" maxlength="80" placeholder="e.g. Mathematics"><button type="button" class="btn btn--outline-navy btn--small" data-add-subject>Add subject</button></div><p class="muted" data-subject-message role="status"></p></div>' +
      (staffList.length ? '<div class="class-editor-list">' + staffList.map(function (staff) {
        var staffAssignments = assignments.filter(function (item) { return item.staff_id === staff.id; });
        var assignedSubjectIds = staffAssignments.map(function (item) { return item.subject_id; });
        var isClassTeacher = staffAssignments.some(function (item) { return item.is_class_teacher; });
        return '<fieldset class="class-editor-teacher"><legend>' + portalEscape(staff.full_name) + ' · ' + portalEscape(staff.staff_no) + '</legend>' +
          '<label class="class-editor-choice class-editor-lead"><input type="checkbox" name="class_teacher" value="' + portalEscape(staff.id) + '"' +
          (isClassTeacher ? " checked" : "") + '><span>Designate as class teacher</span></label>' +
          '<div class="class-editor-subjects">' + subjects.map(function (subject) {
            return '<label class="class-editor-choice"><input type="checkbox" name="teacher_subject" value="' + portalEscape(staff.id + "|" + subject.id) + '"' +
              (assignedSubjectIds.indexOf(subject.id) !== -1 ? " checked" : "") + '><span>' + portalEscape(subject.name) + '</span></label>';
          }).join("") + '</div></fieldset>';
      }).join("") + '</div>' : '<p class="muted">Add active staff before assigning teachers.</p>') +
      '</section>' +
      (this.config.adminSessionId ? '<p class="muted">Assignments apply to the current academic session.</p>' :
        '<p class="notice notice--warn">No current academic session is set. You can save class details, but cannot assign students or teachers yet.</p>') +
      '<p class="notice" data-class-message role="status" aria-live="polite" hidden></p><div class="btn-row">' +
      '<button class="btn btn--primary" type="submit">Save class and allocations</button>' +
      '<button class="btn btn--outline-navy" type="button" data-class-close>Cancel</button></div></form>';

    dialog.innerHTML = html;
    if (!dialog.open) dialog.showModal();
    var classNameInput = dialog.querySelector('input[name="name"]');
    classNameInput.setAttribute("autocomplete", "off");
    dialog.querySelectorAll("[data-class-close]").forEach(function (button) {
      button.addEventListener("click", function () { dialog.close(); });
    });

    var addSubjectButton = dialog.querySelector("[data-add-subject]");
    addSubjectButton.addEventListener("click", function () {
      var input = dialog.querySelector("#class-new-subject");
      var status = dialog.querySelector("[data-subject-message]");
      var subjectName = input.value.trim();
      if (!subjectName) { status.textContent = "Enter a subject name first."; input.focus(); return; }
      if (subjects.some(function (subject) { return subject.name.toLowerCase() === subjectName.toLowerCase(); })) {
        status.textContent = "That subject already exists.";
        return;
      }
      var baseCode = subjectName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "SUBJECT";
      var code = baseCode;
      var suffix = 2;
      while (subjects.some(function (subject) { return subject.code === code; })) {
        code = baseCode.slice(0, 7) + suffix;
        suffix += 1;
      }
      addSubjectButton.disabled = true;
      status.textContent = "Saving subject…";
      PortalData.createSubject({ name: subjectName, code: code, is_active: true }).then(function (result) {
        if (result.error || !result.data) throw new Error(result.error ? result.error.message : "Could not create the subject.");
        var created = result.data;
        subjects.push(created);
        self.config.adminSubjects = subjects;
        dialog.querySelectorAll(".class-editor-subjects").forEach(function (list) {
          var staffId = list.closest(".class-editor-teacher").querySelector('input[name="class_teacher"]').value;
          var label = document.createElement("label");
          label.className = "class-editor-choice";
          var checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.name = "teacher_subject";
          checkbox.value = staffId + "|" + created.id;
          var text = document.createElement("span");
          text.textContent = created.name;
          label.append(checkbox, text);
          list.appendChild(label);
        });
        input.value = "";
        status.textContent = "Subject added. It is now available for teacher assignments and CBT exams.";
        window.dispatchEvent(new Event("school:subjects-updated"));
      }).catch(function (error) {
        status.textContent = error.message || "Could not add the subject.";
      }).finally(function () {
        addSubjectButton.disabled = false;
      });
    });

    dialog.querySelector("form").addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var message = form.querySelector("[data-class-message]");
      var submit = form.querySelector('[type="submit"]');
      var formData = new FormData(form);
      function showClassMessage(text, tone) {
        message.hidden = false;
        message.className = "notice notice--" + tone;
        message.textContent = text;
        message.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      var className = String(formData.get("name") || "").trim();
      var classLevel = String(formData.get("level") || "").trim();
      if (!className || !classLevel) {
        showClassMessage(!className ? "Enter a class name." : "Choose a class level before saving.", "error");
        form.querySelector(!className ? '[name="name"]' : '[name="level"]').focus();
        return;
      }
      var teacherSubjects = formData.getAll("teacher_subject");
      var classTeachers = formData.getAll("class_teacher");
      var classTeacherIds = new Set(classTeachers);
      var teacherAssignments = teacherSubjects.map(function (value) {
        var parts = String(value).split("|");
        return { staff_id: parts[0], subject_id: parts[1], is_class_teacher: classTeacherIds.has(parts[0]) };
      });
      var hasInvalidClassTeacher = classTeachers.some(function (staffId) {
        return !teacherSubjects.some(function (value) { return String(value).split("|")[0] === staffId; });
      });
      if (hasInvalidClassTeacher) {
        showClassMessage("A class teacher must also be assigned at least one subject. Add a subject, then tick it under this teacher.", "error");
        return;
      }
      if (classTeachers.length > 1) {
        showClassMessage("Choose only one class teacher for this class.", "error");
        return;
      }
      var studentIds = formData.getAll("student_ids");
      if (!self.config.adminSessionId && (studentIds.length || teacherAssignments.length)) {
        showClassMessage("Set the current academic session before assigning students or teachers.", "error");
        return;
      }
      submit.disabled = true;
      message.hidden = false;
      message.className = "notice notice--info";
      message.textContent = "Saving class and allocations…";
      PortalData.saveClassRoster({
        id: classId,
        name: formData.get("name"),
        level: formData.get("level"),
        arm: formData.get("arm"),
        session_id: self.config.adminSessionId,
        student_ids: studentIds,
        teacher_assignments: teacherAssignments
      }).then(function (result) {
        if (result.error) throw new Error(result.error.message || "Could not save this class.");
        message.className = "notice notice--success";
        message.textContent = "Class, student membership and teacher allocations saved.";
        dialog.close();
        window.dispatchEvent(new Event("school:class-roster-updated"));
        self.refresh();
      }).catch(function (error) {
        message.hidden = false;
        message.className = "notice notice--error";
        message.textContent = error.message || "Could not save the class allocations.";
        message.scrollIntoView({ behavior: "smooth", block: "center" });
        submit.disabled = false;
      });
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
    if (panel.kind === "enrolment") {
      return this.enrolmentMarkup(panel);
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
      var cells = row.map(function (cell, index) {
        var first = index === 0 ? ' scope="row"' : "";
        var tone = statusTone(cell);
        var content = tone
          ? '<span class="badge badge--' + tone + '">' + portalEscape(cell) + "</span>"
          : portalEscape(cell);
        return "<td" + first + ' class="' + (index > 1 ? "wrap" : "") + '">' + content + "</td>";
      }).join("");
      var recordId = panel.rowIds && panel.rowIds[rowIndex];
      var edit = recordId && (panel.id === "pupils" || panel.id === "staff")
        ? '<td><button class="btn btn--small btn--outline-navy" type="button" data-record-edit="' +
          panel.id + '" data-record-id="' + portalEscape(recordId) + '">Edit</button></td>'
        : recordId && panel.id === "classes"
          ? '<td><div class="btn-row"><button class="btn btn--small btn--outline-navy" type="button" data-class-edit="' + portalEscape(recordId) + '">Edit</button><button class="btn btn--small btn--ghost" type="button" data-class-delete="' + portalEscape(recordId) + '">Delete</button></div></td>'
          : "";
      return "<tr data-table-row=\"" + rowIndex + "\">" + cells + edit + "</tr>";
    }).join("");

    return '<div class="table-wrap"><table class="table">' +
      "<caption>" + portalEscape(panel.caption || "Data") + "</caption>" +
      "<thead><tr>" + head + (panel.rowIds ? "<th scope=\"col\">Actions</th>" : "") + "</tr></thead><tbody>" + body + "</tbody></table></div>";
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

  enrolmentMarkup: function (panel) {
    var classes = panel.classes || [];
    if (!classes.length) return this.emptyMarkup(panel.emptyMessage || "No assigned classes are available.");
    return '<form class="form-stack" data-enrolment-form novalidate>' +
      '<div class="form-grid">' +
      '<label>First name<input class="form-control" name="first_name" required maxlength="80" autocomplete="given-name"></label>' +
      '<label>Surname<input class="form-control" name="last_name" required maxlength="80" autocomplete="family-name"></label>' +
      '</div>' +
      '<label>Middle name (optional)<input class="form-control" name="middle_name" maxlength="80" autocomplete="additional-name"></label>' +
      '<label>Class<select class="form-control" name="class_id" required><option value="">Choose a class</option>' +
      classes.map(function (item) {
        var label = [item.name, item.level, item.arm].filter(Boolean).join(" · ");
        return '<option value="' + portalEscape(item.id) + '">' + portalEscape(label) + '</option>';
      }).join("") +
      '</select></label>' +
      '<p class="muted">The system creates the student's portal account, generates a permanent student number and adds them to the current academic session.</p>' +
      '<div class="notice mt-1" data-enrolment-result hidden role="status" aria-live="polite"></div>' +
      '<button class="btn btn--primary" type="submit">Enrol student and create account</button>' +
      '</form>';
  },

  wireEnrolment: function (form, panel) {
    var self = this;
    var result = portalQuery("[data-enrolment-result]", form);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var submit = portalQuery('[type="submit"]', form);
      var payload = Object.fromEntries(new FormData(form).entries());
      if (!payload.first_name || !payload.last_name || !payload.class_id) {
        if (result) {
          result.hidden = false;
          result.className = "notice notice--error";
          result.textContent = "Enter the student's first name, surname and class.";
        }
        return;
      }
      submit.disabled = true;
      submit.textContent = "Creating student account…";
      if (result) {
        result.hidden = false;
        result.className = "notice notice--info";
        result.textContent = "Creating the account, student number and class enrolment…";
      }
      PortalData.enrolStudent(payload).then(function (res) {
        if (res.error || !res.data) throw new Error(res.error && res.error.message || "Student enrolment failed.");
        var student = res.data;
        var credentials = "Student number: " + student.student_number + "\nInitial password: " + student.initial_password;
        var warning = student.cbt_sync_warning
          ? '<p class="notice notice--warn">' + portalEscape(student.cbt_sync_warning) + '</p>'
          : '<p class="notice notice--success">The student has also been added to the CBT directory.</p>';
        if (result) {
          result.hidden = false;
          result.className = "notice notice--success";
          result.innerHTML = '<div><h3>Student enrolled successfully</h3>' +
            '<p><strong>Name:</strong> ' + portalEscape(student.full_name) + '</p>' +
            '<p><strong>Student number:</strong> <code>' + portalEscape(student.student_number) + '</code></p>' +
            '<p><strong>Class:</strong> ' + portalEscape(student.class_name) + '</p>' +
            '<p><strong>Initial password:</strong> <code>' + portalEscape(student.initial_password) + '</code></p>' +
            '<p class="muted">Copy these credentials now and give them securely to the student or guardian. The initial password is shown only once.</p>' +
            warning +
            '<div class="btn-row"><button class="btn btn--outline-navy btn--small" type="button" data-copy-student-credentials>Copy credentials</button>' +
            '<button class="btn btn--primary btn--small" type="button" data-refresh-students>Refresh dashboard</button></div></div>';
          var copy = portalQuery("[data-copy-student-credentials]", result);
          if (copy) copy.addEventListener("click", function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(credentials).then(function () {
                copy.textContent = "Copied";
              }).catch(function () { copy.textContent = "Copy unavailable"; });
            } else {
              copy.textContent = "Select and copy the credentials above";
            }
          });
          var refresh = portalQuery("[data-refresh-students]", result);
          if (refresh) refresh.addEventListener("click", function () { self.refresh(); });
        }
        form.reset();
      }).catch(function (error) {
        if (result) {
          result.hidden = false;
          result.className = "notice notice--error";
          result.textContent = error.message || "Could not enrol this student.";
        }
      }).finally(function () {
        submit.disabled = false;
        submit.textContent = "Enrol student and create account";
      });
    });
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
        return "<tr data-student=\"" + portalEscape(row.id) + "\">" +
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
  { name: "staff_no", label: "Staff number" },
  { name: "full_name", label: "Name" },
  { name: "job_title", label: "Job title" }
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
