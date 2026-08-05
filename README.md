# Parivar Pass v2

Trackable QR pass for Param. Frontend from **Git**; backend **Google Sheet** (optional).

## Story

1. Staff generate an **A3 PDF** of HTML/CSS passes (**landscape 8.5 × 5.5 cm**, **21 per page**).
2. **Valid Till** = generation date **+ 6 months**.
3. Handed to **select people** — **no replacements**.
4. First scan → **register** (first bearer).
5. **Events:** holder RSVPs (uses that slot even if no-show); desk verifies.
6. **Parsec / Whitefield:** holder shows pass at ticket desk; staff open **admin**, look up pass, **manually disable** that privilege.
7. Event details → social media (link in the app).

## Run locally

```bash
python3 -m http.server 8000
```

| Page | Who |
|------|-----|
| [index.html](index.html) | Public home |
| [design.html](design.html) | Live pass art preview |
| [audience.html](audience.html) | Pass holder (QR lands here) |
| [print.html](print.html) | Generate A3 PDF (PIN) |
| [admin.html](admin.html) | **Staff only** |

Demo passes: `PV2-DEMOOPEN01`, `PV2-DEMOACTIVE`  
Demo PIN: `param2468` (change in `config.js`)

## Go-live checklist

1. **Change `adminPin`** in [`config.js`](config.js)
2. **Set `publicBaseUrl`** to the live `audience.html` URL (printed QR codes use this)
3. Deploy [`sheets/Code.gs`](sheets/Code.gs) → set `mode: "sheets"` + `webAppUrl`
4. Update `social.instagram`
5. Smoke-test: print 1 pass → scan QR → register → RSVP → admin redeem
6. Confirm Print dialog: A3 portrait, background graphics on

## Pass card (HTML/CSS)

**Source of truth:** [`param-parivar-pass.html`](param-parivar-pass.html) — use as-is.

- Styles mirrored in [`pass.css`](pass.css)
- Batch/print markup in [`pass-html.js`](pass-html.js) (same card; QR + Valid Till date filled)
- Live QR preview: [`design.html`](design.html)

## Print size (locked)

- Card: **85 × 55 mm** landscape (8.5 × 5.5 cm)
- Sheet: **A3 portrait**, **3 × 7 = 21**
- QR library is vendored under `vendor/` (works offline)

## Google Sheet

Published view:  
https://docs.google.com/spreadsheets/d/e/2PACX-1vRJ1o6iAhu3lkbkIK9DOLtOeyyMUW6KR74LOn2YoMZnRdQDe64Thay7PCBZsK5ICL3VxpUj-uLHZgZg/pubhtml

`pubhtml` is read-only. For Admin to disable slots, deploy [sheets/Code.gs](sheets/Code.gs) on the **editable** spreadsheet, then in `config.js`:

```js
mode: "sheets",
webAppUrl: "https://script.google.com/macros/s/…/exec",
publicBaseUrl: "https://YOUR_USER.github.io/app-a-day/kits/season-pass/audience.html",
```

See [sheets/README.md](sheets/README.md) for column headers.

## Privileges

| Slot | How used |
|------|----------|
| Parsec · Jayanagar | Admin desk redeem |
| Whitefield 40% | Admin desk redeem |
| Event 01–04 | Audience RSVP |
