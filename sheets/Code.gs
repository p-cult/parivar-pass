/**
 * Parivar Pass — Apps Script backend. The Google Sheet is the whole database.
 *
 * Tabs
 *   passes      one row per pass (headers on row 10, data from row 11).
 *               Core columns: passId, qrUrl, status, type, name, phone, email,
 *               batchId, generatedAt, validUntil, registeredAt, notes.
 *               Then ONE COLUMN PER PRIVILEGE (column header = privilege id).
 *               Cell values: enabled | used | disabled  (blank = privilege default).
 *   privileges  id | title | kind | detail | url | redeemBy | default | active
 *               kind: free | discount | link | file
 *               redeemBy: staff (desk marks used) | holder (holder RSVPs) | none (view only)
 *   staff       name | pin | role | active | notes      role: checker | admin
 *   log         at | passId | privilege | action | by   (written automatically)
 *
 * Deploy as Web App → Execute as: Me → Who has access: Anyone.
 * Sheet menu "Parivar Pass → Set up / sync" creates missing tabs and columns.
 */

var PASSES = "passes";
var PRIVS = "privileges";
var STAFF = "staff";
var LOG = "log";
var PASS_HEADER_ROW = 10;
var PASS_DATA_START = 11;
var CORE_COLS = [
  "passId", "qrUrl", "status", "type", "name", "phone", "email",
  "batchId", "generatedAt", "validUntil", "registeredAt", "notes",
];
var PRIV_HEADERS = ["id", "title", "kind", "detail", "url", "redeemBy", "default", "active"];
var STAFF_HEADERS = ["name", "pin", "role", "active", "notes"];
var LOG_HEADERS = ["at", "passId", "privilege", "action", "by"];
var CACHE_SECONDS = 60;
var LEGACY_ADMIN_PIN = "param2468";

var ALIASES = {
  adminLookup: "lookup",
  adminRedeem: "setPrivilege",
  adminAssign: "assign",
  issueBatch: "mint",
  rsvp: "holderUse",
};

// ---------------------------------------------------------------- HTTP

function doGet() {
  return json_({ ok: true, data: { service: "parivar-pass", version: 3 } });
}

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || "{}");
    return json_(route_(body.action, body));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err), code: "exception" });
  }
}

function route_(action, p) {
  action = ALIASES[action] || action;
  ensureSetup_();

  if (action === "getPass") return getPass_(p.passId);
  if (action === "register") return register_(p);
  if (action === "holderUse") return holderUse_(p);
  if (action === "listBenefits") return ok_({ privileges: publicPrivs_() });

  var staff = staffByPin_(p.pin);
  if (!staff) return fail_("Wrong PIN", "auth");
  if (action === "staffLogin" || (action === "lookup" && p.passId === "__pin_check__")) {
    return ok_({ verified: true, name: staff.name, role: staff.role });
  }
  if (action === "lookup") return lookup_(p.passId, staff);
  if (action === "setPrivilege") return setPrivilege_(p, staff);

  if (staff.role !== "admin") return fail_("Admin PIN required", "forbidden");
  if (action === "assign") return assign_(p, staff);
  if (action === "adminUpdate") return adminUpdate_(p, staff);
  if (action === "setStatus") return setStatus_(p, staff);
  if (action === "mint") return mint_(p, staff);
  if (action === "listBatches") return listBatches_();
  if (action === "listPasses") return listPasses_();
  if (action === "listStaff") return listStaff_();
  if (action === "saveStaff") return saveStaff_(p, staff);
  return fail_("Unknown action", "unknown");
}

// ---------------------------------------------------------------- Public (pass holder)

function getPass_(passId) {
  var row = findPass_(passId);
  if (!row) return fail_("Pass not found", "not_found");
  var pass = view_(row);
  var privs = pass.status === "active" && !pass.invalidReason
    ? pass.privileges.filter(function (x) { return x.state !== "disabled"; })
    : [];
  return ok_({ pass: publicPass_(pass, privs) });
}

function register_(p) {
  var name = String(p.name || "").trim();
  var phone = String(p.phone || "").trim();
  if (!name || !phone) return fail_("Name and phone required", "validation");
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = findPass_(p.passId);
    if (!row) return fail_("Pass not found", "not_found");
    var pass = view_(row);
    if (pass.invalidReason) return fail_(invalidText_(pass.invalidReason), "invalid");
    if (pass.status !== "unclaimed") return fail_("This pass is already registered", "already_registered");
    writeCells_(row.__row, {
      name: name,
      phone: phone,
      email: String(p.email || "").trim(),
      status: "active",
      registeredAt: new Date(),
    });
    log_(pass.passId, "", "registered", name);
  } finally {
    lock.releaseLock();
  }
  return getPass_(p.passId);
}

function holderUse_(p) {
  var privId = String(p.privilegeId || p.benefitId || "").trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = findPass_(p.passId);
    if (!row) return fail_("Pass not found", "not_found");
    var pass = view_(row);
    if (pass.invalidReason) return fail_(invalidText_(pass.invalidReason), "invalid");
    if (pass.status !== "active") return fail_("Register this pass first", "not_registered");
    var priv = pass.privileges.filter(function (x) { return x.id === privId; })[0];
    if (!priv) return fail_("Unknown privilege", "bad_privilege");
    if (priv.redeemBy !== "holder") return fail_("Show this pass at the desk — staff will mark it.", "desk_only");
    if (priv.state !== "enabled") return fail_("Already used", "already_used");
    writeCells_(row.__row, obj_(privId, "used"));
    log_(pass.passId, privId, "used", "holder");
  } finally {
    lock.releaseLock();
  }
  var res = getPass_(p.passId);
  if (res.ok) res.data.message = "Confirmed. Show this screen at the entrance.";
  return res;
}

function publicPass_(pass, privs) {
  return {
    passId: pass.passId,
    status: pass.status,
    type: pass.type,
    name: pass.name,
    validUntil: pass.validUntil,
    invalidReason: pass.invalidReason,
    effectiveStatus: pass.invalidReason ? "invalid" : pass.status,
    privileges: privs.map(function (x) {
      var showUrl = (x.kind === "link" || x.kind === "file") && x.state === "enabled";
      return {
        id: x.id,
        title: x.title,
        kind: x.kind,
        detail: x.detail,
        url: showUrl ? x.url : "",
        redeemBy: x.redeemBy,
        state: x.state,
      };
    }),
  };
}

// ---------------------------------------------------------------- Staff

function lookup_(passId, staff) {
  var row = findPass_(passId);
  if (!row) return fail_("Pass not found", "not_found");
  return ok_({ pass: view_(row), staff: { name: staff.name, role: staff.role } });
}

function setPrivilege_(p, staff) {
  var privId = String(p.privilegeId || p.benefitId || "").trim();
  var state = String(p.state || "used").trim().toLowerCase();
  if (["enabled", "used", "disabled"].indexOf(state) < 0) return fail_("Bad state", "validation");
  if (staff.role !== "admin" && state !== "used") {
    return fail_("Only admins can enable or disable privileges", "forbidden");
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = findPass_(p.passId);
    if (!row) return fail_("Pass not found", "not_found");
    var pass = view_(row);
    var priv = pass.privileges.filter(function (x) { return x.id === privId; })[0];
    if (!priv) return fail_("Unknown privilege", "bad_privilege");
    if (state === "used" && staff.role !== "admin") {
      if (pass.invalidReason) return fail_(invalidText_(pass.invalidReason), "invalid");
      if (pass.status !== "active") return fail_("Pass not registered yet", "not_registered");
      if (priv.state === "used") return fail_("Already used", "already_used");
      if (priv.state === "disabled") return fail_("This privilege is disabled on this pass", "disabled");
    }
    writeCells_(row.__row, obj_(privId, state));
    log_(pass.passId, privId, state, staff.name);
  } finally {
    lock.releaseLock();
  }
  return lookup_(p.passId, staff);
}

// ---------------------------------------------------------------- Admin

function assign_(p, staff) {
  var name = String(p.name || "").trim();
  if (!name) return fail_("Name required", "validation");
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = p.passId ? findPass_(p.passId) : nextUnclaimed_();
    if (!row) {
      return fail_(p.passId ? "Pass not found" : "No unclaimed passes left", p.passId ? "not_found" : "none_available");
    }
    var pass = view_(row);
    if (pass.invalidReason) return fail_(invalidText_(pass.invalidReason), "invalid");
    if (pass.status !== "unclaimed") return fail_("Pass already registered", "already_registered");
    var cells = {
      name: name,
      phone: String(p.phone || "").trim(),
      email: String(p.email || "").trim(),
      status: "active",
      registeredAt: new Date(),
    };
    if (p.type) cells.type = String(p.type).trim();
    if (p.notes) cells.notes = String(p.notes).trim();
    writeCells_(row.__row, cells);
    log_(pass.passId, "", "assigned", staff.name);
    return ok_({ pass: view_(findPass_(pass.passId)) });
  } finally {
    lock.releaseLock();
  }
}

function adminUpdate_(p, staff) {
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  var cells = {};
  ["name", "phone", "email", "notes", "type"].forEach(function (f) {
    if (p[f] != null && p[f] !== "") cells[f] = String(p[f]).trim();
  });
  writeCells_(row.__row, cells);
  log_(String(row.passId), "", "updated", staff.name);
  return lookup_(p.passId, staff);
}

function setStatus_(p, staff) {
  var status = String(p.status || "").trim().toLowerCase();
  if (["unclaimed", "active", "void"].indexOf(status) < 0) return fail_("Bad status", "validation");
  var row = findPass_(p.passId);
  if (!row) return fail_("Pass not found", "not_found");
  writeCells_(row.__row, { status: status });
  log_(String(row.passId), "", "status:" + status, staff.name);
  return lookup_(p.passId, staff);
}

function mint_(p, staff) {
  var qty = Math.max(1, Math.min(210, Number(p.quantity) || 1));
  var tz = Session.getScriptTimeZone();
  var gen = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var d = new Date();
  d.setMonth(d.getMonth() + 6);
  var until = Utilities.formatDate(d, tz, "yyyy-MM-dd");
  var batchId = "BAT-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
  var type = String(p.type || "").trim();
  var notes = String(p.notes || "").trim();

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var created = [];
  try {
    var sh = sheet_(PASSES);
    var hdr = passHeaders_(true);
    var width = hdr.names.length;
    var startRow = Math.max(sh.getLastRow() + 1, PASS_DATA_START);
    var values = [];
    for (var i = 0; i < qty; i++) {
      var id = "PV2-" + Utilities.getUuid().replace(/-/g, "").slice(0, 10).toUpperCase();
      var rec = {
        passId: id,
        qrUrl: audienceUrl_(id),
        status: "unclaimed",
        type: type,
        batchId: batchId,
        generatedAt: gen,
        validUntil: until,
        notes: notes,
      };
      var line = [];
      for (var c = 0; c < width; c++) {
        var key = hdr.names[c];
        line.push(rec[key] != null ? rec[key] : "");
      }
      values.push(line);
      created.push({ passId: id, status: "unclaimed", type: type, generatedAt: gen, validUntil: until, qrUrl: rec.qrUrl });
    }
    sh.getRange(startRow, 1, qty, width).setValues(values);
    log_(batchId, "", "minted " + qty, staff.name);
  } finally {
    lock.releaseLock();
  }
  return ok_({
    passes: created,
    generatedAt: gen,
    validUntil: until,
    quantity: qty,
    batchId: batchId,
    vault: null,
  });
}

function listPasses_() {
  var sh = sheet_(PASSES);
  var hdr = passHeaders_();
  var last = sh.getLastRow();
  if (last < PASS_DATA_START) return ok_({ passes: [], count: 0 });
  var data = sh.getRange(PASS_DATA_START, 1, last - PASS_DATA_START + 1, hdr.names.length).getValues();
  var out = [];
  data.forEach(function (line, i) {
    var row = rowObj_(hdr.names, line, PASS_DATA_START + i);
    if (!row.passId) return;
    var v = view_(row);
    out.push({
      passId: v.passId,
      status: v.status,
      type: v.type,
      name: v.name,
      phone: v.phone,
      generatedAt: v.generatedAt,
      validUntil: v.validUntil,
      batchId: v.batchId,
      effectiveStatus: v.invalidReason ? "invalid" : v.status,
    });
  });
  return ok_({ passes: out, count: out.length });
}

function listBatches_() {
  var res = listPasses_();
  var batches = {};
  res.data.passes.forEach(function (p) {
    var key = p.batchId || "(none)";
    if (!batches[key]) batches[key] = { batchId: key, createdAt: p.generatedAt, total: 0, unclaimed: 0 };
    batches[key].total++;
    if (p.status === "unclaimed") batches[key].unclaimed++;
  });
  var list = Object.keys(batches).map(function (k) { return batches[k]; });
  list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return ok_({ batches: list, vaultUrl: "" });
}

// ---------------------------------------------------------------- Staff management (admin)

function staffRows_() {
  var sh = sheet_(STAFF);
  var last = sh.getLastRow();
  var width = Math.max(sh.getLastColumn(), STAFF_HEADERS.length);
  var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var rows = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, width).getDisplayValues();
    vals.forEach(function (line, i) {
      var r = {};
      head.forEach(function (h, c) { if (h) r[h] = line[c]; });
      if (!String(r.name || "").trim() && !String(r.pin || "").trim()) return;
      rows.push({
        row: i + 2,
        name: String(r.name || "").trim(),
        pin: String(r.pin || "").trim(),
        role: String(r.role || "").trim().toLowerCase() === "admin" ? "admin" : "checker",
        active: String(r.active).trim().toUpperCase() !== "FALSE",
        notes: String(r.notes || "").trim(),
      });
    });
  }
  return { sheet: sh, head: head, rows: rows };
}

function listStaff_() {
  return ok_({ staff: staffRows_().rows });
}

/** p.pin is the caller's own PIN (auth); the staff member's PIN is p.staffPin. */
function saveStaff_(p, by) {
  var name = String(p.name || "").trim();
  var pin = String(p.staffPin || "").trim();
  var role = String(p.role || "checker").trim().toLowerCase() === "admin" ? "admin" : "checker";
  var active = p.active !== false && String(p.active).toUpperCase() !== "FALSE";
  var notes = String(p.notes || "").trim();
  var rowNum = Number(p.row) || 0;
  if (!name) return fail_("Name required", "validation");
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(pin)) {
    return fail_("PIN must be 4–20 characters: letters, numbers, - or _", "validation");
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = staffRows_();
    if (rowNum && !t.rows.some(function (r) { return r.row === rowNum; })) {
      return fail_("That staff row no longer exists — reload", "not_found");
    }
    var clash = t.rows.filter(function (r) { return r.row !== rowNum && r.active && r.pin === pin; })[0];
    if (active && clash) return fail_("PIN already used by " + clash.name, "validation");

    var after = t.rows.map(function (r) {
      return r.row === rowNum ? { role: role, active: active } : r;
    });
    if (!rowNum) after.push({ role: role, active: active });
    if (!after.some(function (r) { return r.active && r.role === "admin"; })) {
      return fail_("Keep at least one active admin", "validation");
    }

    var target = rowNum || Math.max(t.sheet.getLastRow() + 1, 2);
    var values = { name: name, pin: pin, role: role, active: active, notes: notes };
    STAFF_HEADERS.forEach(function (h) {
      var col = t.head.indexOf(h) + 1;
      if (!col) return;
      var cell = t.sheet.getRange(target, col);
      if (h === "pin") cell.setNumberFormat("@");
      cell.setValue(values[h]);
    });
    log_("", "", (rowNum ? "staff updated: " : "staff added: ") + name + " (" + role + (active ? "" : ", disabled") + ")", by.name);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove("staff_v3");
  return listStaff_();
}

// ---------------------------------------------------------------- Pass model

/** One pass row → normalized view with its privileges resolved against the catalog. */
function view_(row) {
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var validUntil = fmtDate_(row.validUntil);
  var status = normStatus_(row.status);
  var reason = "";
  if (status === "void") reason = "void";
  else if (validUntil && validUntil < today) reason = "expired";
  var privileges = privileges_().filter(function (x) { return x.active; }).map(function (x) {
    return {
      id: x.id,
      title: x.title,
      kind: x.kind,
      detail: x.detail,
      url: x.url,
      redeemBy: x.redeemBy,
      state: normState_(row[x.id], x.defaultState),
    };
  });
  return {
    passId: String(row.passId),
    row: row.__row,
    status: status,
    type: String(row.type || ""),
    name: String(row.name || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    notes: String(row.notes || ""),
    batchId: String(row.batchId || ""),
    generatedAt: fmtDate_(row.generatedAt),
    validUntil: validUntil,
    registeredAt: fmtDate_(row.registeredAt),
    invalidReason: reason,
    privileges: privileges,
  };
}

function normStatus_(v) {
  var s = String(v || "").trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "void" || s === "cancelled" || s === "canceled") return "void";
  return "unclaimed";
}

function normState_(v, def) {
  var s = String(v == null ? "" : v).trim().toLowerCase();
  if (!s) return def === "disabled" ? "disabled" : "enabled";
  if (s === "used" || s === "redeemed" || s === "done" || s === "completed") return "used";
  if (s === "disabled" || s === "off" || s === "no" || s === "false") return "disabled";
  return "enabled";
}

function invalidText_(reason) {
  if (reason === "void") return "This pass has been cancelled";
  if (reason === "expired") return "This pass has expired";
  return "This pass is not valid";
}

// ---------------------------------------------------------------- Catalogs (cached)

function privileges_() {
  return cached_("privs_v3", function () {
    var sh = ss_().getSheetByName(PRIVS);
    if (!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var head = vals[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      var r = {};
      head.forEach(function (h, c) { r[h] = vals[i][c]; });
      var id = String(r.id || "").trim();
      if (!id) continue;
      var kind = String(r.kind || "free").trim().toLowerCase();
      var redeemBy = String(r.redeemby || "").trim().toLowerCase();
      if (!redeemBy) redeemBy = kind === "link" || kind === "file" ? "none" : "staff";
      out.push({
        id: id,
        title: String(r.title || id).trim(),
        kind: kind,
        detail: fmtCell_(r.detail),
        url: String(r.url || "").trim(),
        redeemBy: redeemBy,
        defaultState: String(r["default"] || "enabled").trim().toLowerCase() === "disabled" ? "disabled" : "enabled",
        active: String(r.active).trim().toUpperCase() !== "FALSE",
      });
    }
    return out;
  });
}

function publicPrivs_() {
  return privileges_().filter(function (x) { return x.active; }).map(function (x) {
    return { id: x.id, title: x.title, kind: x.kind, detail: x.detail, redeemBy: x.redeemBy };
  });
}

function staffList_() {
  return cached_("staff_v3", function () {
    var sh = ss_().getSheetByName(STAFF);
    if (!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues();
    var head = vals[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      var r = {};
      head.forEach(function (h, c) { r[h] = vals[i][c]; });
      var pin = String(r.pin || "").trim();
      if (!pin) continue;
      if (String(r.active).trim().toUpperCase() === "FALSE") continue;
      out.push({
        name: String(r.name || "Staff").trim(),
        pin: pin,
        role: String(r.role || "checker").trim().toLowerCase() === "admin" ? "admin" : "checker",
      });
    }
    return out;
  });
}

function staffByPin_(pin) {
  pin = String(pin || "").trim();
  if (!pin) return null;
  var list = staffList_();
  if (!list.length && pin === LEGACY_ADMIN_PIN) return { name: "Admin", role: "admin" };
  for (var i = 0; i < list.length; i++) {
    if (list[i].pin === pin) return { name: list[i].name, role: list[i].role };
  }
  return null;
}

function cached_(key, build) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var val = build();
  cache.put(key, JSON.stringify(val), CACHE_SECONDS);
  return val;
}

function clearParivarCache() {
  CacheService.getScriptCache().removeAll(["privs_v3", "staff_v3", "passHdr_v3", "setup_v3"]);
}

/** Simple trigger: edits to privileges/staff (or the passes header row) apply immediately. */
function onEdit(e) {
  try {
    var sh = e.range.getSheet();
    var n = sh.getName();
    if (n === PRIVS || n === STAFF || (n === PASSES && e.range.getRow() <= PASS_HEADER_ROW)) {
      clearParivarCache();
    }
  } catch (err) {
    /* never block an edit */
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Parivar Pass")
    .addItem("Set up / sync tabs and columns", "setupParivar")
    .addItem("Refresh app cache", "clearParivarCache")
    .addToUi();
}

// ---------------------------------------------------------------- Sheet access

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error("Missing tab: " + name);
  return sh;
}

/** Header row of passes → {names:[...], index:{name: col}} (cached). */
function passHeaders_(fresh) {
  var build = function () {
    var sh = sheet_(PASSES);
    var lastCol = Math.max(1, sh.getLastColumn());
    var names = sh.getRange(PASS_HEADER_ROW, 1, 1, lastCol).getValues()[0].map(function (h) {
      return String(h).trim();
    });
    while (names.length && !names[names.length - 1]) names.pop();
    var index = {};
    names.forEach(function (n, i) { if (n) index[n] = i + 1; });
    return { names: names, index: index };
  };
  if (fresh) {
    var v = build();
    CacheService.getScriptCache().put("passHdr_v3", JSON.stringify(v), CACHE_SECONDS);
    return v;
  }
  return cached_("passHdr_v3", build);
}

/** Reads only the passId column to locate the row, then just that one row. */
function findPass_(passId) {
  var id = String(passId || "").trim().toUpperCase();
  if (!id) return null;
  var sh = sheet_(PASSES);
  var hdr = passHeaders_();
  var idCol = hdr.index.passId;
  if (!idCol) throw new Error("passes tab has no passId column on row " + PASS_HEADER_ROW);
  var last = sh.getLastRow();
  if (last < PASS_DATA_START) return null;
  var ids = sh.getRange(PASS_DATA_START, idCol, last - PASS_DATA_START + 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim().toUpperCase() === id) {
      var rowNum = PASS_DATA_START + i;
      var line = sh.getRange(rowNum, 1, 1, hdr.names.length).getValues()[0];
      return rowObj_(hdr.names, line, rowNum);
    }
  }
  return null;
}

function nextUnclaimed_() {
  var sh = sheet_(PASSES);
  var hdr = passHeaders_();
  var last = sh.getLastRow();
  if (last < PASS_DATA_START) return null;
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var cols = ["passId", "status", "validUntil"].map(function (n) { return hdr.index[n]; });
  var n = last - PASS_DATA_START + 1;
  var colVals = cols.map(function (c) {
    return c ? sh.getRange(PASS_DATA_START, c, n, 1).getValues() : null;
  });
  for (var i = 0; i < n; i++) {
    var id = colVals[0][i][0];
    if (!id) continue;
    if (normStatus_(colVals[1] ? colVals[1][i][0] : "") !== "unclaimed") continue;
    var until = colVals[2] ? fmtDate_(colVals[2][i][0]) : "";
    if (until && until < today) continue;
    return findPass_(id);
  }
  return null;
}

function rowObj_(names, line, rowNum) {
  var o = { __row: rowNum };
  names.forEach(function (n, c) { if (n) o[n] = line[c]; });
  return o;
}

/** Write several named cells on one pass row. Missing columns are created. */
function writeCells_(rowNum, cells) {
  var sh = sheet_(PASSES);
  var hdr = passHeaders_();
  var keys = Object.keys(cells);
  var missing = keys.filter(function (k) { return !hdr.index[k]; });
  if (missing.length) {
    missing.forEach(function (k) { ensurePassColumn_(k); });
    hdr = passHeaders_(true);
  }
  keys.forEach(function (k) {
    sh.getRange(rowNum, hdr.index[k]).setValue(cells[k]);
  });
}

function ensurePassColumn_(name) {
  var hdr = passHeaders_(true);
  if (hdr.index[name]) return;
  var sh = sheet_(PASSES);
  var col = hdr.names.length + 1;
  if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
  sh.getRange(PASS_HEADER_ROW, col).setValue(name).setFontWeight("bold");
  passHeaders_(true);
}

function log_(passId, privilege, action, by) {
  try {
    ss_().getSheetByName(LOG).appendRow([new Date(), passId, privilege, action, by]);
  } catch (err) {
    /* logging must never break the main action */
  }
}

// ---------------------------------------------------------------- Setup / migration

function ensureSetup_() {
  var cache = CacheService.getScriptCache();
  if (cache.get("setup_v3")) return;
  var ss = ss_();
  if (!ss.getSheetByName(PRIVS) || !ss.getSheetByName(STAFF) || !ss.getSheetByName(LOG)) {
    setupParivar();
  }
  cache.put("setup_v3", "1", 600);
}

/**
 * Creates any missing tabs (privileges, staff, log), seeds privileges from the
 * old event/venue columns, and makes sure every privilege and core field has a
 * column on the passes tab. Safe to run repeatedly — it never deletes data.
 */
function setupParivar() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = ss_();

    var priv = ss.getSheetByName(PRIVS);
    if (!priv) {
      priv = ss.insertSheet(PRIVS);
      priv.getRange(1, 1, 1, PRIV_HEADERS.length).setValues([PRIV_HEADERS]).setFontWeight("bold");
      var seed = [
        ["parsec_jayanagar", "Parsec · Jayanagar", "free", "Free entry", "", "staff", "enabled", true],
        ["whitefield_40", "Whitefield", "discount", "40% off", "", "staff", "enabled", true],
      ];
      legacyEvents_().forEach(function (ev) { seed.push(ev); });
      priv.getRange(2, 1, seed.length, PRIV_HEADERS.length).setValues(seed);
      priv.setFrozenRows(1);
    }

    var staff = ss.getSheetByName(STAFF);
    if (!staff) {
      staff = ss.insertSheet(STAFF);
      staff.getRange(1, 1, 1, STAFF_HEADERS.length).setValues([STAFF_HEADERS]).setFontWeight("bold");
      staff.getRange("B:B").setNumberFormat("@");
      staff.getRange(2, 1, 1, STAFF_HEADERS.length).setValues([
        ["Admin", LEGACY_ADMIN_PIN, "admin", true, "Change this PIN"],
      ]);
      staff.setFrozenRows(1);
    }

    if (!ss.getSheetByName(LOG)) {
      var log = ss.insertSheet(LOG);
      log.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight("bold");
      log.setFrozenRows(1);
    }

    CacheService.getScriptCache().removeAll(["privs_v3", "staff_v3", "passHdr_v3"]);
    CORE_COLS.forEach(function (c) { ensurePassColumn_(c); });
    privileges_().forEach(function (x) { ensurePassColumn_(x.id); });
    clearParivarCache();
  } finally {
    lock.releaseLock();
  }
  return "Parivar Pass tabs are set up.";
}

/** Old "events" tab rows → privilege rows (holder RSVPs them). */
function legacyEvents_() {
  var out = [];
  var sh = ss_().getSheetByName("events");
  if (sh && sh.getLastRow() > 10) {
    var vals = sh.getRange(10, 1, sh.getLastRow() - 9, sh.getLastColumn()).getValues();
    var head = vals[0].map(function (h) { return String(h).trim().toLowerCase(); });
    for (var i = 1; i < vals.length; i++) {
      var r = {};
      head.forEach(function (h, c) { r[h] = vals[i][c]; });
      var code = String(r["event code"] || "").trim();
      if (!code) continue;
      var date = fmtCell_(r["event date"]);
      out.push([
        code,
        String(r["event list"] || code).trim(),
        "discount",
        date ? "40% off · " + date : "40% off",
        String(r["event link"] || "").trim(),
        "holder",
        "enabled",
        true,
      ]);
    }
  }
  // Any event_* column already on the passes tab must survive the migration,
  // even if the events tab never listed it — otherwise its data would vanish from the app.
  var have = {};
  out.forEach(function (r) { have[r[0]] = true; });
  var passes = ss_().getSheetByName(PASSES);
  var cols = passes && passes.getLastColumn()
    ? passes.getRange(PASS_HEADER_ROW, 1, 1, passes.getLastColumn()).getValues()[0]
    : [];
  cols.forEach(function (h) {
    var id = String(h).trim();
    if (/^event_\d+$/.test(id) && !have[id]) {
      have[id] = true;
      out.push([id, "Param Event " + id.replace("event_", ""), "discount", "40% off", "", "holder", "enabled", true]);
    }
  });
  if (!out.length) {
    for (var n = 1; n <= 4; n++) {
      out.push(["event_0" + n, "Param Event 0" + n, "discount", "40% off", "", "holder", "enabled", true]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Utils

function audienceUrl_(passId) {
  var base =
    PropertiesService.getScriptProperties().getProperty("PUBLIC_BASE_URL") ||
    "https://p-cult.github.io/parivar-pass/audience.html";
  return base + (base.indexOf("?") >= 0 ? "&" : "?") + "pass=" + encodeURIComponent(passId);
}

function fmtDate_(v) {
  if (!v) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var d = new Date(s);
  return isNaN(d.getTime()) ? "" : Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function fmtCell_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "d MMM yyyy");
  }
  return String(v == null ? "" : v).trim();
}

function obj_(k, v) {
  var o = {};
  o[k] = v;
  return o;
}

function ok_(data) {
  return { ok: true, data: data };
}

function fail_(m, c) {
  return { ok: false, error: m, code: c || "error" };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
