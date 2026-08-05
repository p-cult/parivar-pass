/**
 * Parivar Pass v2 — configuration
 *
 * mode: "demo" | "sheets"
 * For Sheets: deploy sheets/Code.gs, paste webAppUrl.
 * Frontend is static (GitHub Pages / any Git host).
 *
 * Pass art: landscape 8.5 × 5.5 cm (85 × 55 mm) · 21 per A3 portrait sheet
 *
 * Before going live:
 * 1. Change adminPin
 * 2. Set mode: "sheets" and webAppUrl to your Apps Script /exec URL
 * 3. Set publicBaseUrl to the public audience.html URL (used in printed QR codes)
 * 4. Update social.instagram
 */
window.PARIVAR_CONFIG = {
  productName: "Parivar Pass v2",
  mode: "demo",
  webAppUrl: "",
  /** Only share admin.html with Param desk staff — change before live */
  adminPin: "param2468",
  /**
   * Public audience URL for QR codes (required for live print).
   * Example: "https://YOUR_USER.github.io/app-a-day/kits/season-pass/audience.html"
   * Leave blank only for local demo (uses current origin).
   */
  publicBaseUrl: "https://p-cult.github.io/parivar-pass/audience.html",
  social: {
    instagram: "https://instagram.com/",
    label: "Follow Param on Instagram for event details",
  },
  sheetPubHtml:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRJ1o6iAhu3lkbkIK9DOLtOeyyMUW6KR74LOn2YoMZnRdQDe64Thay7PCBZsK5ICL3VxpUj-uLHZgZg/pubhtml",
  validityMonths: 6,
  passSizeMm: { w: 85, h: 55 },
  a3: {
    cols: 3,
    rows: 7,
    perPage: 21,
    marginMm: 8,
    gapMm: 3,
    orientation: "portrait",
  },
};

window.PARIVAR_BENEFITS = [
  {
    id: "parsec_jayanagar",
    title: "Parsec · Jayanagar",
    blurb: "Free entry — show at ticket desk",
    kind: "venue",
    redeemBy: "admin",
  },
  {
    id: "whitefield_40",
    title: "Whitefield",
    blurb: "40% off — show at ticket desk before purchase",
    kind: "venue",
    redeemBy: "admin",
  },
  {
    id: "event_01",
    title: "Param Event 01",
    blurb: "40% discount",
    kind: "event",
    redeemBy: "audience",
  },
  {
    id: "event_02",
    title: "Param Event 02",
    blurb: "40% discount",
    kind: "event",
    redeemBy: "audience",
  },
  {
    id: "event_03",
    title: "Param Event 03",
    blurb: "40% discount",
    kind: "event",
    redeemBy: "audience",
  },
  {
    id: "event_04",
    title: "Param Event 04",
    blurb: "40% discount",
    kind: "event",
    redeemBy: "audience",
  },
];

