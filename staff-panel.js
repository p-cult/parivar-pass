/**
 * Staff panel controller — used on audience.html (when a staff session exists
 * on this phone) and on desk.html. Expects the #staff-panel markup.
 */
window.ParivarStaffPanel = (function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var View = window.ParivarView;
  var $ = UI.$;
  var current = null;
  var busy = false;

  function session() {
    return window.ParivarStaff.get();
  }

  function onAuthFail(res) {
    if (res && res.code === "auth") {
      window.ParivarStaff.clear();
      UI.setStatus($("status"), "Your staff PIN is no longer valid. Sign in again on the desk page.", "bad");
      return true;
    }
    return false;
  }

  function open(passId) {
    var s = session();
    if (!s) return Promise.resolve();
    UI.setStatus($("status"), "Loading pass…", "info");
    return API.call("lookup", { pin: s.pin, passId: passId }).then(function (res) {
      if (onAuthFail(res)) return;
      if (!res.ok) {
        UI.show($("staff-panel"), false);
        UI.setStatus($("status"), res.error || "Lookup failed", "bad");
        return;
      }
      UI.setStatus($("status"), "", "info");
      paint(res.data.pass);
    });
  }

  function paint(pass) {
    current = pass;
    var s = session();
    var isAdmin = s && s.role === "admin";
    UI.show($("staff-panel"), true);
    $("s-pass-id").textContent = pass.passId;
    $("s-name").textContent = pass.name || "Unclaimed pass";
    var meta = [View.statusText(pass)];
    if (pass.type) meta.push(pass.type);
    if (pass.phone) meta.push(pass.phone);
    meta.push("valid till " + View.formatDate(pass.validUntil));
    $("s-meta").textContent = meta.join(" · ");

    if (pass.invalidReason) {
      UI.setStatus($("status"), pass.invalidReason === "void" ? "This pass is cancelled." : "This pass has expired.", "bad");
    } else if (pass.status !== "active") {
      UI.setStatus($("status"), isAdmin ? "Unclaimed — assign it below, or the holder registers on first scan." : "Unclaimed — the holder registers on first scan.", "info");
    }

    UI.show($("s-assign"), !!(isAdmin && pass.status === "unclaimed" && !pass.invalidReason));

    var actions = $("s-admin-actions");
    actions.textContent = "";
    if (isAdmin) {
      var target = pass.status === "void" ? (pass.name ? "active" : "unclaimed") : "void";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "secondary";
      b.textContent = target === "void" ? "Cancel this pass" : "Reinstate pass";
      b.addEventListener("click", function () {
        if (target === "void" && !confirm("Cancel pass " + pass.passId + "? It will stop working.")) return;
        call("setStatus", { passId: pass.passId, status: target }, b);
      });
      actions.appendChild(b);
    }
    UI.show(actions, isAdmin);

    View.renderStaff($("staff-privs"), pass, s || {}, function (priv, state, btn) {
      call("setPrivilege", { passId: pass.passId, privilegeId: priv.id, state: state }, btn, priv.title + ": " + state);
    });
  }

  function call(action, payload, btn, doneMsg) {
    if (busy) return;
    var s = session();
    if (!s) return;
    busy = true;
    UI.setBusy(btn, true, "Saving…");
    API.call(action, Object.assign({ pin: s.pin }, payload)).then(function (res) {
      busy = false;
      UI.setBusy(btn, false);
      if (onAuthFail(res)) return;
      if (!res.ok) {
        UI.setStatus($("status"), res.error || "Could not save", "bad");
        return;
      }
      paint(res.data.pass);
      UI.setStatus($("status"), doneMsg ? "Saved — " + doneMsg : "Saved", "ok");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = $("assign-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!current) return;
      call(
        "assign",
        {
          passId: current.passId,
          name: $("a-name").value,
          phone: $("a-phone").value,
          email: $("a-email").value,
          type: $("a-type").value,
        },
        $("a-submit"),
        "assigned to " + $("a-name").value
      );
    });
  });

  return { open: open };
})();
