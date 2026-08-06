window.ParivarAPI = (function () {
  function cfg() {
    return window.PARIVAR_CONFIG || { mode: "demo" };
  }

  function callSheets(action, payload, attempt) {
    var c = cfg();
    attempt = attempt || 1;
    return fetch(c.webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: action }, payload)),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          try {
            return JSON.parse(text);
          } catch (e) {
            if (attempt < 2) {
              return callSheets(action, payload, attempt + 1);
            }
            return {
              ok: false,
              error:
                "Sheets returned non-JSON (HTTP " +
                res.status +
                "). Check Apps Script deploy.",
              code: "bad_response",
            };
          }
        });
      })
      .catch(function (err) {
        if (attempt < 2) {
          return callSheets(action, payload, attempt + 1);
        }
        return {
          ok: false,
          error: "Network error: " + (err && err.message),
          code: "network",
        };
      });
  }

  function call(action, payload) {
    payload = payload || {};
    var c = cfg();
    if (c.mode === "sheets") {
      if (!c.webAppUrl) {
        return Promise.resolve({
          ok: false,
          error: "Set webAppUrl in config.js after deploying Apps Script.",
          code: "config",
        });
      }
      return callSheets(action, payload, 1);
    }
    try {
      if (!window.ParivarDemo || typeof window.ParivarDemo.handle !== "function") {
        return Promise.resolve({
          ok: false,
          error: "Demo store failed to load.",
          code: "config",
        });
      }
      return Promise.resolve(window.ParivarDemo.handle(action, payload));
    } catch (err) {
      return Promise.resolve({
        ok: false,
        error: "Demo error: " + ((err && err.message) || String(err)),
        code: "exception",
      });
    }
  }

  function audienceUrlForPass(passId) {
    var c = cfg();
    var base = (c.publicBaseUrl || "").trim();
    if (!base) {
      var path = location.pathname.replace(/[^/]+$/, "");
      base = location.origin + path + "audience.html";
    }
    var join = base.indexOf("?") >= 0 ? "&" : "?";
    return base + join + "pass=" + encodeURIComponent(passId);
  }

  return { call: call, audienceUrlForPass: audienceUrlForPass };
})();
