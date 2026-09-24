(function () {
  var UI = window.ParivarUI;
  var API = window.ParivarAPI;
  var $ = UI.$;
  var pin = "";
  var working = false;
  var parsedRows = [];
  var assigned = []; // { name, phone, email, passId, validUntil } for successful rows

  $("mode-pill").textContent = UI.modeLabel();

  function failNet(err) {
    working = false;
    UI.setStatus(
      $("status"),
      "Request failed: " + ((err && err.message) || String(err)),
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
        if (!res.ok) {
          UI.setStatus($("status"), res.error || "Unlock failed", "bad");
          return;
        }
        UI.show($("auth-panel"), false);
        UI.show($("paste-panel"), true);
        UI.setStatus($("status"), "Unlocked", "ok");
        $("tsv").focus();
      })
      .catch(failNet);
  }

  function parseLine(line) {
    var parts = line.split("\t");
    if (parts.length === 1) {
      // Fallback: allow comma-separated too, if no tabs present.
      parts = line.split(",");
    }
    var name = (parts[0] || "").trim();
    var phone = (parts[1] || "").trim();
    var email = (parts[2] || "").trim();
    return { name: name, phone: phone, email: email };
  }

  function parse() {
    var raw = $("tsv").value || "";
    var lines = raw.split(/\r?\n/).map(function (l) {
      return l.trim();
    }).filter(function (l) {
      return l.length > 0;
    });
    parsedRows = lines.map(parseLine).filter(function (r) {
      return r.name;
    });
    // Drop an obvious header row ("name", "name<tab>phone", …).
    if (parsedRows.length && /^name$/i.test(parsedRows[0].name)) {
      parsedRows.shift();
    }
    var wrap = $("preview-wrap");
    if (!parsedRows.length) {
      UI.show(wrap, false);
      UI.setStatus($("status"), "No names found — check the pasted list.", "bad");
      return;
    }
    $("preview-count").textContent = parsedRows.length + " people parsed.";
    var rowsHtml = parsedRows
      .map(function (r) {
        return (
          "<tr><td>" +
          UI.escapeHtml(r.name) +
          "</td><td>" +
          UI.escapeHtml(r.phone || "—") +
          "</td><td>" +
          UI.escapeHtml(r.email || "—") +
          "</td></tr>"
        );
      })
      .join("");
    $("preview-table").innerHTML =
      "<tr><th>Name</th><th>Phone</th><th>Email</th></tr>" + rowsHtml;
    UI.show(wrap, true);
    UI.setStatus($("status"), "", "info");
  }

  function assignAll() {
    if (working || !parsedRows.length) return;
    working = true;
    UI.setBusy($("assign"), true, "Assigning…");
    UI.setStatus($("status"), "Assigning " + parsedRows.length + " passes…", "info");

    var results = [];
    var chain = parsedRows.reduce(function (p, row) {
      return p.then(function () {
        return API.call("adminAssign", {
          pin: pin,
          name: row.name,
          phone: row.phone,
          email: row.email,
          type: $("type").value,
        }).then(function (res) {
          if (res.ok) {
            results.push({
              name: row.name,
              phone: row.phone,
              email: row.email,
              ok: true,
              passId: res.data.pass.passId,
              validUntil: res.data.pass.validUntil,
            });
          } else {
            results.push({
              name: row.name,
              phone: row.phone,
              email: row.email,
              ok: false,
              error: res.error || "Failed",
            });
          }
        });
      });
    }, Promise.resolve());

    chain
      .then(function () {
        working = false;
        UI.setBusy($("assign"), false);
        renderResults(results);
      })
      .catch(failNet);
  }

  function renderResults(results) {
    assigned = results.filter(function (r) {
      return r.ok;
    });
    var okCount = assigned.length;
    var badCount = results.length - okCount;
    $("results-summary").textContent =
      okCount + " assigned" + (badCount ? ", " + badCount + " failed" : "") + ".";
    var rowsHtml = results
      .map(function (r) {
        return (
          "<tr><td>" +
          UI.escapeHtml(r.name) +
          "</td><td>" +
          UI.escapeHtml(r.phone || "—") +
          "</td>" +
          (r.ok
            ? '<td class="ok">' + UI.escapeHtml(r.passId) + "</td>"
            : '<td class="err">' + UI.escapeHtml(r.error) + "</td>") +
          "</tr>"
        );
      })
      .join("");
    $("results-table").innerHTML =
      "<tr><th>Name</th><th>Phone</th><th>Pass / error</th></tr>" + rowsHtml;
    UI.show($("results-panel"), true);
    $("do-print").disabled = !okCount;
    UI.setStatus(
      $("status"),
      okCount
        ? "Done. Ready to print " + okCount + " pass(es)."
        : "No passes were assigned — see errors below.",
      okCount ? "ok" : "bad"
    );
  }

  function buildPrintSheet() {
    if (!assigned.length) return;
    var preview = $("preview");
    var printRoot = $("print-root");
    preview.innerHTML = "";
    printRoot.innerHTML = "";
    var per = (window.PARIVAR_CONFIG.a3 && window.PARIVAR_CONFIG.a3.perPage) || 21;

    var pages = [];
    for (var i = 0; i < assigned.length; i += per) {
      pages.push(assigned.slice(i, i + per));
    }

    var chain = pages.reduce(function (p, pagePasses) {
      return p.then(function () {
        var cells = pagePasses.map(function (a) {
          var url = API.audienceUrlForPass(a.passId);
          return UI.qrDataUrl(url, 160).then(function (qr) {
            return (
              '<div class="pass-cell">' +
              window.ParivarPassHTML.render(
                { name: a.name, validUntil: a.validUntil },
                qr
              ) +
              "</div>"
            );
          });
        });
        while (cells.length < per) {
          cells.push(Promise.resolve('<div class="pass-cell"></div>'));
        }
        return Promise.all(cells).then(function (htmls) {
          var html = htmls.join("");
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
    }, Promise.resolve());

    return chain.then(function () {
      UI.show(preview, true);
      window.print();
    });
  }

  $("unlock").addEventListener("click", unlock);
  UI.onEnter($("admin-pin"), unlock);
  if ($("admin-pin").value) unlock();
  $("parse").addEventListener("click", parse);
  $("assign").addEventListener("click", assignAll);
  $("do-print").addEventListener("click", buildPrintSheet);
})();
