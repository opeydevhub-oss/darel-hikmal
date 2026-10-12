/* DAREL HIKMAH INTERNATIONAL ACADEMY
   Portal session protection.

   Every portal dashboard is protected by a real Supabase session. This module
   runs before the dashboard renderer, so a page that is opened without a
   valid session is sent back to the sign-in screen before any demo data is
   shown.

   Authorization is decided here, on the server, from the authenticated user's
   row in public.profiles. Nothing on the page is trusted for authorization:
   not the URL, not data-portal-dashboard, not localStorage, not sessionStorage
   and not a role the visitor picked on the sign-in screen.

   The dashboard UI and demo rendering are left untouched; this module only
   guards access. */

var PortalSession = (function () {
  var LOGIN_URL = "portal-login.html";
  var REDIRECT_PARAM = "next";

  /** Map a dashboard page to the role it requires. */
  function requiredRole() {
    var main = document.querySelector("main[data-portal-dashboard]");
    return main ? main.getAttribute("data-portal-dashboard") : null;
  }

   /** Read the role this dashboard requires, then verify it server-side.
       Authorization is NEVER taken from the page. The page only says "I am
       the student dashboard"; the server (profiles + RLS) decides whether the
       signed-in visitor may actually be here. */
   function checkAccess() {
    var client = typeof SupabaseClient !== "undefined" ? SupabaseClient.getClient() : null;

    if (!client || !SupabaseClient.isConfigured()) {
      // No real Supabase client configured on this page. Do NOT fall back to
      // treating the visitor as allowed — that would bypass authorization.
      return Promise.resolve({ allowed: false, reason: "not-configured" });
    }

    var role = requiredRole();
    if (!role) {
      return Promise.resolve({ allowed: false, reason: "no-role" });
    }

    return client.auth
      .getSession()
      .then(function (sessionResponse) {
        var session = sessionResponse.data && sessionResponse.data.session;
        var user = session && session.user;

        if (!user || !user.id) {
          return Promise.resolve({ allowed: false, reason: "no-session" });
        }

        return client
          .from("profiles")
          .select("id, role, is_active")
          .eq("id", user.id)
          .maybeSingle()
          .then(function (profileResponse) {
            if (profileResponse.error) {
              return Promise.resolve({ allowed: false, reason: "profile-error" });
            }

            var profile = profileResponse.data;
            if (!profile) {
              return Promise.resolve({ allowed: false, reason: "no-profile" });
            }

            if (profile.is_active !== true) {
              return Promise.resolve({ allowed: false, reason: "inactive" });
            }

            if (profile.role !== role) {
              return Promise.resolve({ allowed: false, reason: "wrong-role" });
            }

            return Promise.resolve({
              allowed: true,
              user: user,
              profile: profile
            });
          });
      });
  }

  /** Sign the current user out and send them back to the sign-in screen. */
  function signOut() {
    var client = typeof SupabaseClient !== "undefined" ? SupabaseClient.getClient() : null;

    var redirect = function () {
      var next = "";
      try {
        next = "?next=" + encodeURIComponent(window.location.pathname.split("/").pop());
      } catch (e) { next = ""; }
      window.location.href = LOGIN_URL + next;
    };

    if (!client) {
      redirect();
      return Promise.resolve();
    }

    return client.auth.signOut().then(redirect, redirect);
  }

  /** Run the access check. On failure, sign out and redirect. */
  function protect() {
    return checkAccess().then(function (result) {
      if (result.allowed) {
        return result;
      }

      // Do not leave a partial or stale session behind on a protected page.
      var client = typeof SupabaseClient !== "undefined" ? SupabaseClient.getClient() : null;
      if (client) {
        try { client.auth.signOut(); } catch (e) { /* ignore */ }
      }
      window.location.href = LOGIN_URL + "?next=" +
        encodeURIComponent(window.location.pathname.split("/").pop());
      return result;
    });
  }

  return {
    checkAccess: checkAccess,
    signOut: signOut,
    protect: protect,
    requiredRole: requiredRole
  };
})();
