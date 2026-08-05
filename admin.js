(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var pin = "";
  var benefits = window.PARIVAR_BENEFITS || [];
  var working = false;

  $("mode-pill").textContent = UI.modeLabel();
  var pub = window.PARIVAR_CONFIG && window.PARIVAR_CONFIG.sheetPubHtml;
  if (pub) $("sheet-link").href = pub;

  function unlock() {
    if (working) return;
    pin = $("admin-pin").value.trim();
    if (!pin) {
      UI.setStatus($("status"), "Enter PIN", "bad");
      return;
    }
    working = true;
    UI.setBusy($("unlock"), true, "Checking…");
    UI.setStatus($("status"), "Checking PIN…", "info");
    API.call("adminLookup", { pin: pin, passId: "__pin_check__" })
      .then(function (res) {
        working = false;
        UI.setBusy($("unlock"), false);
        if (!res.ok && res.code === "auth") {
          UI.setStatus($("status"), res.error || "Wrong admin PIN", "bad");
          return;
        }
        if (!res.ok) {
          UI.setStatus($("status"), res.error || "Unlock failed", "bad");
          return;
        }
        UI.show($("auth-panel"), false);
        UI.show($("lookup-panel"), true);
        UI.setStatus($("status"), "Unlocked", "ok");
        var fromUrl = UI.passParam();
        if (fromUrl) {
          $("pass-input").value = fromUrl;
          lookup();
        } else {
          $("pass-input").focus();
        }
      })
      .catch(function (err) {
        working = false;
        UI.setBusy($("unlock"), false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "Unlock failed",
          "bad"
        );
      });
  }

  function lookup() {
    if (working) return;
    var passId = $("pass-input").value.trim();
    if (!passId) {
      UI.setStatus($("status"), "Enter pass ID", "bad");
      return;
    }
    working = true;
    UI.setBusy($("lookup"), true, "Loading…");
    UI.setStatus($("status"), "Loading latest…", "info");
    API.call("adminLookup", { pin: pin, passId: passId })
      .then(function (res) {
        working = false;
        UI.setBusy($("lookup"), false);
        if (!res.ok) {
          UI.show($("detail-panel"), false);
          UI.setStatus($("status"), res.error, "bad");
          return;
        }
        if (res.data.benefits) benefits = res.data.benefits;
        UI.setStatus($("status"), "Loaded", "ok");
        paint(res.data.pass, res.data.redemptions || []);
      })
      .catch(function (err) {
        working = false;
        UI.setBusy($("lookup"), false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "Lookup failed",
          "bad"
        );
      });
  }

  $("unlock").addEventListener("click", unlock);
  $("lookup").addEventListener("click", lookup);
  UI.onEnter($("admin-pin"), unlock);
  UI.onEnter($("pass-input"), lookup);

  function paint(pass, redemptions) {
    UI.show($("detail-panel"), true);
    $("detail-id").textContent = pass.passId;
    $("detail-meta").textContent =
      "Status: " +
      (pass.effectiveStatus || pass.status) +
      (pass.invalidReason ? " (" + pass.invalidReason + ")" : "") +
      " · Valid till " +
      (pass.validUntil || "—") +
      " · Generated " +
      (pass.generatedAt || "—");
    $("detail-person").textContent = pass.name
      ? pass.name + " · " + (pass.phone || "")
      : "Not registered yet";

    var box = $("slot-actions");
    box.innerHTML = "";
    benefits.forEach(function (b) {
      var state = (pass.slots && pass.slots[b.id]) || "open";
      var row = document.createElement("article");
      row.className = "benefit";
      var tag = document.createElement("p");
      tag.className = "tag";
      tag.textContent = b.kind + " · " + state;
      var h = document.createElement("h3");
      h.textContent = b.title;
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = b.blurb;
      row.appendChild(tag);
      row.appendChild(h);
      row.appendChild(p);
      if (state === "open" && pass.status === "active") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent =
          b.kind === "venue"
            ? "Disable this privilege (desk redeem)"
            : "Mark event privilege used";
        btn.addEventListener("click", function () {
          redeem(pass.passId, b.id, btn);
        });
        row.appendChild(btn);
      }
      box.appendChild(row);
    });

    var hist = $("history");
    if (!redemptions.length) {
      hist.textContent = "No redemptions yet.";
      return;
    }
    hist.innerHTML = redemptions
      .slice()
      .reverse()
      .map(function (r) {
        return (
          "<div>" +
          UI.escapeHtml(r.at) +
          " · " +
          UI.escapeHtml(r.benefitId) +
          " · by " +
          UI.escapeHtml(r.by) +
          "</div>"
        );
      })
      .join("");
  }

  function redeem(passId, benefitId, btn) {
    if (working) return;
    working = true;
    UI.setBusy(btn, true, "Updating…");
    UI.setStatus($("status"), "Updating…", "info");
    API.call("adminRedeem", {
      pin: pin,
      passId: passId,
      benefitId: benefitId,
    })
      .then(function (res) {
        if (!res.ok) {
          working = false;
          UI.setBusy(btn, false);
          UI.setStatus($("status"), res.error, "bad");
          return null;
        }
        UI.setStatus($("status"), res.data.message, "ok");
        return API.call("adminLookup", { pin: pin, passId: passId }).then(
          function (again) {
            working = false;
            UI.setBusy(btn, false);
            if (again.ok) paint(again.data.pass, again.data.redemptions || []);
          }
        );
      })
      .catch(function (err) {
        working = false;
        UI.setBusy(btn, false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "Redeem failed",
          "bad"
        );
      });
  }
})();
