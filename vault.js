(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var pin = "";
  var working = false;

  $("mode-pill").textContent = UI.modeLabel();
  var cfg = window.PARIVAR_CONFIG || {};
  var hint = $("pin-hint");
  if (hint) {
    hint.textContent =
      cfg.mode === "sheets" ? "Staff PIN required." : "Demo PIN: " + (cfg.adminPin || "param2468");
  }

  function unlock() {
    if (working) return;
    pin = $("admin-pin").value.trim();
    if (!pin) {
      UI.setStatus($("status"), "Enter PIN", "bad");
      return;
    }
    working = true;
    UI.setBusy($("unlock"), true, "Checking…");
    UI.setStatus($("status"), "Loading vault…", "info");
    // Prefer listBatches as unlock (adminLookup __pin_check__ can 404 intermittently on GAS)
    API.call("listBatches", { pin: pin })
      .then(function (batches) {
        if (!batches.ok) {
          working = false;
          UI.setBusy($("unlock"), false);
          UI.setStatus($("status"), batches.error || "Wrong PIN / vault error", "bad");
          return null;
        }
        UI.show($("auth-panel"), false);
        UI.show($("vault-panel"), true);
        renderBatches(batches.data || {});
        return API.call("listPasses", { pin: pin }).then(function (passes) {
          return { batches: batches, passes: passes };
        });
      })
      .then(function (pair) {
        working = false;
        UI.setBusy($("unlock"), false);
        if (!pair) return;
        if (!pair.passes.ok) {
          UI.setStatus($("status"), pair.passes.error || "Could not list passes", "bad");
          return;
        }
        renderPasses(pair.passes.data || {});
        UI.setStatus(
          $("status"),
          ((pair.batches.data && pair.batches.data.batches) || []).length +
            " batches · " +
            (pair.passes.data.count || 0) +
            " passes",
          "ok"
        );
      })
      .catch(function (err) {
        working = false;
        UI.setBusy($("unlock"), false);
        UI.setStatus($("status"), (err && err.message) || "Vault failed", "bad");
      });
  }

  $("unlock").addEventListener("click", unlock);
  UI.onEnter($("admin-pin"), unlock);

  function renderBatches(data) {
    var root = $("vault-root");
    if (data.vaultUrl) {
      root.href = data.vaultUrl;
      root.classList.remove("hidden");
    } else {
      root.href = "#";
      root.textContent = "Vault folder (none yet)";
    }
    var list = $("batch-list");
    list.innerHTML = "";
    var batches = data.batches || [];
    if (!batches.length) {
      list.innerHTML = '<p class="hint">No batches yet — Generate on Print.</p>';
      return;
    }
    batches.forEach(function (b) {
      var el = document.createElement("article");
      el.className = "benefit";
      var h = document.createElement("h3");
      h.textContent = b.name || b.batchId || "Batch";
      var meta = document.createElement("p");
      meta.className = "hint";
      meta.textContent = b.createdAt
        ? "Created " + String(b.createdAt).slice(0, 19).replace("T", " ")
        : "";
      var row = document.createElement("div");
      row.className = "btn-row";
      if (b.url) {
        var a1 = document.createElement("a");
        a1.className = "button secondary";
        a1.href = b.url;
        a1.target = "_blank";
        a1.rel = "noopener";
        a1.textContent = "Open folder";
        row.appendChild(a1);
      }
      if (b.printHtmlUrl) {
        var a2 = document.createElement("a");
        a2.className = "button";
        a2.href = b.printHtmlUrl;
        a2.target = "_blank";
        a2.rel = "noopener";
        a2.textContent = "Open print file";
        row.appendChild(a2);
      }
      el.appendChild(h);
      el.appendChild(meta);
      el.appendChild(row);
      list.appendChild(el);
    });
  }

  function renderPasses(data) {
    var list = $("pass-list");
    list.innerHTML = "";
    var passes = data.passes || [];
    if (!passes.length) {
      list.innerHTML = '<p class="hint">No passes on the Sheet yet.</p>';
      return;
    }
    var table = document.createElement("div");
    passes.forEach(function (p) {
      var el = document.createElement("article");
      el.className = "benefit";
      var h = document.createElement("h3");
      h.textContent = p.passId;
      var meta = document.createElement("p");
      meta.className = "hint";
      meta.textContent =
        (p.status || "") +
        " · gen " +
        (p.generatedAt || "—") +
        " · till " +
        (p.validUntil || "—") +
        (p.name ? " · " + p.name : "") +
        (p.batchId ? " · " + p.batchId : "");
      var row = document.createElement("div");
      row.className = "btn-row";
      if (p.qrUrl) {
        var a = document.createElement("a");
        a.className = "button secondary";
        a.href = p.qrUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Audience";
        row.appendChild(a);
      }
      if (p.vaultFolder) {
        var a2 = document.createElement("a");
        a2.className = "button secondary";
        a2.href = p.vaultFolder;
        a2.target = "_blank";
        a2.rel = "noopener";
        a2.textContent = "Batch folder";
        row.appendChild(a2);
      }
      if (p.qrSvgFile) {
        var a3 = document.createElement("a");
        a3.className = "button secondary";
        a3.href = p.qrSvgFile;
        a3.target = "_blank";
        a3.rel = "noopener";
        a3.textContent = "QR SVG";
        row.appendChild(a3);
      }
      el.appendChild(h);
      el.appendChild(meta);
      el.appendChild(row);
      table.appendChild(el);
    });
    list.appendChild(table);
  }
})();
