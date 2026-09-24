/**
 * Parivar Pass — configuration
 *
 * The Google Sheet is the database; the Apps Script web app (sheets/Code.gs)
 * is the only backend. Staff PINs, privileges and passes all live in the Sheet.
 */
window.PARIVAR_CONFIG = {
  productName: "Parivar Pass",
  mode: "sheets",
  webAppUrl:
    "https://script.google.com/macros/s/AKfycby-yYeytUiFSvpol728shV6g3J_BkqABXo1dIgrNR9qbbphxTofxKQx12c6aObJTYFT/exec",
  /** Printed QR codes open this page with ?pass=<id>. Never change it after printing. */
  publicBaseUrl: "https://p-cult.github.io/parivar-pass/audience.html",
  /** Admin shortcut to the live Sheet. */
  sheetUrl:
    "https://docs.google.com/spreadsheets/d/1ymF2nWXf-U3tZ6BrlQ8aMTiQnyqdG14XO0-0ymbaRS4/edit",
  social: {
    instagram: "https://instagram.com/",
    label: "Follow Param on Instagram for event details",
  },
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
