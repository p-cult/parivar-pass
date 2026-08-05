(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var current = null;
  var benefits = window.PARIVAR_BENEFITS || [];
  var working = false;

  $("mode-pill").textContent = UI.modeLabel();
  var social = (window.PARIVAR_CONFIG && window.PARIVAR_CONFIG.social) || {};
  var socialEl = $("social-line");
  if (social.label && socialEl) {
    socialEl.textContent = "";
    var a = document.createElement("a");
    a.href = social.instagram || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = social.label;
    socialEl.appendChild(a);
  }

  var fromUrl = UI.passParam();
  if (fromUrl) {
    $("pass-input").value = fromUrl;
    openPass(fromUrl);
  }

  function openPass(id) {
    if (working) return;
    id = String(id || "").trim().toUpperCase();
    if (!id) {
      UI.setStatus($("status"), "Enter a pass ID", "bad");
      return;
    }
    working = true;
    UI.setBusy($("open-pass"), true, "Looking up…");
    UI.setStatus($("status"), "Looking up…", "info");
    API.call("getPass", { passId: id })
      .then(function (res) {
        working = false;
        UI.setBusy($("open-pass"), false);
        if (!res.ok) {
          UI.show($("lookup-panel"), true);
          UI.show($("register-panel"), false);
          UI.show($("home-panel"), false);
          UI.show($("invalid-panel"), false);
          UI.show($("proof-panel"), false);
          UI.setStatus($("status"), res.error, "bad");
          return;
        }
        if (res.data.benefits) benefits = res.data.benefits;
        showPass(res.data.pass);
      })
      .catch(function (err) {
        working = false;
        UI.setBusy($("open-pass"), false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "Lookup failed",
          "bad"
        );
      });
  }

  $("open-pass").addEventListener("click", function () {
    openPass($("pass-input").value);
  });
  UI.onEnter($("pass-input"), function () {
    openPass($("pass-input").value);
  });

  $("register-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!current || working) return;
    working = true;
    var submitBtn = $("register-form").querySelector('button[type="submit"]');
    UI.setBusy(submitBtn, true, "Saving…");
    UI.setStatus($("status"), "Saving…", "info");
    API.call("register", {
      passId: current.passId,
      name: $("reg-name").value,
      phone: $("reg-phone").value,
      email: $("reg-email").value,
    })
      .then(function (res) {
        working = false;
        UI.setBusy(submitBtn, false);
        if (!res.ok) {
          UI.setStatus($("status"), res.error, "bad");
          return;
        }
        UI.setStatus($("status"), "Registered as first bearer.", "ok");
        showPass(res.data.pass);
      })
      .catch(function (err) {
        working = false;
        UI.setBusy(submitBtn, false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "Register failed",
          "bad"
        );
      });
  });

  function showPass(pass) {
    current = pass;
    UI.show($("lookup-panel"), false);
    UI.show($("proof-panel"), false);

    if (pass.effectiveStatus === "invalid") {
      UI.show($("register-panel"), false);
      UI.show($("home-panel"), false);
      UI.show($("invalid-panel"), true);
      $("invalid-id").textContent = pass.passId;
      $("invalid-reason").textContent =
        pass.invalidReason === "valid_date_passed"
          ? "Valid Till date has passed (6 months from print generation)."
          : "All privileges on this pass have been used.";
      UI.setStatus($("status"), "Pass invalid", "bad");
      return;
    }

    if (pass.status === "unregistered") {
      UI.show($("invalid-panel"), false);
      UI.show($("home-panel"), false);
      UI.show($("register-panel"), true);
      $("reg-pass-id").textContent = pass.passId;
      UI.setStatus($("status"), "First scan — register as bearer.", "info");
      $("reg-name").focus();
      return;
    }

    UI.show($("invalid-panel"), false);
    UI.show($("register-panel"), false);
    UI.show($("home-panel"), true);
    $("guest-name").textContent = pass.name || "bearer";
    $("guest-pass-id").textContent = pass.passId;
    $("guest-valid").textContent = pass.validUntil || "—";
    UI.setStatus($("status"), "", "info");
    renderBenefits(pass);
  }

  function renderBenefits(pass) {
    var list = $("benefit-list");
    list.innerHTML = "";
    benefits.forEach(function (b) {
      var state = (pass.slots && pass.slots[b.id]) || "open";
      var el = document.createElement("article");
      el.className = "benefit";
      var tag = document.createElement("p");
      tag.className = "tag";
      tag.textContent =
        b.kind === "venue"
          ? "Venue · desk redeems"
          : state === "open"
            ? "Event · RSVP"
            : "Event · used";
      var h = document.createElement("h3");
      h.textContent = b.title;
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent = b.blurb;
      el.appendChild(tag);
      el.appendChild(h);
      el.appendChild(p);

      if (state === "redeemed") {
        var used = document.createElement("p");
        used.className = "hint";
        used.textContent = "Used / disabled";
        el.appendChild(used);
      } else if (b.redeemBy === "audience") {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "RSVP (uses this privilege)";
        btn.addEventListener("click", function () {
          doRsvp(b.id, btn);
        });
        el.appendChild(btn);
      } else {
        var tip = document.createElement("p");
        tip.className = "hint";
        tip.textContent =
          "Show this pass at the ticket desk. Staff will scan and disable this privilege.";
        el.appendChild(tip);
      }
      list.appendChild(el);
    });
  }

  function doRsvp(benefitId, btn) {
    if (!current || working) return;
    working = true;
    UI.setBusy(btn, true, "Recording…");
    UI.setStatus($("status"), "Recording RSVP…", "info");
    API.call("rsvp", { passId: current.passId, benefitId: benefitId })
      .then(function (res) {
        working = false;
        UI.setBusy(btn, false);
        if (!res.ok) {
          UI.setStatus($("status"), res.error, "bad");
          return;
        }
        var b = res.data.benefit;
        showPass(res.data.pass);
        UI.show($("proof-panel"), true);
        $("proof-title").textContent = "RSVP CONFIRMED";
        $("proof-detail").textContent =
          (b && b.title ? b.title + " — " : "") +
          "Show this at the registration desk. Privilege is used even if you don’t attend.";
        $("proof-pass").textContent = current.passId;
        UI.setStatus($("status"), res.data.message, "ok");
      })
      .catch(function (err) {
        working = false;
        UI.setBusy(btn, false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "RSVP failed",
          "bad"
        );
      });
  }
})();
