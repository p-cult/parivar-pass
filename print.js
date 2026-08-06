(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var pin = "";
  var lastPasses = [];
  var working = false;

  $("mode-pill").textContent = UI.modeLabel();

  function failNet(err) {
    working = false;
    UI.setBusy($("unlock"), false);
    UI.setBusy($("generate"), false);
    $("do-print").disabled = !lastPasses.length;
    UI.setStatus(
      $("status"),
      "Print failed: " + ((err && err.message) || String(err)),
      "bad"
    );
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
        UI.show($("batch-panel"), true);
        UI.setStatus($("status"), "Unlocked", "ok");
        $("qty").focus();
        warnLiveConfig();
      })
      .catch(failNet);
  }

  function generate() {
    if (working) return;
    var qty = Number($("qty").value) || 21;
    qty = Math.max(1, Math.min(210, qty));
    $("qty").value = String(qty);
    working = true;
    UI.setBusy($("generate"), true, "Working…");
    $("do-print").disabled = true;
    UI.setStatus($("status"), "Issuing " + qty + " passes…", "info");
    API.call("issueBatch", {
      pin: pin,
      quantity: qty,
      notes: $("notes").value,
    })
      .then(function (res) {
        if (!res.ok) {
          working = false;
          UI.setBusy($("generate"), false);
          UI.setStatus($("status"), res.error, "bad");
          return null;
        }
        lastPasses = res.data.passes || [];
        var per =
          (window.PARIVAR_CONFIG.a3 && window.PARIVAR_CONFIG.a3.perPage) || 21;
        var vault = res.data.vault;
        var meta =
          lastPasses.length +
          " passes · generated " +
          res.data.generatedAt +
          " · valid till " +
          res.data.validUntil +
          " · " +
          Math.ceil(lastPasses.length / per) +
          " A3 page(s)";
        $("batch-meta").textContent = meta;
        UI.setStatus($("status"), "Building print sheet…", "info");
        return renderSheets(lastPasses).then(function () {
          working = false;
          UI.setBusy($("generate"), false);
          UI.show($("preview"), true);
          $("do-print").disabled = false;
          scalePreviews();
          var msg = "Ready — Print / Save as PDF (A3 portrait, 3×7).";
          if (vault && vault.vaultFolderUrl) {
            msg += " Saved to vault.";
            $("batch-meta").innerHTML =
              meta +
              ' · <a href="' +
              vault.vaultFolderUrl +
              '" target="_blank" rel="noopener">Open vault folder</a>' +
              (vault.printHtmlUrl
                ? ' · <a href="' +
                  vault.printHtmlUrl +
                  '" target="_blank" rel="noopener">Print file</a>'
                : "") +
              ' · <a href="vault.html">Vault</a>';
          }
          UI.setStatus($("status"), msg, "ok");
        });
      })
      .catch(failNet);
  }

  $("unlock").addEventListener("click", unlock);
  $("generate").addEventListener("click", generate);
  $("do-print").addEventListener("click", function () {
    if (!lastPasses.length) return;
    window.print();
  });
  UI.onEnter($("admin-pin"), unlock);

  function warnLiveConfig() {
    var c = window.PARIVAR_CONFIG || {};
    var tips = [];
    if (c.mode !== "sheets") {
      tips.push("Still in demo mode (localStorage). Set mode: \"sheets\" + webAppUrl before live.");
    }
    if (!(c.publicBaseUrl || "").trim()) {
      tips.push(
        "publicBaseUrl is blank — QR codes will use this browser’s URL. Set the live audience.html URL in config.js before printing for production."
      );
    }
    var el = $("live-warn");
    if (!el) return;
    if (!tips.length) {
      el.className = "status hidden";
      el.textContent = "";
      return;
    }
    el.className = "status status-info";
    el.textContent = tips.join(" ");
  }

  window.addEventListener("resize", scalePreviews);

  function scalePreviews() {
    var preview = $("preview");
    if (!preview || preview.classList.contains("hidden")) return;
    var pages = preview.querySelectorAll(".a3-page-preview");
    var avail = Math.max(280, preview.clientWidth - 16);
    pages.forEach(function (page) {
      var natural = 420 * (96 / 25.4); // ~ mm→css px approx; use offsetWidth after reset
      page.style.transform = "none";
      var w = page.offsetWidth || 420 * 3.78;
      var scale = Math.min(1, avail / w);
      page.style.transformOrigin = "top left";
      page.style.transform = "scale(" + scale + ")";
      page.style.marginBottom = scale < 1 ? -(page.offsetHeight * (1 - scale)) + "px" : "1rem";
    });
  }

  function renderSheets(passes) {
    var per =
      (window.PARIVAR_CONFIG.a3 && window.PARIVAR_CONFIG.a3.perPage) || 21;
    var preview = $("preview");
    var printRoot = $("print-root");
    preview.innerHTML = "";
    printRoot.innerHTML = "";

    var pages = [];
    for (var i = 0; i < passes.length; i += per) {
      pages.push(passes.slice(i, i + per));
    }

    return pages.reduce(function (chain, pagePasses) {
      return chain.then(function () {
        return buildPage(pagePasses, per).then(function (pageHtml) {
          var prev = document.createElement("div");
          prev.className = "a3-page-preview";
          prev.innerHTML = pageHtml;
          preview.appendChild(prev);

          var pr = document.createElement("div");
          pr.className = "a3-page";
          pr.innerHTML = pageHtml;
          printRoot.appendChild(pr);
        });
      });
    }, Promise.resolve());
  }

  function buildPage(pagePasses, per) {
    var cells = pagePasses.map(function (pass) {
      var url = API.audienceUrlForPass(pass.passId);
      return UI.qrDataUrl(url, 160).then(function (qr) {
        return (
          '<div class="pass-cell">' +
          window.ParivarPassHTML.render(pass, qr) +
          "</div>"
        );
      });
    });
    while (cells.length < per) {
      cells.push(Promise.resolve('<div class="pass-cell"></div>'));
    }
    return Promise.all(cells).then(function (htmls) {
      return htmls.join("");
    });
  }
})();
