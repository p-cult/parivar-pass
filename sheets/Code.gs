/**
 * Parivar Pass v2 — Google Apps Script
 *
 * Sheet tabs: passes | events
 * (optional Redemptions log — not required; used/unused is on passes event_01… columns)
 *
 * passes + events layout:
 *   Row 10 = headers
 *   Row 11+ = data (rows 1–9 free for title / notes)
 *
 * passes columns:
 * passId, qrUrl, qrSvg (SVG markup for that pass QR), qrSvgFile (optional Drive link),
 * status, name, phone, email, generatedAt, validUntil, notes, registeredAt,
 * parsec_jayanagar, whitefield_40, plus one column per events!Event Code (open | redeemed)
 * Which events are used is determined ONLY by those event_01… columns (open vs redeemed).
 *
 * events columns (row 10):
 * Event List | Event Code | Event Date | Event link
 * Event Code must match the pass slot column header (e.g. event_01).
 * Audience UI titles/dates/links are read from this tab.
 *
 * Script properties: ADMIN_PIN; optional PUBLIC_BASE_URL for qrUrl
 * OTP: set OTP_ENABLED=true to enforce; wire sendOtpSms_ later.
 * Deploy as Web App → Anyone → paste URL into config.js (mode: "sheets")
 */

var PASSES = "passes";
var EVENTS = "events";
var REDEMPTIONS = "Redemptions";
var HEADER_ROW_10 = 10;
var DATA_START_11 = 11;
var PASSES_HEADER_ROW = HEADER_ROW_10;
var PASSES_DATA_START = DATA_START_11;
var REDEMPTIONS_HEADER_ROW = 1;
var VENUE_COLS = ["parsec_jayanagar", "whitefield_40"];
var FALLBACK_EVENT_CODES = ["event_01", "event_02", "event_03", "event_04"];

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
  if (action === "requestOtp") return requestOtp_(p);
  if (action === "verifyOtp") return verifyOtp_(p);
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
  if (action === "adminAssign") {
    if (!pinOk_(p.pin)) return fail_("Wrong admin PIN", "auth");
    return adminAssign_(p);
  }
  if (action === "listBatches") {
    if (!pinOk_(p.pin)) return fail_("Wrong admin PIN", "auth");
    return listBatches_();
  }
  if (action === "listPasses") {
    if (!pinOk_(p.pin)) return fail_("Wrong admin PIN", "auth");
    return listPasses_();
  }
  return fail_("Unknown action", "unknown");
}

function pick_(row, names) {
  var i;
  for (i = 0; i < names.length; i++) {
    if (row[names[i]] != null && String(row[names[i]]).trim() !== "") {
      return row[names[i]];
    }
  }
  var keys = Object.keys(row);
  for (i = 0; i < names.length; i++) {
    var want = String(names[i]).toLowerCase();
    for (var k = 0; k < keys.length; k++) {
      if (
        String(keys[k]).toLowerCase() === want &&
        String(row[keys[k]]).trim() !== ""
      ) {
        return row[keys[k]];
      }
    }
  }
  return "";
}

function fmtDate_(v) {
  if (!v) return "";
  return Utilities.formatDate(new Date(v), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

/**
 * Catalog from events tab (row 10 headers / row 11+ data).
 * Memoized per execution — getPass_/enrich_/benefits_ each call this, and
 * without caching that meant re-reading the events sheet 2-3x per request.
 */
var EVENT_CATALOG_CACHE_ = null;
function eventCatalog_() {
  if (EVENT_CATALOG_CACHE_) return EVENT_CATALOG_CACHE_;
  EVENT_CATALOG_CACHE_ = eventCatalogUncached_();
  return EVENT_CATALOG_CACHE_;
}

function eventCatalogUncached_() {
  var rows;
  try {
    rows = rows_(EVENTS);
  } catch (err) {
    rows = null;
  }
  if (!rows || !rows.length) {
    return FALLBACK_EVENT_CODES.map(function (code, idx) {
      return {
        id: code,
        title: "Param Event 0" + (idx + 1),
        blurb: "40% discount",
        date: "",
        link: "",
        kind: "event",
        redeemBy: "audience",
      };
    });
  }
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var title = String(pick_(r, ["Event List", "event list", "title", "name"])).trim();
    var code = String(pick_(r, ["Event Code", "event code", "code", "id"])).trim();
    if (!code && title) code = "event_" + ("0" + (out.length + 1)).slice(-2);
    if (!code) continue;
    if (!title) title = code;
    var dateRaw = pick_(r, ["Event Date", "event date", "date"]);
    var date = dateRaw ? fmtDate_(dateRaw) || String(dateRaw).trim() : "";
    var link = String(pick_(r, ["Event link", "event link", "link", "url"])).trim();
    var blurb = date ? "40% discount · " + date : "40% discount";
    out.push({
      id: code,
      title: title,
      blurb: blurb,
      date: date,
      link: link,
      kind: "event",
      redeemBy: "audience",
    });
  }
  return out.length
    ? out
    : FALLBACK_EVENT_CODES.map(function (code, idx) {
        return {
          id: code,
          title: "Param Event 0" + (idx + 1),
          blurb: "40% discount",
          date: "",
          link: "",
          kind: "event",
          redeemBy: "audience",
        };
      });
}

function eventCodes_() {
  return eventCatalog_().map(function (e) {
    return e.id;
  });
}

function slotCols_() {
  return VENUE_COLS.concat(eventCodes_());
}

function isAudienceSlot_(benefitId) {
  var codes = eventCodes_();
  for (var i = 0; i < codes.length; i++) {
    if (codes[i] === benefitId) return true;
  }
  return false;
}

function benefits_() {
  return [
    {
      id: "parsec_jayanagar",
      title: "Parsec · Jayanagar",
      blurb: "Free entry",
      kind: "venue",
      redeemBy: "admin",
    },
    {
      id: "whitefield_40",
      title: "Whitefield",
      blurb: "40% discount",
      kind: "venue",
      redeemBy: "admin",
    },
  ].concat(eventCatalog_());
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}
/** Resolve tab by exact name, then case-insensitive match. */
function sheet_(n) {
  var ss = ss_();
  var sh = ss.getSheetByName(n);
  if (sh) return sh;
  var want = String(n).toLowerCase();
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].getName()).toLowerCase() === want) return all[i];
  }
  throw new Error("Missing tab: " + n);
}

function headerRowFor_(name) {
  var n = String(name).toLowerCase();
  if (n === "passes" || n === "events") return HEADER_ROW_10;
  return REDEMPTIONS_HEADER_ROW;
}

function rows_(name) {
  var sh = sheet_(name);
  var headerRow = headerRowFor_(name);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1 || lastRow < headerRow) return [];
  var headers = sh
    .getRange(headerRow, 1, headerRow, lastCol)
    .getValues()[0]
    .map(function (h) {
      return String(h).trim();
    });
  var out = [];
  if (lastRow < headerRow + 1) return out;
  var data = sh.getRange(headerRow + 1, 1, lastRow, lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    var empty = true;
    for (var c0 = 0; c0 < data[i].length; c0++) {
      if (data[i][c0] !== "" && data[i][c0] != null) {
        empty = false;
        break;
      }
    }
    if (empty) continue;
    var o = { __row: headerRow + 1 + i };
    for (var c = 0; c < headers.length; c++) o[headers[c]] = data[i][c];
    out.push(o);
  }
  return out;
}

function headers_(sh, headerRow) {
  headerRow = headerRow || 1;
  var lastCol = Math.max(1, sh.getLastColumn());
  var h = sh.getRange(headerRow, 1, headerRow, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < h.length; i++) {
    var key = String(h[i]).trim();
    if (key) map[key] = i + 1;
  }
  return map;
}

function passesHeaders_(sh) {
  return headers_(sh, PASSES_HEADER_ROW);
}

/** Next empty pass row (never above PASSES_DATA_START). */
function nextPassRow_(sh) {
  var last = sh.getLastRow();
  if (last < PASSES_DATA_START) return PASSES_DATA_START;
  return last + 1;
}

function set_(sh, row, headers, key, val) {
  if (!headers[key]) throw new Error("Missing column " + key);
  sh.getRange(row, headers[key]).setValue(val);
}

/**
 * Locate one pass row by passId WITHOUT reading every column of every row —
 * each row carries several KB of inline QR SVG text, so pulling the full
 * sheet (rows_(PASSES)) just to match one passId got slower and slower as
 * the sheet grew. Instead: read only the passId column across all rows to
 * find the row number, then fetch just that single row's full data.
 */
function findPass_(passId) {
  var id = String(passId || "").trim().toUpperCase();
  var sh = sheet_(PASSES);
  var headerRow = PASSES_HEADER_ROW;
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1 || lastRow < headerRow + 1) return null;
  var headerNames = sh
    .getRange(headerRow, 1, 1, lastCol)
    .getValues()[0]
    .map(function (h) {
      return String(h).trim();
    });
  var passIdCol = headerNames.indexOf("passId") + 1;
  if (!passIdCol) return null;
  var ids = sh.getRange(headerRow + 1, passIdCol, lastRow - headerRow, 1).getValues();
  var rowNum = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim().toUpperCase() === id) {
      rowNum = headerRow + 1 + i;
      break;
    }
  }
  if (rowNum < 0) return null;
  var rowVals = sh.getRange(rowNum, 1, 1, lastCol).getValues()[0];
  var o = { __row: rowNum };
  for (var c = 0; c < headerNames.length; c++) o[headerNames[c]] = rowVals[c];
  return o;
}

function enrich_(row) {
  var slots = {};
  slotCols_().forEach(function (k) {
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
    qrUrl: String(row.qrUrl || ""),
    // qrSvg deliberately omitted: nothing in audience.js/admin.js/assign.js
    // reads it, but it's several KB of raw SVG per row — needless payload on
    // every single lookup over (often slow) mobile connections. issueBatch_
    // re-attaches it explicitly for the one place that actually needs it.
    qrSvgFile: String(row.qrSvgFile || ""),
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
  if (otpRequired_(p)) {
    var gate = assertOtpToken_(p.phone, p.passId, p.otpToken);
    if (!gate.ok) return gate;
  }
  var sh = sheet_(PASSES);
  var h = passesHeaders_(sh);
  set_(sh, row.__row, h, "name", String(p.name).trim());
  set_(sh, row.__row, h, "phone", String(p.phone).trim());
  set_(sh, row.__row, h, "email", String(p.email || "").trim());
  set_(sh, row.__row, h, "status", "active");
  set_(sh, row.__row, h, "registeredAt", new Date().toISOString());
  clearOtpKeys_(p.phone, p.passId);
  return getPass_(p.passId);
}

/**
 * OTP provision — enable with Script property OTP_ENABLED=true
 * (and config.js otpEnabled: true). Wire sendOtpSms_ / sendOtpEmail_ later.
 */
function otpEnforced_() {
  return PropertiesService.getScriptProperties().getProperty("OTP_ENABLED") === "true";
}

function otpRequired_(p) {
  return otpEnforced_() || !!p.requireOtp;
}

function otpDevMode_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty("OTP_DEV_MODE") === "true") return true;
  // Until an SMS provider is wired, always return a dev code so the flow is testable.
  return true;
}

function otpCacheKey_(phone, passId) {
  return "otp:" + String(passId || "").toUpperCase() + ":" + String(phone || "").trim();
}

function otpTokenKey_(phone, passId) {
  return "otpTok:" + String(passId || "").toUpperCase() + ":" + String(phone || "").trim();
}

function clearOtpKeys_(phone, passId) {
  var cache = CacheService.getScriptCache();
  cache.remove(otpCacheKey_(phone, passId));
  cache.remove(otpTokenKey_(phone, passId));
}

/** Stub — plug Twilio / MSG91 / etc. Return true if message was sent. */
function sendOtpSms_(phone, code) {
  // TODO: wire SMS provider. Example:
  // UrlFetchApp.fetch(providerUrl, { method: "post", payload: { to: phone, body: "Parivar Pass code: " + code } });
  return false;
}

/** Stub — optional email channel. */
function sendOtpEmail_(email, code) {
  // TODO: MailApp.sendEmail(email, "Parivar Pass code", "Your code is " + code);
  return false;
}

function requestOtp_(p) {
  var phone = String(p.phone || "").trim();
  var passId = String(p.passId || "").trim();
  if (!phone) return fail_("Phone required", "validation");
  if (!passId) return fail_("Pass ID required", "validation");
  var row = findPass_(passId);
  if (!row) return fail_("Pass not found", "not_found");
  if (String(row.status || "unregistered") !== "unregistered") {
    return fail_("Already registered", "already_registered");
  }
  var code = String(100000 + Math.floor(Math.random() * 900000));
  CacheService.getScriptCache().put(otpCacheKey_(phone, passId), code, 300);
  var channel = String(p.channel || "sms").toLowerCase();
  var sent = false;
  if (channel === "email") {
    sent = sendOtpEmail_(String(p.email || "").trim(), code);
  } else {
    sent = sendOtpSms_(phone, code);
  }
  var data = { sent: !!sent, channel: channel, expiresInSec: 300 };
  if (otpDevMode_()) data.devCode = code;
  return ok_(data);
}

function verifyOtp_(p) {
  var phone = String(p.phone || "").trim();
  var passId = String(p.passId || "").trim();
  var code = String(p.code || "").trim();
  if (!phone || !passId || !code) return fail_("Phone, pass, and code required", "validation");
  var expected = CacheService.getScriptCache().get(otpCacheKey_(phone, passId));
  if (!expected || expected !== code) return fail_("Invalid or expired code", "otp");
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(otpTokenKey_(phone, passId), token, 600);
  CacheService.getScriptCache().remove(otpCacheKey_(phone, passId));
  return ok_({ otpToken: token });
}

function assertOtpToken_(phone, passId, token) {
  token = String(token || "").trim();
  if (!token) return fail_("Phone verification required", "otp");
  var expected = CacheService.getScriptCache().get(otpTokenKey_(phone, passId));
  if (!expected || expected !== token) return fail_("Phone verification expired — request a new code", "otp");
  return ok_({});
}

function rsvp_(p) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var pass = enrich_(row);
  if (pass.effectiveStatus === "invalid") return fail_("Pass invalid", "invalid");
  if (pass.status !== "active") return fail_("Register first", "not_registered");
  if (!isAudienceSlot_(p.benefitId)) {
    return fail_("Show pass at venue desk for staff to redeem.", "desk_only");
  }
  if (pass.slots[p.benefitId] !== "open") return fail_("Already used", "already_used");
  var sh = sheet_(PASSES);
  var h = passesHeaders_(sh);
  // Source of truth: event_01… / venue column on this pass row
  set_(sh, row.__row, h, p.benefitId, "redeemed");
  logRedemptionOptional_(pass.passId, p.benefitId, "audience", pass.name);
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
  // History from passes columns (event_01… / venues = redeemed), not a separate tab
  var hist = [];
  var pass = g.data.pass;
  var slots = pass.slots || {};
  Object.keys(slots).forEach(function (id) {
    if (slots[id] === "redeemed") {
      hist.push({
        at: "",
        passId: pass.passId,
        benefitId: id,
        by: "",
        name: pass.name || "",
      });
    }
  });
  return ok_({ pass: pass, redemptions: hist, benefits: benefits_() });
}

function adminRedeem_(p) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var pass = enrich_(row);
  if (pass.invalidReason === "valid_date_passed") return fail_("Pass expired", "invalid");
  if (pass.status === "unregistered") return fail_("Not registered", "not_registered");
  if (pass.slots[p.benefitId] !== "open") return fail_("Already disabled", "already_used");
  var sh = sheet_(PASSES);
  var h = passesHeaders_(sh);
  set_(sh, row.__row, h, p.benefitId, "redeemed");
  logRedemptionOptional_(pass.passId, p.benefitId, "admin", pass.name);
  var updated = getPass_(p.passId);
  return ok_({
    pass: updated.data.pass,
    message: "Privilege disabled for further use.",
  });
}

/** Optional extra log tab — ignore if missing. Pass columns are authoritative. */
function logRedemptionOptional_(passId, benefitId, by, name) {
  try {
    sheet_(REDEMPTIONS).appendRow([
      new Date().toISOString(),
      passId,
      benefitId,
      by,
      name || "",
    ]);
  } catch (err) {
    /* Redemptions tab not required */
  }
}

/**
 * Find the first still-unregistered, non-expired pass row in sheet order.
 * Used by adminAssign_ when the caller doesn't pin a specific passId.
 */
function nextUnregisteredRow_() {
  var rows = rows_(PASSES);
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.status || "unregistered") !== "unregistered") continue;
    var until = fmtDate_(r.validUntil);
    if (until && until < today) continue;
    return r;
  }
  return null;
}

/**
 * Bulk/staff assignment: takes an existing unregistered pass (auto-picked in
 * sheet order, or a specific passId) and fills in the bearer's name/phone/
 * email as if they had registered themselves — skips OTP, sets status
 * "active" and registeredAt now. Used for handing out passes already
 * printed/minted to specific people after the fact.
 */
function adminAssign_(p) {
  var row = p.passId ? findPass_(p.passId) : nextUnregisteredRow_();
  if (!row) {
    return fail_(
      p.passId ? "Pass not found" : "No unregistered passes available",
      p.passId ? "not_found" : "none_available"
    );
  }
  var pass = enrich_(row);
  if (pass.effectiveStatus === "invalid") {
    return fail_(
      pass.invalidReason === "valid_date_passed" ? "Pass expired" : "Pass exhausted",
      "invalid"
    );
  }
  if (pass.status !== "unregistered") return fail_("Pass already registered", "already_registered");
  if (!p.name) return fail_("Name required", "validation");
  var sh = sheet_(PASSES);
  var h = passesHeaders_(sh);
  set_(sh, row.__row, h, "name", String(p.name).trim());
  set_(sh, row.__row, h, "phone", String(p.phone || "").trim());
  set_(sh, row.__row, h, "email", String(p.email || "").trim());
  if (p.notes) set_(sh, row.__row, h, "notes", String(p.notes).trim());
  set_(sh, row.__row, h, "status", "active");
  set_(sh, row.__row, h, "registeredAt", new Date().toISOString());
  return getPass_(String(row.passId));
}

function adminUpdate_(p) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var sh = sheet_(PASSES);
  var h = passesHeaders_(sh);
  ["name", "phone", "email", "notes"].forEach(function (f) {
    if (p[f] != null && p[f] !== "") set_(sh, row.__row, h, f, String(p[f]).trim());
  });
  return getPass_(p.passId);
}

function audienceUrl_(passId) {
  var base =
    PropertiesService.getScriptProperties().getProperty("PUBLIC_BASE_URL") ||
    "https://p-cult.github.io/parivar-pass/audience.html";
  base = String(base).trim();
  var join = base.indexOf("?") >= 0 ? "&" : "?";
  return base + join + "pass=" + encodeURIComponent(String(passId).trim());
}

/** Fetch QR as SVG markup encoding payloadUrl. */
function fetchQrSvg_(payloadUrl) {
  var api =
    "https://api.qrserver.com/v1/create-qr-code/?size=240x240&ecc=M&margin=0&format=svg&data=" +
    encodeURIComponent(String(payloadUrl));
  var res = UrlFetchApp.fetch(api, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) {
    throw new Error("QR SVG fetch failed HTTP " + res.getResponseCode());
  }
  var svg = res.getContentText();
  if (!svg || svg.indexOf("<svg") < 0) {
    throw new Error("QR SVG response was empty or invalid");
  }
  return svg;
}

function qrFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("QR_FOLDER_ID");
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      /* recreate below */
    }
  }
  var name = "Parivar Pass QR";
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty("QR_FOLDER_ID", folder.getId());
  return folder;
}

/** Root Drive folder for minted batch vaults. */
function vaultRoot_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("VAULT_FOLDER_ID");
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      /* recreate */
    }
  }
  var name = "Parivar Pass Vault";
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  props.setProperty("VAULT_FOLDER_ID", folder.getId());
  return folder;
}

/**
 * Create/replace Drive file {passId}.svg and return { svg, fileUrl, fileId }.
 * Optional folder overrides default QR folder.
 */
function storePassQrSvg_(passId, payloadUrl, folder) {
  var svg = fetchQrSvg_(payloadUrl);
  folder = folder || qrFolder_();
  var safe = String(passId).replace(/[^\w.-]+/g, "_") + ".svg";
  var existing = folder.getFilesByName(safe);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }
  var file = folder.createFile(safe, svg, "image/svg+xml");
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (shareErr) {
    /* still usable for spreadsheet owner */
  }
  return { svg: svg, fileUrl: file.getUrl(), fileId: file.getId() };
}

function shareFolderAnyone_(folder) {
  try {
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    /* owner access still works */
  }
}

function vaultPrintHtml_(batchId, gen, until, notes, created) {
  var cards = created
    .map(function (pass) {
      var svg = pass.qrSvg || "";
      return (
        '<article class="card">' +
        '<div class="qr">' +
        svg +
        "</div>" +
        "<p class=\"id\">" +
        String(pass.passId) +
        "</p>" +
        "<p class=\"meta\">Valid till " +
        String(pass.validUntil || until) +
        "</p>" +
        "</article>"
      );
    })
    .join("\n");
  return (
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"/>" +
    "<title>" +
    batchId +
    "</title>" +
    "<style>" +
    "body{font-family:system-ui,sans-serif;margin:16px;background:#f6f1e8}" +
    "h1{font-size:1.2rem} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}" +
    ".card{background:#fec20e;padding:10px;border-radius:4px}" +
    ".qr svg{width:100%;height:auto;background:#fffaef;display:block}" +
    ".id{font-weight:700;font-size:12px;margin:8px 0 0;word-break:break-all}" +
    ".meta{font-size:11px;margin:4px 0 0}" +
    "@media print{body{margin:0;background:#fff} .card{-webkit-print-color-adjust:exact;print-color-adjust:exact}}" +
    "</style></head><body>" +
    "<h1>Parivar Pass batch " +
    batchId +
    "</h1>" +
    "<p>" +
    created.length +
    " passes · generated " +
    gen +
    " · valid till " +
    until +
    (notes ? " · " + notes : "") +
    "</p>" +
    '<p><button onclick="window.print()">Print / Save PDF</button></p>' +
    '<div class="grid">' +
    cards +
    "</div></body></html>"
  );
}

function createBatchVault_(batchId, gen, until, notes, created) {
  var root = vaultRoot_();
  var folder = root.createFolder(batchId + "_" + gen);
  shareFolderAnyone_(folder);
  var manifest = {
    batchId: batchId,
    generatedAt: gen,
    validUntil: until,
    notes: notes || "",
    quantity: created.length,
    passIds: created.map(function (p) {
      return p.passId;
    }),
  };
  folder.createFile(
    "batch.json",
    JSON.stringify(manifest, null, 2),
    MimeType.PLAIN_TEXT
  );
  var html = vaultPrintHtml_(batchId, gen, until, notes, created);
  var printFile = folder.createFile(batchId + "_print.html", html, MimeType.HTML);
  try {
    printFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e1) {}
  // Best-effort PDF via Drive conversion of HTML is unreliable; HTML is the vault reprint source.
  created.forEach(function (pass) {
    if (!pass.qrSvg) return;
    var safe = String(pass.passId).replace(/[^\w.-]+/g, "_") + ".svg";
    try {
      var f = folder.createFile(safe, pass.qrSvg, "image/svg+xml");
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e2) {}
  });
  return {
    batchId: batchId,
    vaultFolderUrl: folder.getUrl(),
    vaultFolderId: folder.getId(),
    printHtmlUrl: printFile.getUrl(),
  };
}

function listBatches_() {
  var root = vaultRoot_();
  var folders = root.getFolders();
  var out = [];
  while (folders.hasNext()) {
    var f = folders.next();
    var printUrl = "";
    var files = f.getFilesByName(f.getName().split("_")[0] + "_print.html");
    // Prefer any *_print.html
    var all = f.getFiles();
    while (all.hasNext()) {
      var file = all.next();
      var n = file.getName();
      if (/_print\.html$/i.test(n)) {
        printUrl = file.getUrl();
        break;
      }
    }
    out.push({
      name: f.getName(),
      batchId: String(f.getName()).split("_")[0],
      url: f.getUrl(),
      id: f.getId(),
      createdAt: f.getDateCreated() ? f.getDateCreated().toISOString() : "",
      printHtmlUrl: printUrl,
    });
  }
  out.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return ok_({
    batches: out,
    vaultUrl: root.getUrl(),
  });
}

function listPasses_() {
  var rows = rows_(PASSES);
  var slim = rows.map(function (row) {
    var p = enrich_(row);
    return {
      passId: p.passId,
      status: p.status,
      name: p.name,
      phone: p.phone,
      email: p.email,
      generatedAt: p.generatedAt,
      validUntil: p.validUntil,
      notes: p.notes,
      qrUrl: p.qrUrl,
      qrSvgFile: p.qrSvgFile,
      batchId: String(row.batchId || ""),
      vaultFolder: String(row.vaultFolder || ""),
      effectiveStatus: p.effectiveStatus,
    };
  });
  slim.sort(function (a, b) {
    return String(b.generatedAt).localeCompare(String(a.generatedAt));
  });
  return ok_({ passes: slim, count: slim.length });
}

function issueBatch_(p) {
  var qty = Math.max(1, Math.min(210, Number(p.quantity) || 1));
  var gen = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var d = new Date();
  d.setMonth(d.getMonth() + 6);
  var until = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var sh = sheet_(PASSES);
  var h = passesHeaders_(sh);
  var slots = slotCols_();
  var required = [
    "passId",
    "qrUrl",
    "qrSvg",
    "status",
    "name",
    "phone",
    "email",
    "generatedAt",
    "validUntil",
    "notes",
    "registeredAt",
  ].concat(slots);
  for (var r = 0; r < required.length; r++) {
    if (!h[required[r]]) {
      throw new Error(
        "Missing column on passes row " +
          PASSES_HEADER_ROW +
          ": " +
          required[r] +
          (slots.indexOf(required[r]) >= 0 ? " (must match events!Event Code)" : "")
      );
    }
  }
  var batchId = "BAT-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
  var batchFolder = null;
  try {
    var root = vaultRoot_();
    batchFolder = root.createFolder(batchId + "_" + gen);
    shareFolderAnyone_(batchFolder);
  } catch (vaultErr) {
    batchFolder = null;
  }
  var created = [];
  for (var i = 0; i < qty; i++) {
    var id = "PV2-" + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
    var rowNum = nextPassRow_(sh);
    var url = audienceUrl_(id);
    var qr = storePassQrSvg_(id, url, batchFolder || qrFolder_());
    var values = {};
    values.passId = id;
    values.qrUrl = url;
    values.qrSvg = qr.svg;
    if (h.qrSvgFile) values.qrSvgFile = qr.fileUrl;
    values.status = "unregistered";
    values.name = "";
    values.phone = "";
    values.email = "";
    values.generatedAt = gen;
    values.validUntil = until;
    values.notes = p.notes || "";
    values.registeredAt = "";
    if (h.batchId) values.batchId = batchId;
    if (h.vaultFolder && batchFolder) values.vaultFolder = batchFolder.getUrl();
    slots.forEach(function (k) {
      values[k] = "open";
    });
    Object.keys(values).forEach(function (key) {
      set_(sh, rowNum, h, key, values[key]);
    });
    var enriched = enrich_(findPass_(id));
    enriched.qrSvg = qr.svg;
    enriched.qrSvgFile = qr.fileUrl;
    created.push(enriched);
  }
  var vault = null;
  if (batchFolder) {
    try {
      var manifest = {
        batchId: batchId,
        generatedAt: gen,
        validUntil: until,
        notes: p.notes || "",
        quantity: created.length,
        passIds: created.map(function (pass) {
          return pass.passId;
        }),
      };
      batchFolder.createFile(
        "batch.json",
        JSON.stringify(manifest, null, 2),
        MimeType.PLAIN_TEXT
      );
      var html = vaultPrintHtml_(batchId, gen, until, p.notes || "", created);
      var printFile = batchFolder.createFile(
        batchId + "_print.html",
        html,
        MimeType.HTML
      );
      try {
        printFile.setSharing(
          DriveApp.Access.ANYONE_WITH_LINK,
          DriveApp.Permission.VIEW
        );
      } catch (sharePrint) {}
      vault = {
        batchId: batchId,
        vaultFolderUrl: batchFolder.getUrl(),
        vaultFolderId: batchFolder.getId(),
        printHtmlUrl: printFile.getUrl(),
      };
    } catch (buildErr) {
      vault = batchFolder
        ? {
            batchId: batchId,
            vaultFolderUrl: batchFolder.getUrl(),
            vaultFolderId: batchFolder.getId(),
            printHtmlUrl: "",
            warning: String(buildErr),
          }
        : null;
    }
  }
  // Strip heavy SVG from API response (still on Sheet / Drive)
  var light = created.map(function (pass) {
    return {
      passId: pass.passId,
      status: pass.status,
      name: pass.name,
      phone: pass.phone,
      email: pass.email,
      generatedAt: pass.generatedAt,
      validUntil: pass.validUntil,
      notes: pass.notes,
      registeredAt: pass.registeredAt,
      qrUrl: pass.qrUrl,
      qrSvgFile: pass.qrSvgFile,
      slots: pass.slots,
      openCount: pass.openCount,
      effectiveStatus: pass.effectiveStatus,
      invalidReason: pass.invalidReason,
    };
  });
  return ok_({
    passes: light,
    generatedAt: gen,
    validUntil: until,
    quantity: qty,
    batchId: batchId,
    vault: vault,
  });
}

function pinOk_(pin) {
  // Same PIN as demo / config.js — change here (and config.js) when going stricter.
  return String(pin || "").trim() === "param2468";
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
