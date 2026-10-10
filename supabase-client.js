/* DAREL HIKMAH INTERNATIONAL ACADEMY
   Single Supabase browser client for the portal.

   This module initialises the official @supabase/supabase-js v2 client from
   the credentials in js/config.js and exposes one shared instance.

   It is deliberately defensive:
     - If the CDN script has not loaded yet, it returns null instead of
       throwing, so the demonstration still works.
     - If the credentials in js/config.js are still the placeholders, it
       returns null. The portal then falls back to its existing demonstration
       data until the backend is connected.

   Nothing here authenticates anyone. Authentication, queries and writes are
   added later, through this one client. */

var SupabaseClient = (function () {
  var client = null;
  var initialised = false;

  function isPlaceholder(value) {
    return !value || /YOUR-PROJECT-REF|YOUR_PUBLISHABLE_KEY_HERE/i.test(value);
  }

  function create() {
    if (initialised) {
      return client;
    }
    initialised = true;

    // The Supabase library is loaded from the CDN in portal-login.html.
    var supabase = window.supabase;

    if (!supabase || typeof supabase.createClient !== "function") {
      // Not loaded yet (for example on a page that does not include the CDN
      // script). Stay silent so the demonstration keeps working.
      return null;
    }

    if (isPlaceholder(SUPABASE_URL) || isPlaceholder(SUPABASE_PUBLISHABLE_KEY)) {
      // Credentials not filled in yet. The portal keeps using demonstration
      // data until they are.
      return null;
    }

    try {
      client = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    } catch (error) {
      // Defensive: a misconfiguration must not break the demonstration page.
      client = null;
    }

    return client;
  }

  return {
    /** Returns the shared client, or null when Supabase is not configured. */
    getClient: function () {
      return create();
    },

    /** True when a real client has been created. */
    isConfigured: function () {
      return create() !== null;
    }
  };
})();