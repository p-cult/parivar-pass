/**
 * Staff session on this device. Stored in localStorage so it survives the
 * phone camera opening a scanned pass in a new tab: a checker signs in once
 * on desk.html, then every pass they scan opens straight into the staff view.
 */
window.ParivarStaff = (function () {
  var KEY = "parivar:staff";

  function get() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || "null");
      return s && s.pin ? s : null;
    } catch (e) {
      return null;
    }
  }

  function set(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      /* private mode: session lasts for this page only */
    }
  }

  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }

  function login(pin) {
    return window.ParivarAPI.call("staffLogin", { pin: pin }).then(function (res) {
      if (res.ok) set({ pin: pin, name: res.data.name, role: res.data.role });
      return res;
    });
  }

  // Admin pages (print, assign) ask for a PIN — prefill it from the session.
  // Scripts load at the end of <body>, so the input already exists here.
  function prefill() {
    var s = get();
    var input = document.getElementById("admin-pin");
    if (s && input && !input.value) input.value = s.pin;
  }
  prefill();
  document.addEventListener("DOMContentLoaded", prefill);

  return { get: get, set: set, clear: clear, login: login };
})();
