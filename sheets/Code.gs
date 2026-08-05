/**
 * Parivar Pass v2 — Google Apps Script
 *
 * Sheet tabs: Passes | Redemptions | Config
 * Passes columns:
 * passId, status, name, phone, email, generatedAt, validUntil, notes, registeredAt,
 * parsec_jayanagar, whitefield_40, event_01, event_02, event_03, event_04
 * (slot columns: open | redeemed)
 *
 * Script property: ADMIN_PIN
 * Deploy as Web App → Anyone → paste URL into config.js (mode: "sheets")
 */

var PASSES = "Passes";
var REDEMPTIONS = "Redemptions";
var SLOT_COLS = [
  "parsec_jayanagar",
  "whitefield_40",
  "event_01",
  "event_02",
  "event_03",
  "event_04",
];
var AUDIENCE_SLOTS = {
  event_01: true,
  event_02: true,
  event_03: true,
  event_04: true,
};

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || "{}");
    return json_(dispatch(body.action, body));
  } catch (err) {
    return json_({ ok: false, error: String(err), code: "exception" });
  }
}

function doGet() {
  return json_({ ok: true, data: { service: "parivar-pass-v2" } });
}

function dispatch(action, p) {
  if (action === "getPass") return getPass_(p.passId);
  if (action === "listBenefits") return ok_({ benefits: benefits_() });
  if (action === "register") return register_(p);
  if (action === "rsvp") return rsvp_(p);
  if (action === "adminLookup") {
    if (!pinOk_(p.pin)) return fail_("Wrong admin PIN", "auth");
    return adminLookup_(p.passId);
  }
  if (action === "adminRedeem") {
    if (!pinOk_(p.pin)) return fail_("Wrong admin PIN", "auth");
    return adminRedeem_(p);
  }
  if (action === "adminUpdate") {
    if (!pinOk_(p.pin)) return fail_("Wrong admin PIN", "auth");
    return adminUpdate_(p);
  }
  if (action === "issueBatch") {
    if (!pinOk_(p.pin)) return fail_("Wrong admin PIN", "auth");
    return issueBatch_(p);
  }
  return fail_("Unknown action", "unknown");
}

function benefits_() {
  return [
    { id: "parsec_jayanagar", title: "Parsec · Jayanagar", blurb: "Free entry", kind: "venue", redeemBy: "admin" },
    { id: "whitefield_40", title: "Whitefield", blurb: "40% discount", kind: "venue", redeemBy: "admin" },
    { id: "event_01", title: "Param Event 01", blurb: "40% discount", kind: "event", redeemBy: "audience" },
    { id: "event_02", title: "Param Event 02", blurb: "40% discount", kind: "event", redeemBy: "audience" },
    { id: "event_03", title: "Param Event 03", blurb: "40% discount", kind: "event", redeemBy: "audience" },
    { id: "event_04", title: "Param Event 04", blurb: "40% discount", kind: "event", redeemBy: "audience" },
  ];
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}
function sheet_(n) {
  var sh = ss_().getSheetByName(n);
  if (!sh) throw new Error("Missing tab: " + n);
  return sh;
}

function rows_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) {
    return String(h).trim();
  });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    if (!values[r][0]) continue;
    var o = { __row: r + 1 };
    for (var c = 0; c < headers.length; c++) o[headers[c]] = values[r][c];
    out.push(o);
  }
  return out;
}

function headers_(sh) {
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < h.length; i++) map[String(h[i]).trim()] = i + 1;
  return map;
}

function set_(sh, row, headers, key, val) {
  if (!headers[key]) throw new Error("Missing column " + key);
  sh.getRange(row, headers[key]).setValue(val);
}

function findPass_(passId) {
  var id = String(passId || "").trim().toUpperCase();
  var rows = rows_(PASSES);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].passId).toUpperCase() === id) return rows[i];
  }
  return null;
}

function fmtDate_(v) {
  if (!v) return "";
  return Utilities.formatDate(new Date(v), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function enrich_(row) {
  var slots = {};
  SLOT_COLS.forEach(function (k) {
    slots[k] = String(row[k] || "open").toLowerCase() === "redeemed" ? "redeemed" : "open";
  });
  var openCount = 0;
  Object.keys(slots).forEach(function (k) {
    if (slots[k] === "open") openCount++;
  });
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var validUntil = fmtDate_(row.validUntil);
  var expired = validUntil && validUntil < today;
  var status = String(row.status || "unregistered");
  var exhausted = openCount === 0 && status !== "unregistered";
  var effective = status;
  var reason = "";
  if (expired) {
    effective = "invalid";
    reason = "valid_date_passed";
  } else if (exhausted) {
    effective = "invalid";
    reason = "exhausted";
  }
  return {
    passId: String(row.passId),
    status: status,
    name: String(row.name || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    generatedAt: fmtDate_(row.generatedAt),
    validUntil: validUntil,
    notes: String(row.notes || ""),
    registeredAt: String(row.registeredAt || ""),
    slots: slots,
    openCount: openCount,
    effectiveStatus: effective,
    invalidReason: reason,
  };
}

function getPass_(passId) {
  var row = findPass_(passId);
  if (!row) return fail_("Pass not found", "not_found");
  return ok_({ pass: enrich_(row), benefits: benefits_() });
}

function register_(p) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var pass = enrich_(row);
  if (pass.effectiveStatus === "invalid") return fail_("Pass is invalid", "invalid");
  if (pass.status !== "unregistered") return fail_("Already registered", "already_registered");
  if (!p.name || !p.phone) return fail_("Name and phone required", "validation");
  var sh = sheet_(PASSES);
  var h = headers_(sh);
  set_(sh, row.__row, h, "name", String(p.name).trim());
  set_(sh, row.__row, h, "phone", String(p.phone).trim());
  set_(sh, row.__row, h, "email", String(p.email || "").trim());
  set_(sh, row.__row, h, "status", "active");
  set_(sh, row.__row, h, "registeredAt", new Date().toISOString());
  return getPass_(p.passId);
}

function rsvp_(p) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var pass = enrich_(row);
  if (pass.effectiveStatus === "invalid") return fail_("Pass invalid", "invalid");
  if (pass.status !== "active") return fail_("Register first", "not_registered");
  if (!AUDIENCE_SLOTS[p.benefitId]) {
    return fail_("Show pass at venue desk for staff to redeem.", "desk_only");
  }
  if (pass.slots[p.benefitId] !== "open") return fail_("Already used", "already_used");
  var sh = sheet_(PASSES);
  var h = headers_(sh);
  set_(sh, row.__row, h, p.benefitId, "redeemed");
  sheet_(REDEMPTIONS).appendRow([
    new Date().toISOString(),
    pass.passId,
    p.benefitId,
    "audience",
    pass.name,
  ]);
  var updated = getPass_(p.passId);
  return ok_({
    pass: updated.data.pass,
    benefit: benefits_().filter(function (b) {
      return b.id === p.benefitId;
    })[0],
    message: "RSVP recorded. Show this at the registration desk.",
  });
}

function adminLookup_(passId) {
  if (String(passId || "") === "__pin_check__") {
    return ok_({ verified: true });
  }
  var g = getPass_(passId);
  if (!g.ok) return g;
  var hist = rows_(REDEMPTIONS)
    .filter(function (r) {
      return String(r.passId).toUpperCase() === String(passId).toUpperCase();
    })
    .map(function (r) {
      return {
        at: String(r.at),
        passId: String(r.passId),
        benefitId: String(r.benefitId || r.eventId || ""),
        by: String(r.by || ""),
        name: String(r.name || ""),
      };
    });
  return ok_({ pass: g.data.pass, redemptions: hist, benefits: benefits_() });
}

function adminRedeem_(p) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var pass = enrich_(row);
  if (pass.invalidReason === "valid_date_passed") return fail_("Pass expired", "invalid");
  if (pass.status === "unregistered") return fail_("Not registered", "not_registered");
  if (pass.slots[p.benefitId] !== "open") return fail_("Already disabled", "already_used");
  var sh = sheet_(PASSES);
  var h = headers_(sh);
  set_(sh, row.__row, h, p.benefitId, "redeemed");
  sheet_(REDEMPTIONS).appendRow([
    new Date().toISOString(),
    pass.passId,
    p.benefitId,
    "admin",
    pass.name,
  ]);
  var updated = getPass_(p.passId);
  return ok_({
    pass: updated.data.pass,
    message: "Privilege disabled for further use.",
  });
}

function adminUpdate_(p) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var sh = sheet_(PASSES);
  var h = headers_(sh);
  ["name", "phone", "email", "notes"].forEach(function (f) {
    if (p[f] != null && p[f] !== "") set_(sh, row.__row, h, f, String(p[f]).trim());
  });
  return getPass_(p.passId);
}

function issueBatch_(p) {
  var qty = Math.max(1, Math.min(210, Number(p.quantity) || 1));
  var gen = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var d = new Date();
  d.setMonth(d.getMonth() + 6);
  var until = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var sh = sheet_(PASSES);
  var created = [];
  for (var i = 0; i < qty; i++) {
    var id = "PV2-" + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
    sh.appendRow([
      id,
      "unregistered",
      "",
      "",
      "",
      gen,
      until,
      p.notes || "",
      "",
      "open",
      "open",
      "open",
      "open",
      "open",
      "open",
    ]);
    created.push(enrich_(findPass_(id)));
  }
  return ok_({ passes: created, generatedAt: gen, validUntil: until, quantity: qty });
}

function pinOk_(pin) {
  var expected = PropertiesService.getScriptProperties().getProperty("ADMIN_PIN") || "";
  return expected && String(pin || "").trim() === String(expected).trim();
}

function ok_(data) {
  return { ok: true, data: data };
}
function fail_(m, c) {
  return { ok: false, error: m, code: c || "error" };
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(
    ContentService.MimeType.JSON
  );
}
