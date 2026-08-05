# Parivar Pass v2 — Sheet setup

## Tabs

### Passes

Header row:

`passId | status | name | phone | email | generatedAt | validUntil | notes | registeredAt | parsec_jayanagar | whitefield_40 | event_01 | event_02 | event_03 | event_04`

Slot cells: `open` or `redeemed`.  
`status`: `unregistered` | `active`

### Redemptions

`at | passId | benefitId | by | name`

### Config (optional)

`key | value` with `ADMIN_PIN` — prefer Script Properties instead.

## Deploy

1. Open the editable Sheet (not only pubhtml)  
2. Extensions → Apps Script → paste `Code.gs`  
3. Script properties: `ADMIN_PIN` = same as `config.js`  
4. Deploy → Web app → Execute as Me → Anyone  
5. Paste `/exec` URL into `config.js` as `webAppUrl`, set `mode: "sheets"`  
6. Set `publicBaseUrl` to your GitHub Pages audience URL before printing QRs  

Published view for staff reference:  
https://docs.google.com/spreadsheets/d/e/2PACX-1vRJ1o6iAhu3lkbkIK9DOLtOeyyMUW6KR74LOn2YoMZnRdQDe64Thay7PCBZsK5ICL3VxpUj-uLHZgZg/pubhtml
