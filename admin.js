(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var Staff = window.ParivarStaff;
  var cfg = window.PARIVAR_CONFIG || {};

  if (cfg.sheetUrl) $("sheet-link").href = cfg.sheetUrl;

  function show(s) {
    if (s.role !== "admin") {
      UI.setStatus($("status"), s.name + " is a checker — admin tools need an admin PIN. Use the ticket desk instead.", "bad");
      return;
    }
    UI.show($("login-panel"), false);
    UI.show($("admin-panel"), true);
    $("who").textContent = s.name;
    loadStats(s.pin);
  }

  function loadStats(pin) {
    API.call("listPasses", { pin: pin }).then(function (res) {
      if (!res.ok) return;
      var n = { total: 0, active: 0, unclaimed: 0, invalid: 0 };
      (res.data.passes || []).forEach(function (p) {
        n.total++;
        if (p.effectiveStatus === "invalid") n.invalid++;
        else if (p.status === "active") n.active++;
        else n.unclaimed++;
      });
      $("n-total").textContent = n.total;
      $("n-active").textContent = n.active;
      $("n-unclaimed").textContent = n.unclaimed;
      $("n-invalid").textContent = n.invalid;
    });
  }

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
      UI.setStatus($("status"), "", "info");
      show(Staff.get());
    });
  }

  var s = Staff.get();
  if (s) show(s);

  $("login").addEventListener("click", login);
  UI.onEnter($("pin"), login);
  $("logout").addEventListener("click", function () {
    Staff.clear();
    location.reload();
  });
})();
