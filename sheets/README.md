# Parivar Pass v2 — Sheet setup

## Tabs

### passes

Tab name: **`passes`** (lowercase is fine; script matches case-insensitively).

**Layout:** rows **1–9** free (title / branding). **Row 10** = headers. **Row 11+** = pass data.

Header row (row 10), exact ids:

`passId | qrUrl | qrSvg | qrSvgFile | status | name | phone | email | generatedAt | validUntil | notes | registeredAt | parsec_jayanagar | whitefield_40 | event_01 | event_02 | event_03 | event_04`

- `passId` — unique id printed on the pass / encoded in the QR  
- `qrUrl` — audience link the QR encodes  
- `qrSvg` — **full SVG markup** for that pass’s QR (written on Print → Generate)  
- `qrSvgFile` — Google Drive link to `{passId}.svg` in folder **Parivar Pass QR** (optional column; also filled on Generate)  
  Example qrUrl: `https://p-cult.github.io/parivar-pass/audience.html?pass=PV2-…`  
- Event slot columns (`event_01` …) **must match `Event Code` values** on the **events** tab. Titles, dates, and links are fetched from **events** — do not hardcode event names on passes.

Slot cells: `open` or `redeemed`.  
`status`: `unregistered` | `active`  
`validUntil`: `yyyy-MM-dd`

**Import template:** [`Passes-template.tsv`](Passes-template.tsv) (File → Import → Replace current sheet).  
Also: [`Redemptions-template.tsv`](Redemptions-template.tsv).

Rename tab from `user` → **passes** if needed. New passes from Print land at row 11 onward.

### events (human-maintained catalog)

Tab name: **`events`**. Same layout: headers **row 10**, data **row 11+**.  
Staff fill this tab by hand. The audience RSVP **dropdown** loads from here.

```
Event List | Event Code | Event Date | Event link
```

| Column | Role |
|--------|------|
| Event List | Label in the pass-holder dropdown |
| Event Code | Must equal the slot column on **passes** (e.g. `event_01`) |
| Event Date | Shown under the selected event |
| Event link | Optional “Event details” link |

**passes** does not store event titles — only `open` / `redeemed` per Event Code.  
Registration, RSVP, and desk redeem write those cells (and Redemptions) from the app screens.

Template: [`events-template.tsv`](events-template.tsv) (includes sample `event_01`…`event_04`).

### Redemptions (optional — not required)

You do **not** need this tab. Used vs unused is stored on **`passes`** in  
`event_01` … `event_04` (and venue columns): `open` or `redeemed`.

If you add a **Redemptions** tab anyway, the script may append a log row; missing tab is fine.

## Deploy

1. Open the editable Sheet (not only pubhtml)  
2. Extensions → Apps Script → paste `Code.gs`  
3. Script properties: `ADMIN_PIN` = same as `config.js`; optional `PUBLIC_BASE_URL`, `QR_FOLDER_ID`  
4. Deploy → Web app → Execute as Me → Anyone  
   (First Generate also authorizes **UrlFetch** + **Drive** to create QR SVGs.)  
5. Paste `/exec` URL into `config.js` as `webAppUrl`, set `mode: "sheets"`  
6. Set `publicBaseUrl` to your GitHub Pages audience URL before printing QRs  

Published view for staff reference:  
https://docs.google.com/spreadsheets/d/e/2PACX-1vRJ1o6iAhu3lkbkIK9DOLtOeyyMUW6KR74LOn2YoMZnRdQDe64Thay7PCBZsK5ICL3VxpUj-uLHZgZg/pubhtml
