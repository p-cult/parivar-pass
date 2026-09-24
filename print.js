(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var cfg = window.PARIVAR_CONFIG || {};
  var PER = (cfg.a3 && cfg.a3.perPage) || 21;
  var pin = "";
  var lastPasses = [];
  var working = false;

  function fail(err) {
    working = false;
    UI.setBusy($("unlock"), false);
    UI.setBusy($("generate"), false);
    UI.setStatus($("status"), (err && err.message) || String(err), "bad");
  }

  function unlock() {
    if (working) return;
    pin = $("admin-pin").value.trim();
    if (!pin) {
      UI.setStatus($("status"), "Enter your admin PIN", "bad");
      return;
    }
    working = true;
    UI.setBusy($("unlock"), true, "Checking…");
    API.call("staffLogin", { pin: pin })
      .then(function (res) {
        working = false;
        UI.setBusy($("unlock"), false);
        if (!res.ok) {
          UI.setStatus($("status"), res.error || "Wrong PIN", "bad");
          return;
        }
        if (res.data.role !== "admin") {
          UI.setStatus($("status"), "Minting needs an admin PIN.", "bad");
          return;
        }
        UI.setStatus($("status"), "", "info");
        UI.show($("auth-panel"), false);
        UI.show($("batch-panel"), true);
        UI.show($("reprint-panel"), true);
        loadBatches();
      })
      .catch(fail);
  }

  function generate() {
    if (working) return;
    var qty = Math.max(1, Math.min(210, Number($("qty").value) || 21));
    $("qty").value = String(qty);
    working = true;
    UI.setBusy($("generate"), true, "Minting…");
    $("do-print").disabled = true;
    UI.setStatus($("status"), "Minting " + qty + " passes…", "info");
    API.call("mint", { pin: pin, quantity: qty, type: $("type").value, notes: $("notes").value })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || "Mint failed");
        lastPasses = res.data.passes || [];
        $("batch-meta").textContent =
          res.data.batchId + " · " + lastPasses.length + " passes · valid till " + res.data.validUntil +
          " · " + Math.ceil(lastPasses.length / PER) + " A3 page(s)";
        UI.setStatus($("status"), "Laying out print sheet…", "info");
        return renderSheets(lastPasses);
      })
      .then(function () {
        working = false;
        UI.setBusy($("generate"), false);
        $("do-print").disabled = false;
        UI.setStatus($("status"), "Minted — now Print / Save PDF (A3 portrait, background graphics on).", "ok");
        loadBatches();
      })
      .catch(fail);
  }

  function loadBatches() {
    API.call("listBatches", { pin: pin }).then(function (res) {
      var list = $("batch-list");
      list.textContent = "";
      if (!res.ok) {
        list.appendChild(hint(res.error || "Could not load batches"));
        return;
      }
      var batches = res.data.batches || [];
      if (!batches.length) {
        list.appendChild(hint("No batches yet."));
        return;
      }
      batches.forEach(function (b) {
        var row = document.createElement("div");
        row.className = "batch-row";
        var text = document.createElement("span");
        text.textContent =
          b.batchId + " · " + (b.createdAt || "—") + " · " + b.total + " passes (" + b.unclaimed + " unclaimed)";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "secondary";
        btn.textContent = "Reprint";
        btn.addEventListener("click", function () {
          reprint(b.batchId, btn);
        });
        row.appendChild(text);
        row.appendChild(btn);
        list.appendChild(row);
      });
    });
  }

  function reprint(batchId, btn) {
    if (working) return;
    working = true;
    UI.setBusy(btn, true, "Loading…");
    API.call("listPasses", { pin: pin })
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || "Could not load passes");
        lastPasses = (res.data.passes || []).filter(function (p) {
          return (p.batchId || "(none)") === batchId && p.effectiveStatus !== "invalid";
        });
        $("batch-meta").textContent = batchId + " · " + lastPasses.length + " passes (reprint)";
        return renderSheets(lastPasses);
      })
      .then(function () {
        working = false;
        UI.setBusy(btn, false);
        $("do-print").disabled = !lastPasses.length;
        UI.setStatus($("status"), "Ready — Print / Save PDF.", "ok");
      })
      .catch(function (err) {
        UI.setBusy(btn, false);
        fail(err);
      });
  }

  function hint(t) {
    var p = document.createElement("p");
    p.className = "hint";
    p.textContent = t;
    return p;
  }

  $("unlock").addEventListener("click", unlock);
  $("generate").addEventListener("click", generate);
  $("do-print").addEventListener("click", function () {
    if (lastPasses.length) window.print();
  });
  UI.onEnter($("admin-pin"), unlock);
  if ($("admin-pin").value) unlock();

  window.addEventListener("resize", scalePreviews);

  function scalePreviews() {
    var preview = $("preview");
    if (preview.classList.contains("hidden")) return;
    var avail = Math.max(280, preview.clientWidth - 16);
    preview.querySelectorAll(".a3-page-preview").forEach(function (page) {
      page.style.transform = "none";
      var scale = Math.min(1, avail / (page.offsetWidth || 1123));
      page.style.transformOrigin = "top left";
      page.style.transform = "scale(" + scale + ")";
      page.style.marginBottom = scale < 1 ? -(page.offsetHeight * (1 - scale)) + "px" : "1rem";
    });
  }

  function renderSheets(passes) {
    var preview = $("preview");
    var printRoot = $("print-root");
    preview.textContent = "";
    printRoot.textContent = "";
    var pages = [];
    for (var i = 0; i < passes.length; i += PER) pages.push(passes.slice(i, i + PER));
    return pages
      .reduce(function (chain, pagePasses) {
        return chain.then(function () {
          return buildPage(pagePasses).then(function (html) {
            var prev = document.createElement("div");
            prev.className = "a3-page-preview";
            prev.innerHTML = html;
            preview.appendChild(prev);
            var pr = document.createElement("div");
            pr.className = "a3-page";
            pr.innerHTML = html;
            printRoot.appendChild(pr);
          });
        });
      }, Promise.resolve())
      .then(function () {
        UI.show(preview, true);
        scalePreviews();
      });
  }

  function buildPage(pagePasses) {
    var cells = pagePasses.map(function (pass) {
      return UI.qrDataUrl(API.audienceUrlForPass(pass.passId), 160).then(function (qr) {
        return '<div class="pass-cell">' + window.ParivarPassHTML.render(pass, qr) + "</div>";
      });
    });
    while (cells.length < PER) cells.push(Promise.resolve('<div class="pass-cell"></div>'));
    return Promise.all(cells).then(function (h) {
      return h.join("");
    });
  }
})();
