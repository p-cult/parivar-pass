(function () {
  var UI = window.ParivarUI;
  var $ = UI.$;
  var Staff = window.ParivarStaff;

  function signedIn(s) {
    UI.show($("login-panel"), false);
    UI.show($("desk-panel"), true);
    UI.show($("admin-link"), s.role === "admin");
    $("who").textContent = s.name + " (" + s.role + ")";
    var fromUrl = UI.passParam();
    if (fromUrl) {
      $("pass-input").value = fromUrl;
      window.ParivarStaffPanel.open(fromUrl);
    } else {
      $("pass-input").focus();
    }
  }

  var existing = Staff.get();
  if (existing) signedIn(existing);

  function login() {
    var pin = $("pin").value.trim();
    if (!pin) return;
    UI.setBusy($("login"), true, "Checking…");
    Staff.login(pin).then(function (res) {
      UI.setBusy($("login"), false);
      if (!res.ok) {
        UI.setStatus($("status"), res.error || "Wrong PIN", "bad");
        return;
      }
      UI.setStatus($("status"), "Welcome, " + res.data.name, "ok");
      signedIn(Staff.get());
    });
  }

  $("login").addEventListener("click", login);
  UI.onEnter($("pin"), login);

  $("logout").addEventListener("click", function () {
    Staff.clear();
    location.href = "desk.html";
  });

  function lookup() {
    var id = $("pass-input").value.trim().toUpperCase();
    if (!id) return;
    UI.setBusy($("lookup"), true, "Loading…");
    window.ParivarStaffPanel.open(id).then(function () {
      UI.setBusy($("lookup"), false);
    });
  }
  $("lookup").addEventListener("click", lookup);
  UI.onEnter($("pass-input"), lookup);
})();
