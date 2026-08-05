window.ParivarUI = (function () {
  function $(id) {
    return document.getElementById(id);
  }
  function show(el, on) {
    if (!el) return;
    el.classList.toggle("hidden", !on);
  }
  function setStatus(el, message, kind) {
    if (!el) return;
    if (!message) {
      el.className = "status hidden";
      el.textContent = "";
      return;
    }
    el.className = "status status-" + (kind || "info");
    el.textContent = message;
  }
  function escapeHtml(t) {
    return String(t)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function setBusy(btn, busy, labelWhenBusy) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent;
      btn.disabled = true;
      if (labelWhenBusy) btn.textContent = labelWhenBusy;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.textContent = btn.dataset.label;
    }
  }
  function onEnter(input, handler) {
    if (!input) return;
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        handler();
      }
    });
  }
  function passParam() {
    var params = new URLSearchParams(location.search);
    return (params.get("pass") || "").trim().toUpperCase();
  }
  function modeLabel() {
    var c = window.PARIVAR_CONFIG || {};
    return (
      (c.mode === "sheets" ? "Sheets live" : "Demo mode") +
      " · " +
      (c.productName || "Parivar Pass v2")
    );
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load " + src));
      };
      document.head.appendChild(s);
    });
  }
  function loadQrLib() {
    if (window.QRCode) return Promise.resolve();
    return loadScript("vendor/qrcode.min.js").catch(function () {
      return loadScript(
        "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"
      );
    });
  }
  function qrDataUrl(text, size) {
    size = size || 128;
    return loadQrLib().then(function () {
      return new Promise(function (resolve, reject) {
        var hold = document.createElement("div");
        hold.style.position = "absolute";
        hold.style.left = "-9999px";
        document.body.appendChild(hold);
        try {
          new window.QRCode(hold, {
            text: text,
            width: size,
            height: size,
            correctLevel: window.QRCode.CorrectLevel.M,
          });
        } catch (err) {
          document.body.removeChild(hold);
          reject(err);
          return;
        }
        function finish() {
          var canvas = hold.querySelector("canvas");
          var img = hold.querySelector("img");
          var url = "";
          try {
            if (canvas) url = canvas.toDataURL("image/png");
            else if (img && img.src) url = img.src;
          } catch (err) {
            if (hold.parentNode) document.body.removeChild(hold);
            reject(err);
            return;
          }
          if (hold.parentNode) document.body.removeChild(hold);
          if (!url) {
            reject(new Error("QR render produced no image"));
            return;
          }
          resolve(url);
        }
        if (hold.querySelector("canvas") || hold.querySelector("img")) {
          finish();
        } else {
          setTimeout(finish, 80);
        }
      });
    });
  }
  return {
    $: $,
    show: show,
    setStatus: setStatus,
    escapeHtml: escapeHtml,
    setBusy: setBusy,
    onEnter: onEnter,
    passParam: passParam,
    modeLabel: modeLabel,
    loadQrLib: loadQrLib,
    qrDataUrl: qrDataUrl,
  };
})();
