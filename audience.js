(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var View = window.ParivarView;
  var $ = UI.$;
  var cfg = window.PARIVAR_CONFIG || {};
  var passId = UI.passParam();
  var working = false;
  // Last-seen copy of an active pass on this phone, so a repeat scan paints the
  // dashboard instantly while the Sheet is re-read in the background.
  var CACHE_PREFIX = "parivar:pass:";

  var social = cfg.social || {};
  if (social.label && social.instagram) {
    var a = document.createElement("a");
    a.href = social.instagram;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = social.label;
    $("social-line").appendChild(a);
  }

  var staff = window.ParivarStaff.get();
  if (staff) {
    window.ParivarStaff.keepWarm();
    UI.show($("staff-bar"), true);
    $("staff-who").textContent = staff.name + " (" + staff.role + ")";
    $("staff-out").addEventListener("click", function () {
      window.ParivarStaff.clear();
      location.reload();
    });
  }

  if (!passId) {
    UI.show($("lookup-panel"), true);
  } else if (staff) {
    $("title").textContent = "Pass check";
    window.ParivarStaffPanel.open(passId);
  } else {
    openPass(passId);
  }

  $("open-pass").addEventListener("click", function () {
    var id = $("pass-input").value.trim().toUpperCase();
    if (id) location.search = "?pass=" + encodeURIComponent(id);
  });
  UI.onEnter($("pass-input"), function () {
    $("open-pass").click();
  });

  function hideAll() {
    ["lookup-panel", "invalid-panel", "register-panel", "home-panel"].forEach(function (id) {
      UI.show($(id), false);
    });
  }

  function readCache(id) {
    try {
      var hit = JSON.parse(localStorage.getItem(CACHE_PREFIX + id) || "null");
      return hit && hit.status === "active" && !hit.invalidReason ? hit : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(pass) {
    try {
      if (pass.status === "active" && !pass.invalidReason) {
        localStorage.setItem(CACHE_PREFIX + pass.passId, JSON.stringify(pass));
      } else {
        localStorage.removeItem(CACHE_PREFIX + pass.passId);
      }
    } catch (e) {
      /* storage unavailable: just no instant repeat */
    }
  }

  function openPass(id) {
    var cached = readCache(id);
    if (cached) {
      show(cached);
      UI.setStatus($("status"), "Refreshing…", "info");
    } else {
      UI.setStatus($("status"), "Opening your pass…", "info");
    }
    API.call("getPass", { passId: id }).then(function (res) {
      if (!res.ok || !res.data || !res.data.pass) {
        if (cached && res.code !== "not_found") {
          UI.setStatus($("status"), "Showing your last saved view — couldn't refresh just now.", "info");
          return;
        }
        hideAll();
        UI.show($("lookup-panel"), true);
        $("pass-input").value = id;
        UI.setStatus($("status"), res.error || "Could not open this pass — try again.", "bad");
        return;
      }
      UI.setStatus($("status"), "", "info");
      show(res.data.pass);
    });
  }

  function show(pass) {
    writeCache(pass);
    hideAll();
    if (pass.invalidReason) {
      UI.show($("invalid-panel"), true);
      $("invalid-title").textContent = pass.invalidReason === "void" ? "Pass cancelled" : "Pass expired";
      $("invalid-reason").textContent =
        pass.invalidReason === "void"
          ? "This pass is no longer active. Please contact the Param team."
          : "This pass was valid till " + View.formatDate(pass.validUntil) + ".";
      $("invalid-id").textContent = pass.passId;
      return;
    }
    if (pass.status !== "active") {
      UI.show($("register-panel"), true);
      $("reg-pass-id").textContent = pass.passId;
      return;
    }
    $("title").textContent = "Your Parivar Pass";
    UI.show($("home-panel"), true);
    $("holder-name").textContent = pass.name || "friend";
    $("holder-pass-id").textContent = pass.passId;
    $("holder-valid").textContent = View.formatDate(pass.validUntil);
    View.renderHolder($("holder-privs"), pass, useOne);
  }

  function useOne(priv, btn) {
    if (working) return;
    if (!confirm("Confirm " + priv.title + "? This uses the privilege.")) return;
    working = true;
    UI.setBusy(btn, true, "Confirming…");
    API.call("holderUse", { passId: passId, privilegeId: priv.id }).then(function (res) {
      working = false;
      UI.setBusy(btn, false);
      if (!res.ok) {
        UI.setStatus($("status"), res.error || "Could not confirm", "bad");
        return;
      }
      show(res.data.pass);
      UI.setStatus($("status"), res.data.message || "Confirmed", "ok");
    });
  }

  $("register-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (working) return;
    working = true;
    UI.setBusy($("reg-submit"), true, "Claiming…");
    API.call("register", {
      passId: passId,
      name: $("reg-name").value,
      phone: $("reg-phone").value,
      email: $("reg-email").value,
    }).then(function (res) {
      working = false;
      UI.setBusy($("reg-submit"), false);
      if (!res.ok || !res.data || !res.data.pass) {
        UI.setStatus($("status"), (res && res.error) || "Could not register", "bad");
        return;
      }
      show(res.data.pass);
      UI.setStatus($("status"), "Pass claimed — welcome!", "ok");
    });
  });
})();
