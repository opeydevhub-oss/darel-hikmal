/* DAREL HIKMAH INTERNATIONAL ACADEMY
   Administrator authentication.

   This module wires the Administrator role on the sign-in screen to real
   Supabase Auth. It is deliberately narrow:

     - Only the Administrator portal uses email and password.
     - Pupils, parents and teachers are NOT authenticated here.
     - Authorization comes from the authenticated user's row in
       public.profiles, never from a URL parameter, HTML attribute,
       localStorage or sessionStorage.
     - No email or password is hardcoded or stored anywhere.

   The module is safe to load when Supabase is not configured: every method
   returns an error result and the demonstration keeps working offline. */

var PortalAuthAdmin = (function () {
  var adminMode = false;

  function field(id) {
    return document.getElementById(id);
  }

  function setFieldState(id, enabled) {
    var el = field(id);
    if (!el) { return; }
    el.disabled = !enabled;
    var row = el.closest(".form-row");
    if (row) {
      row.classList.toggle("form-field--disabled", !enabled);
    }
  }

  function showResult(html, kind) {
    var result = document.querySelector("[data-signin-result]");
    if (!result) { return; }
    result.hidden = false;
    result.className = "notice notice--" + kind;
    result.innerHTML = html;
  }

  function icon(name) {
    return typeof portalIcon === "function" ? portalIcon(name) : "";
  }

  function unavailableMessage() {
    return "Administrator sign-in is not connected yet. The backend is not " +
      "configured on this website.";
  }

  return {
    /** Update field state when the role picker changes. */
    setRoleMode: function (role) {
      var admin = role === "admin";
      if (admin) { adminMode = true; }
      setFieldState("portal-email", admin);
      setFieldState("portal-password", admin);
      // portal-id stays enabled so the demonstration flow still works.
    },

    /** Switch the screen to admin mode: email + password, leave the
       admission/staff number field available for the demonstration. */
    activateAdminMode: function () {
      adminMode = true;

      setFieldState("portal-email", true);
      setFieldState("portal-password", true);
      // portal-id stays enabled so the demonstration flow still works.
    },

    /** True when the Administrator role is currently selected. */
    isAdminModeActive: function () {
      if (adminMode) { return true; }
      var radio = document.querySelector('[data-role-choice][value="admin"]');
      return !!(radio && radio.checked);
    },

    /** Sign the administrator in with email and password.
       Returns a Promise resolving to { data, error }. */
    signIn: function (email, password) {
      var client = typeof SupabaseClient !== "undefined" ? SupabaseClient.getClient() : null;

      if (!client) {
        return Promise.resolve({
          data: null,
          error: { message: unavailableMessage() }
        });
      }

      if (!email || !password) {
        return Promise.resolve({
          data: null,
          error: { message: "Enter your email address and password to continue." }
        });
      }

      return client.auth
        .signInWithPassword({ email: email, password: password })
        .then(function (authResponse) {
          if (authResponse.error) {
            return { data: null, error: authResponse.error };
          }

          var user = authResponse.data && authResponse.data.user;
          if (!user || !user.id) {
            return { data: null, error: { message: "Sign-in did not return a user." } };
          }

          return client
            .from("profiles")
            .select("id, role, is_active")
            .eq("id", user.id)
            .maybeSingle()
            .then(function (profileResponse) {
              if (profileResponse.error) {
                // The profile could not be read. Do not trust the session.
                client.auth.signOut();
                return {
                  data: null,
                  error: { message: "We could not verify your account. Please contact the school office." }
                };
              }

              var profile = profileResponse.data;
              if (!profile) {
                client.auth.signOut();
                return {
                  data: null,
                  error: { message: "No administrator profile is recorded for this account." }
                };
              }

              if (profile.role !== "admin") {
                client.auth.signOut();
                return {
                  data: null,
                  error: { message: "This account is not authorised for the Administrator portal." }
                };
              }

              if (profile.is_active !== true) {
                client.auth.signOut();
                return {
                  data: null,
                  error: { message: "This administrator account has been deactivated. Please contact the school office." }
                };
              }

              return {
                data: {
                  user: user,
                  profile: profile,
                  role: "admin"
                },
                error: null
              };
            });
        });
    }
  };
})();
