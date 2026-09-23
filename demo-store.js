/**
 * Parivar Pass v2 — demo store (Sheet-shaped, localStorage)
 */
window.ParivarDemo = (function () {
  var KEY = "appgust:parivar-v2:demo";
  /** In-memory OTP provision (mirrors Code.gs CacheService) */
  var otpStore = {};
  var otpTokens = {};

  function benefitIds() {
    return (window.PARIVAR_BENEFITS || []).map(function (b) {
      return b.id;
    });
  }

  function emptySlots() {
    var slots = {};
    benefitIds().forEach(function (id) {
      slots[id] = "open";
    });
    return slots;
  }

  function addMonths(isoDate, months) {
    var d = new Date(isoDate + "T12:00:00");
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function randomId() {
    var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var s = "PV2-";
    for (var i = 0; i < 10; i++) {
      s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return s;
  }

  function seed() {
    var gen = today();
    var months =
      (window.PARIVAR_CONFIG && window.PARIVAR_CONFIG.validityMonths) || 6;
    var until = addMonths(gen, months);
    return {
      passes: [
        {
          passId: "PV2-DEMOOPEN01",
          status: "unregistered",
          name: "",
          phone: "",
          email: "",
          generatedAt: gen,
          validUntil: until,
          slots: emptySlots(),
          notes: "Demo blank — first scan registers",
          registeredAt: "",
        },
        {
          passId: "PV2-DEMOACTIVE",
          status: "active",
          name: "Demo Bearer",
          phone: "9000000001",
          email: "",
          generatedAt: gen,
          validUntil: until,
          slots: emptySlots(),
          notes: "Already registered",
          registeredAt: new Date().toISOString(),
        },
      ],
      redemptions: [],
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) {
        var s = seed();
        save(s);
        return s;
      }
      return normalize(JSON.parse(raw));
    } catch (e) {
      var f = seed();
      save(f);
      return f;
    }
  }

  function normalize(data) {
    if (!data || !Array.isArray(data.passes)) {
      return seed();
    }
    if (!Array.isArray(data.redemptions)) data.redemptions = [];
    var byId = {};
    data.passes.forEach(function (p) {
      if (!p || !p.passId) return;
      p.passId = String(p.passId).toUpperCase();
      if (!p.slots) p.slots = emptySlots();
      benefitIds().forEach(function (id) {
        if (!p.slots[id]) p.slots[id] = "open";
      });
      byId[p.passId] = true;
    });
    // Keep demo fixtures available even after older stores.
    seed().passes.forEach(function (demo) {
      if (!byId[demo.passId]) data.passes.unshift(demo);
    });
    return data;
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function findPass(data, passId) {
    var id = String(passId || "").trim().toUpperCase();
    for (var i = 0; i < data.passes.length; i++) {
      if (String(data.passes[i].passId).toUpperCase() === id) {
        return data.passes[i];
      }
    }
    return null;
  }

  function enrich(pass) {
    if (!pass) return null;
    var copy = JSON.parse(JSON.stringify(pass));
    if (!copy.slots) copy.slots = emptySlots();
    benefitIds().forEach(function (id) {
      if (!copy.slots[id]) copy.slots[id] = "open";
    });
    var openCount = 0;
    Object.keys(copy.slots).forEach(function (k) {
      if (copy.slots[k] === "open") openCount++;
    });
    var expired = copy.validUntil && copy.validUntil < today();
    var exhausted = openCount === 0 && copy.status !== "unregistered";
    if (expired) {
      copy.effectiveStatus = "invalid";
      copy.invalidReason = "valid_date_passed";
    } else if (exhausted) {
      copy.effectiveStatus = "invalid";
      copy.invalidReason = "exhausted";
    } else {
      copy.effectiveStatus = copy.status;
      copy.invalidReason = "";
    }
    copy.openCount = openCount;
    return copy;
  }

  function ok(data) {
    return { ok: true, data: data };
  }
  function fail(message, code) {
    return { ok: false, error: message, code: code || "error" };
  }

  function checkPin(pin) {
    var expected =
      (window.PARIVAR_CONFIG && window.PARIVAR_CONFIG.adminPin) || "";
    return String(pin || "").trim() === String(expected).trim();
  }

  function benefitMeta(id) {
    var list = window.PARIVAR_BENEFITS || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function handle(action, payload) {
    var data = load();
    payload = payload || {};

    if (action === "getPass") {
      var p = enrich(findPass(data, payload.passId));
      if (!p) return fail("Pass not found", "not_found");
      return ok({ pass: p, benefits: window.PARIVAR_BENEFITS });
    }

    if (action === "listBenefits") {
      return ok({ benefits: window.PARIVAR_BENEFITS });
    }

    if (action === "requestOtp") {
      var phoneR = String(payload.phone || "").trim();
      var passR = findPass(data, payload.passId);
      if (!phoneR) return fail("Phone required", "validation");
      if (!passR) return fail("Pass not found", "not_found");
      if (passR.status !== "unregistered") {
        return fail("Already registered", "already_registered");
      }
      var code =
        "" + (100000 + Math.floor(Math.random() * 900000));
      var key = String(payload.passId).toUpperCase() + ":" + phoneR;
      otpStore[key] = { code: code, at: Date.now() };
      delete otpTokens[key];
      return ok({
        sent: false,
        channel: payload.channel || "sms",
        expiresInSec: 300,
        devCode: code,
      });
    }

    if (action === "verifyOtp") {
      var phoneV = String(payload.phone || "").trim();
      var keyV = String(payload.passId || "").toUpperCase() + ":" + phoneV;
      var entry = otpStore[keyV];
      if (!entry || String(payload.code || "").trim() !== entry.code) {
        return fail("Invalid or expired code", "otp");
      }
      if (Date.now() - entry.at > 300000) {
        delete otpStore[keyV];
        return fail("Invalid or expired code", "otp");
      }
      var tok = "tok-" + Math.random().toString(36).slice(2);
      otpTokens[keyV] = tok;
      delete otpStore[keyV];
      return ok({ otpToken: tok });
    }

    if (action === "register") {
      var pass = findPass(data, payload.passId);
      if (!pass) return fail("Pass not found", "not_found");
      var en = enrich(pass);
      if (en.effectiveStatus === "invalid") return fail("Pass is invalid", "invalid");
      if (pass.status !== "unregistered") {
        return fail("Already registered to first bearer", "already_registered");
      }
      if (!payload.name || !payload.phone) {
        return fail("Name and phone required", "validation");
      }
      if (payload.requireOtp) {
        var keyReg =
          String(payload.passId).toUpperCase() +
          ":" +
          String(payload.phone).trim();
        if (!payload.otpToken || otpTokens[keyReg] !== payload.otpToken) {
          return fail("Phone verification required", "otp");
        }
        delete otpTokens[keyReg];
      }
      pass.name = String(payload.name).trim();
      pass.phone = String(payload.phone).trim();
      pass.email = String(payload.email || "").trim();
      pass.status = "active";
      pass.registeredAt = new Date().toISOString();
      save(data);
      return ok({ pass: enrich(pass) });
    }

    if (action === "rsvp") {
      var passR = findPass(data, payload.passId);
      if (!passR) return fail("Pass not found", "not_found");
      var er = enrich(passR);
      if (er.effectiveStatus === "invalid") {
        return fail(
          er.invalidReason === "valid_date_passed"
            ? "Pass expired"
            : "All privileges used",
          "invalid"
        );
      }
      if (passR.status !== "active") {
        return fail("Register before using privileges", "not_registered");
      }
      var meta = benefitMeta(payload.benefitId);
      if (!meta) return fail("Unknown benefit", "bad_benefit");
      if (meta.redeemBy !== "audience") {
        return fail(
          "Show this pass at the venue ticket desk. Staff will disable this privilege.",
          "desk_only"
        );
      }
      if (passR.slots[payload.benefitId] !== "open") {
        return fail("Already used", "already_used");
      }
      passR.slots[payload.benefitId] = "redeemed";
      data.redemptions.push({
        at: new Date().toISOString(),
        passId: passR.passId,
        benefitId: payload.benefitId,
        by: "audience",
        name: passR.name,
      });
      save(data);
      return ok({
        pass: enrich(passR),
        benefit: meta,
        message: "RSVP recorded. Show this screen at the registration desk.",
      });
    }

    if (action === "adminLookup") {
      if (!checkPin(payload.pin)) return fail("Wrong admin PIN", "auth");
      // Unlock probe from print/admin UI — PIN already verified above
      if (String(payload.passId || "") === "__pin_check__") {
        return ok({ verified: true });
      }
      var pa = enrich(findPass(data, payload.passId));
      if (!pa) return fail("Pass not found", "not_found");
      var history = data.redemptions.filter(function (r) {
        return String(r.passId).toUpperCase() === String(pa.passId).toUpperCase();
      });
      return ok({
        pass: pa,
        redemptions: history,
        benefits: window.PARIVAR_BENEFITS,
      });
    }

    if (action === "adminRedeem") {
      if (!checkPin(payload.pin)) return fail("Wrong admin PIN", "auth");
      var pu = findPass(data, payload.passId);
      if (!pu) return fail("Pass not found", "not_found");
      var eu = enrich(pu);
      if (eu.effectiveStatus === "invalid" && eu.invalidReason === "valid_date_passed") {
        return fail("Pass expired", "invalid");
      }
      if (pu.status === "unregistered") {
        return fail("Pass not registered yet", "not_registered");
      }
      var bm = benefitMeta(payload.benefitId);
      if (!bm) return fail("Unknown benefit", "bad_benefit");
      if (pu.slots[payload.benefitId] !== "open") {
        return fail("Already disabled / used", "already_used");
      }
      pu.slots[payload.benefitId] = "redeemed";
      data.redemptions.push({
        at: new Date().toISOString(),
        passId: pu.passId,
        benefitId: payload.benefitId,
        by: "admin",
        name: pu.name,
      });
      save(data);
      return ok({
        pass: enrich(pu),
        benefit: bm,
        message: "Privilege disabled for further use.",
      });
    }

    if (action === "adminUpdate") {
      if (!checkPin(payload.pin)) return fail("Wrong admin PIN", "auth");
      var ped = findPass(data, payload.passId);
      if (!ped) return fail("Pass not found", "not_found");
      ["name", "phone", "email", "notes"].forEach(function (f) {
        if (payload[f] != null && payload[f] !== "") {
          ped[f] = String(payload[f]).trim();
        }
      });
      save(data);
      return ok({ pass: enrich(ped) });
    }

    if (action === "issueBatch") {
      if (!checkPin(payload.pin)) return fail("Wrong admin PIN", "auth");
      var qty = Math.max(1, Math.min(210, Number(payload.quantity) || 1));
      var gen = today();
      var months =
        (window.PARIVAR_CONFIG && window.PARIVAR_CONFIG.validityMonths) || 6;
      var until = addMonths(gen, months);
      var created = [];
      for (var i = 0; i < qty; i++) {
        var id = randomId();
        while (findPass(data, id)) id = randomId();
        var neu = {
          passId: id,
          status: "unregistered",
          name: "",
          phone: "",
          email: "",
          generatedAt: gen,
          validUntil: until,
          slots: emptySlots(),
          notes: payload.notes || "Batch " + gen,
          registeredAt: "",
        };
        data.passes.push(neu);
        created.push(enrich(neu));
      }
      save(data);
      return ok({
        passes: created,
        generatedAt: gen,
        validUntil: until,
        quantity: qty,
        batchId: "BAT-DEMO",
        vault: null,
      });
    }

    if (action === "adminAssign") {
      if (!checkPin(payload.pin)) return fail("Wrong admin PIN", "auth");
      var target;
      if (payload.passId) {
        target = findPass(data, payload.passId);
        if (!target) return fail("Pass not found", "not_found");
      } else {
        target = null;
        for (var ai = 0; ai < data.passes.length; ai++) {
          var cand = data.passes[ai];
          if (cand.status !== "unregistered") continue;
          if (cand.validUntil && cand.validUntil < today()) continue;
          target = cand;
          break;
        }
        if (!target) return fail("No unregistered passes available", "none_available");
      }
      var ea = enrich(target);
      if (ea.effectiveStatus === "invalid") {
        return fail(ea.invalidReason === "valid_date_passed" ? "Pass expired" : "Pass exhausted", "invalid");
      }
      if (target.status !== "unregistered") return fail("Pass already registered", "already_registered");
      if (!payload.name) return fail("Name required", "validation");
      target.name = String(payload.name).trim();
      target.phone = String(payload.phone || "").trim();
      target.email = String(payload.email || "").trim();
      if (payload.notes) target.notes = String(payload.notes).trim();
      target.status = "active";
      target.registeredAt = new Date().toISOString();
      save(data);
      return ok({ pass: enrich(target) });
    }

    if (action === "listBatches") {
      if (!checkPin(payload.pin)) return fail("Wrong admin PIN", "auth");
      return ok({ batches: [], vaultUrl: "" });
    }

    if (action === "listPasses") {
      if (!checkPin(payload.pin)) return fail("Wrong admin PIN", "auth");
      var slim = data.passes.map(function (row) {
        var p = enrich(row);
        return {
          passId: p.passId,
          status: p.status,
          name: p.name,
          phone: p.phone,
          email: p.email,
          generatedAt: p.generatedAt,
          validUntil: p.validUntil,
          notes: p.notes,
          qrUrl: "",
          qrSvgFile: "",
          batchId: "",
          vaultFolder: "",
          effectiveStatus: p.effectiveStatus,
        };
      });
      return ok({ passes: slim, count: slim.length });
    }

    if (action === "resetDemo") {
      localStorage.removeItem(KEY);
      return ok({ reset: true });
    }

    return fail("Unknown action", "unknown");
  }

  return { handle: handle };
})();
