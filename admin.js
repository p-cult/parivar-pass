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
    loadStaff();
  }

  // ---------------------------------------------------------------- Staff

  var staffRows = [];
  var editing = null; // the row being edited, or null when adding

  function loadStaff() {
    API.call("listStaff", { pin: Staff.get().pin }).then(function (res) {
      if (!res.ok) {
        $("staff-list").textContent = res.error || "Could not load staff";
        return;
      }
      renderStaff(res.data.staff || []);
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderStaff(rows) {
    staffRows = rows;
    var list = $("staff-list");
    list.textContent = "";
    if (!rows.length) list.appendChild(el("p", "hint", "No staff yet."));
    rows.forEach(function (r) {
      var line = el("div", "staff-row" + (r.active ? "" : " staff-off"));
      var info = el("div", "staff-info");
      info.appendChild(el("strong", "", r.name));
      var meta = el("span", "hint", (r.role === "admin" ? "Admin" : "Checker") + (r.notes ? " · " + r.notes : ""));
      info.appendChild(meta);
      line.appendChild(info);
      line.appendChild(el("span", "staff-pin pass-id", r.pin));
      line.appendChild(el("span", "badge " + (r.active ? "badge-enabled" : "badge-disabled"), r.active ? "Active" : "Off"));
      var edit = el("button", "secondary", "Edit");
      edit.type = "button";
      edit.addEventListener("click", function () { openForm(r); });
      var toggle = el("button", "secondary", r.active ? "Disable" : "Enable");
      toggle.type = "button";
      toggle.addEventListener("click", function () {
        save(Object.assign({}, r, { active: !r.active }), toggle);
      });
      var btns = el("div", "staff-btns");
      btns.appendChild(edit);
      btns.appendChild(toggle);
      line.appendChild(btns);
      list.appendChild(line);
    });
  }

  function newPin() {
    var used = {};
    staffRows.forEach(function (r) { used[r.pin] = true; });
    var pin;
    do {
      pin = String(Math.floor(1000 + Math.random() * 9000));
    } while (used[pin]);
    return pin;
  }

  function openForm(row) {
    editing = row || null;
    $("staff-form-title").textContent = row ? "Edit " + row.name : "Add staff";
    $("sf-name").value = row ? row.name : "";
    $("sf-role").value = row ? row.role : "checker";
    $("sf-pin").value = row ? row.pin : newPin();
    $("sf-notes").value = row ? row.notes : "";
    UI.show($("staff-form"), true);
    $("sf-name").focus();
  }

  function save(row, btn) {
    var me = Staff.get();
    UI.setBusy(btn, true, "Saving…");
    API.call("saveStaff", {
      pin: me.pin,
      row: row.row || 0,
      name: row.name,
      staffPin: row.pin,
      role: row.role,
      active: row.active,
      notes: row.notes,
    }).then(function (res) {
      UI.setBusy(btn, false);
      if (!res.ok) {
        UI.setStatus($("status"), res.error || "Could not save", "bad");
        return;
      }
      // Editing your own row changes the PIN this phone signs in with.
      var old = row.row && staffRows.filter(function (r) { return r.row === row.row; })[0];
      if (old && old.pin === me.pin) {
        Staff.set({ pin: row.pin, name: row.name, role: row.role });
        $("who").textContent = row.name;
      }
      UI.setStatus($("status"), "Saved " + row.name + (row.active ? "" : " (disabled)"), "ok");
      UI.show($("staff-form"), false);
      renderStaff(res.data.staff || []);
    });
  }

  $("add-staff").addEventListener("click", function () { openForm(null); });
  $("sf-gen").addEventListener("click", function () { $("sf-pin").value = newPin(); });
  $("sf-cancel").addEventListener("click", function () { UI.show($("staff-form"), false); });
  $("staff-form").addEventListener("submit", function (e) {
    e.preventDefault();
    save(
      {
        row: editing ? editing.row : 0,
        name: $("sf-name").value.trim(),
        pin: $("sf-pin").value.trim(),
        role: $("sf-role").value,
        active: editing ? editing.active : true,
        notes: $("sf-notes").value.trim(),
      },
      $("sf-save")
    );
  });

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
