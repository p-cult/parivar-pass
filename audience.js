(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var current = null;
  var benefits = window.PARIVAR_BENEFITS || [];
  var working = false;
  var cfg = window.PARIVAR_CONFIG || {};
  var otpEnabled = !!cfg.otpEnabled;
  var pendingReg = null;
  var otpToken = "";

  $("mode-pill").textContent = UI.modeLabel();
  var social = cfg.social || {};
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

  if (otpEnabled) {
    var submitBtn = $("reg-submit");
    if (submitBtn) submitBtn.textContent = "Send verification code";
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
        if (!res.ok || !res.data || !res.data.pass) {
          UI.show($("lookup-panel"), true);
          UI.show($("register-panel"), false);
          UI.show($("otp-panel"), false);
          UI.show($("home-panel"), false);
          UI.show($("invalid-panel"), false);
          UI.show($("proof-panel"), false);
          UI.setStatus(
            $("status"),
            (res.error) || "Lookup failed — try again.",
            "bad"
          );
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
    var draft = {
      passId: current.passId,
      name: $("reg-name").value,
      phone: $("reg-phone").value,
      email: $("reg-email").value,
    };
    if (otpEnabled) {
      startOtp(draft);
    } else {
      completeRegister(draft, null);
    }
  });

  $("otp-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!pendingReg || working) return;
    working = true;
    UI.setBusy($("otp-verify"), true, "Verifying…");
    UI.setStatus($("status"), "Verifying code…", "info");
    API.call("verifyOtp", {
      passId: pendingReg.passId,
      phone: pendingReg.phone,
      code: $("otp-code").value,
    })
      .then(function (res) {
        if (!res.ok) {
          working = false;
          UI.setBusy($("otp-verify"), false);
          UI.setStatus($("status"), res.error, "bad");
          return;
        }
        otpToken = (res.data && res.data.otpToken) || "";
        return completeRegister(pendingReg, otpToken, $("otp-verify"));
      })
      .catch(function (err) {
        working = false;
        UI.setBusy($("otp-verify"), false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "Verify failed",
          "bad"
        );
      });
  });

  $("otp-resend").addEventListener("click", function () {
    if (!pendingReg || working) return;
    startOtp(pendingReg);
  });

  $("otp-back").addEventListener("click", function () {
    UI.show($("otp-panel"), false);
    UI.show($("register-panel"), true);
    UI.setStatus($("status"), "First scan — register as bearer.", "info");
  });

  function startOtp(draft) {
    pendingReg = draft;
    otpToken = "";
    working = true;
    var busyBtn = $("reg-submit");
    UI.setBusy(busyBtn, true, "Sending…");
    UI.setBusy($("otp-resend"), true, "Sending…");
    UI.setStatus($("status"), "Sending verification code…", "info");
    API.call("requestOtp", {
      passId: draft.passId,
      phone: draft.phone,
      channel: cfg.otpChannel || "sms",
    })
      .then(function (res) {
        working = false;
        UI.setBusy(busyBtn, false);
        UI.setBusy($("otp-resend"), false);
        if (!res.ok) {
          UI.setStatus($("status"), res.error, "bad");
          return;
        }
        UI.show($("register-panel"), false);
        UI.show($("otp-panel"), true);
        $("otp-phone-label").textContent = draft.phone;
        $("otp-code").value = "";
        $("otp-code").focus();
        var msg = "Enter the code sent to your phone.";
        if (res.data && res.data.devCode) {
          msg += " Dev code: " + res.data.devCode;
        }
        if (res.data && res.data.sent === false) {
          msg =
            "OTP provider not wired yet — use the dev code shown (or wire SMS in Code.gs).";
          if (res.data.devCode) msg += " Code: " + res.data.devCode;
        }
        UI.setStatus($("status"), msg, "info");
      })
      .catch(function (err) {
        working = false;
        UI.setBusy(busyBtn, false);
        UI.setBusy($("otp-resend"), false);
        UI.setStatus(
          $("status"),
          (err && err.message) || "Could not send code",
          "bad"
        );
      });
  }

  function completeRegister(draft, token, busyEl) {
    working = true;
    var submitBtn = busyEl || $("reg-submit");
    UI.setBusy(submitBtn, true, "Saving…");
    UI.setStatus($("status"), "Saving…", "info");
    var payload = {
      passId: draft.passId,
      name: draft.name,
      phone: draft.phone,
      email: draft.email,
    };
    if (otpEnabled) {
      payload.requireOtp = true;
      payload.otpToken = token || otpToken || "";
    }
    return API.call("register", payload)
      .then(function (res) {
        working = false;
        UI.setBusy(submitBtn, false);
        if (!res.ok) {
          UI.setStatus($("status"), res.error, "bad");
          return;
        }
        pendingReg = null;
        otpToken = "";
        UI.show($("otp-panel"), false);
        if (res.data.benefits) benefits = res.data.benefits;
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
  }

  $("event-select").addEventListener("change", function () {
    updateEventMeta();
    $("rsvp-btn").disabled = !$("event-select").value;
  });

  $("rsvp-btn").addEventListener("click", function () {
    var id = $("event-select").value;
    if (!id) return;
    doRsvp(id, $("rsvp-btn"));
  });

  function showPass(pass) {
    current = pass;
    pendingReg = null;
    otpToken = "";
    UI.show($("lookup-panel"), false);
    UI.show($("proof-panel"), false);
    UI.show($("otp-panel"), false);

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
    renderHome(pass);
  }

  function eventBenefits() {
    return benefits.filter(function (b) {
      return b.kind === "event" || b.redeemBy === "audience";
    });
  }

  function venueBenefits() {
    return benefits.filter(function (b) {
      return b.kind === "venue" || b.redeemBy === "admin";
    });
  }

  function renderHome(pass) {
    renderVenues(pass);
    renderEventDropdown(pass);
    renderUsedEvents(pass);
  }

  function renderVenues(pass) {
    var list = $("venue-list");
    list.innerHTML = "";
    venueBenefits().forEach(function (b) {
      var state = (pass.slots && pass.slots[b.id]) || "open";
      var el = document.createElement("article");
      el.className = "benefit";
      var tag = document.createElement("p");
      tag.className = "tag";
      tag.textContent =
        state === "redeemed" ? "Venue · used" : "Venue · desk redeems";
      var h = document.createElement("h3");
      h.textContent = b.title;
      var p = document.createElement("p");
      p.className = "hint";
      p.textContent =
        state === "redeemed"
          ? "Already redeemed at desk"
          : b.blurb ||
            "Show this pass at the ticket desk. Staff will scan and disable this privilege.";
      el.appendChild(tag);
      el.appendChild(h);
      el.appendChild(p);
      list.appendChild(el);
    });
  }

  function renderEventDropdown(pass) {
    var select = $("event-select");
    var btn = $("rsvp-btn");
    var empty = $("rsvp-empty");
    var openEvents = eventBenefits().filter(function (b) {
      return ((pass.slots && pass.slots[b.id]) || "open") === "open";
    });

    select.innerHTML = "";
    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an event…";
    select.appendChild(placeholder);

    openEvents.forEach(function (b) {
      var opt = document.createElement("option");
      opt.value = b.id;
      var label = b.title || b.id;
      if (b.date) label += " · " + b.date;
      opt.textContent = label;
      select.appendChild(opt);
    });

    var hasOpen = openEvents.length > 0;
    select.disabled = !hasOpen;
    btn.disabled = true;
    UI.show(empty, !hasOpen);
    $("event-meta").textContent = "";
    updateEventMeta();
  }

  function updateEventMeta() {
    var id = $("event-select").value;
    var meta = $("event-meta");
    meta.textContent = "";
    if (!id) return;
    var b = null;
    for (var i = 0; i < benefits.length; i++) {
      if (benefits[i].id === id) {
        b = benefits[i];
        break;
      }
    }
    if (!b) return;
    if (b.blurb) meta.appendChild(document.createTextNode(b.blurb));
    if (b.link) {
      if (meta.childNodes.length) {
        meta.appendChild(document.createTextNode(" · "));
      }
      var a = document.createElement("a");
      a.href = b.link;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Event details";
      meta.appendChild(a);
    }
  }

  function renderUsedEvents(pass) {
    var wrap = $("used-events");
    var used = eventBenefits().filter(function (b) {
      return (pass.slots && pass.slots[b.id]) === "redeemed";
    });
    wrap.innerHTML = "";
    if (!used.length) {
      UI.show(wrap, false);
      return;
    }
    UI.show(wrap, true);
    var heading = document.createElement("h3");
    heading.textContent = "Already RSVP’d";
    wrap.appendChild(heading);
    used.forEach(function (b) {
      var el = document.createElement("article");
      el.className = "benefit";
      var tag = document.createElement("p");
      tag.className = "tag";
      tag.textContent = "Event · used";
      var h = document.createElement("h3");
      h.textContent = b.title;
      el.appendChild(tag);
      el.appendChild(h);
      wrap.appendChild(el);
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
        if (res.data.benefits) benefits = res.data.benefits;
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
