/**
 * Renders a pass's privileges — the holder dashboard and the staff desk panel
 * share this so both always show the same thing. Built with textContent only:
 * every value comes from the Sheet and must never be treated as HTML.
 */
window.ParivarView = (function () {
  var GROUPS = [
    { kinds: ["free"], title: "Free entry" },
    { kinds: ["discount"], title: "Discounts & events" },
    { kinds: ["link", "file"], title: "Media & files" },
  ];
  var STATE_LABEL = { enabled: "Available", used: "Used", disabled: "Off" };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function badge(state) {
    return el("span", "badge badge-" + state, STATE_LABEL[state] || state);
  }

  function grouped(privs) {
    var known = {};
    var out = GROUPS.map(function (g) {
      g.kinds.forEach(function (k) {
        known[k] = true;
      });
      return {
        title: g.title,
        items: privs.filter(function (p) {
          return g.kinds.indexOf(p.kind) >= 0;
        }),
      };
    });
    var other = privs.filter(function (p) {
      return !known[p.kind];
    });
    if (other.length) out.push({ title: "Other", items: other });
    return out.filter(function (g) {
      return g.items.length;
    });
  }

  /** Pass holder view. onUse(priv) is called for holder-redeemable items. */
  function renderHolder(root, pass, onUse) {
    root.textContent = "";
    var groups = grouped(pass.privileges || []);
    if (!groups.length) {
      root.appendChild(el("p", "hint", "No privileges are active on this pass right now."));
      return;
    }
    groups.forEach(function (g) {
      root.appendChild(el("h3", "group-title", g.title));
      g.items.forEach(function (p) {
        var card = el("div", "priv priv-" + p.state);
        var head = el("div", "priv-head");
        head.appendChild(el("strong", "", p.title));
        if (p.kind !== "link" && p.kind !== "file") head.appendChild(badge(p.state));
        card.appendChild(head);
        if (p.detail) card.appendChild(el("p", "priv-detail", p.detail));

        if ((p.kind === "link" || p.kind === "file") && p.url) {
          var a = el("a", "button secondary", p.kind === "file" ? "Open file" : "Open link");
          a.href = p.url;
          a.target = "_blank";
          a.rel = "noopener";
          card.appendChild(a);
        } else if (p.state === "enabled" && p.redeemBy === "holder") {
          var b = el("button", "", "Confirm my spot");
          b.type = "button";
          b.addEventListener("click", function () {
            onUse(p, b);
          });
          card.appendChild(b);
          card.appendChild(el("p", "hint", "Confirming uses this privilege, even if you can't attend."));
        } else if (p.state === "enabled") {
          card.appendChild(el("p", "hint", "Show this pass at the desk to use it."));
        }
        root.appendChild(card);
      });
    });
  }

  /** Staff view. onSet(priv, state, button) changes a privilege. */
  function renderStaff(root, pass, staff, onSet) {
    root.textContent = "";
    var isAdmin = staff.role === "admin";
    var blocked = pass.invalidReason || pass.status !== "active";
    grouped(pass.privileges || []).forEach(function (g) {
      root.appendChild(el("h3", "group-title", g.title));
      g.items.forEach(function (p) {
        var card = el("div", "priv priv-" + p.state);
        var head = el("div", "priv-head");
        head.appendChild(el("strong", "", p.title));
        head.appendChild(badge(p.state));
        card.appendChild(head);
        if (p.detail) card.appendChild(el("p", "priv-detail", p.detail));

        var row = el("div", "btn-row");
        if (isAdmin) {
          ["enabled", "used", "disabled"].forEach(function (s) {
            var b = el("button", s === p.state ? "seg on" : "seg", STATE_LABEL[s]);
            b.type = "button";
            b.disabled = s === p.state;
            b.addEventListener("click", function () {
              onSet(p, s, b);
            });
            row.appendChild(b);
          });
        } else if (p.state === "enabled" && !blocked) {
          var use = el("button", "", "Mark used");
          use.type = "button";
          use.addEventListener("click", function () {
            onSet(p, "used", use);
          });
          row.appendChild(use);
        }
        if (row.childNodes.length) card.appendChild(row);
        root.appendChild(card);
      });
    });
  }

  function statusText(pass) {
    if (pass.invalidReason === "void") return "Cancelled";
    if (pass.invalidReason === "expired") return "Expired";
    if (pass.status === "active") return "Active";
    return "Unclaimed";
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return iso;
    var m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(p[1]) - 1];
    return Number(p[2]) + " " + m + " " + p[0];
  }

  return {
    renderHolder: renderHolder,
    renderStaff: renderStaff,
    statusText: statusText,
    formatDate: formatDate,
  };
})();
