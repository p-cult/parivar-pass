window.ParivarAPI = (function () {
  function cfg() {
    return window.PARIVAR_CONFIG || { mode: "demo" };
  }

  var MAX_ATTEMPTS = 3;
  var TIMEOUT_MS = 20000;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function fetchWithTimeout(url, opts, ms) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller
      ? setTimeout(function () {
          controller.abort();
        }, ms)
      : null;
    var merged = Object.assign({}, opts, controller ? { signal: controller.signal } : {});
    return fetch(url, merged).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function callSheets(action, payload, attempt) {
    var c = cfg();
    attempt = attempt || 1;
    return fetchWithTimeout(
      c.webAppUrl,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action: action }, payload)),
      },
      TIMEOUT_MS
    )
      .then(function (res) {
        return res.text().then(function (text) {
          try {
            return JSON.parse(text);
          } catch (e) {
            if (attempt < MAX_ATTEMPTS) {
              return sleep(500 * attempt).then(function () {
                return callSheets(action, payload, attempt + 1);
              });
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
        if (attempt < MAX_ATTEMPTS) {
          return sleep(500 * attempt).then(function () {
            return callSheets(action, payload, attempt + 1);
          });
        }
        var timedOut = err && err.name === "AbortError";
        return {
          ok: false,
          error: timedOut
            ? "Request timed out — the Sheets backend may be slow to wake up. Try again."
            : "Network error: " + (err && err.message),
          code: timedOut ? "timeout" : "network",
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
