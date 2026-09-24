# Parivar Pass

One QR pass for Param's paying customers and the professionals we work with —
free entries, discounts, events, media links and files. Plain HTML/CSS/JS pages
on GitHub Pages; **the Google Sheet is the whole database**, served by one Apps
Script web app (`sheets/Code.gs`).

## How it works

| Who | Page | What happens |
|---|---|---|
| Pass holder | `audience.html?pass=…` (the QR) | First scan: claim the pass (name, phone). Later scans: dashboard of free entries, discounts, events (RSVP), media and files. |
| Ticket checker | `desk.html` | Sign in once with a staff PIN. Every pass scanned with that phone's camera then opens in staff view — **Mark used**. |
| Admin | `admin.html` | Overview, plus: `print.html` (mint in bulk or singly, reprint any batch), `assign.html` (paste names onto unclaimed passes), and full control of every privilege (Available / Used / Off), assigning by scan, cancelling passes. |

Printed QR codes point at `audience.html?pass=<id>` — never rename that page.

## The Sheet

| Tab | Purpose |
|---|---|
| `passes` | One row per pass (headers on row 10). Core columns + **one column per privilege**; cells are `enabled`, `used` or `disabled` (blank = the privilege's default). Filter + fill down = bulk actions. `status`: `unclaimed` / `active` / `void`. |
| `privileges` | `id, title, kind, detail, url, redeemBy, default, active`. kind: `free` / `discount` / `link` / `file`. redeemBy: `staff` (desk marks used), `holder` (holder RSVPs), `none` (view only). |
| `staff` | `name, pin, role, active, notes`. role `checker` can only mark privileges used; `admin` can do everything. Set active to FALSE to revoke. |
| `log` | Every claim, redemption and admin change, with who did it. |

Sheet menu **Parivar Pass → Set up / sync** creates missing tabs and adds a
`passes` column for every privilege. Edits to `privileges` / `staff` apply
immediately.

## Deploy the backend

Paste `sheets/Code.gs` into the Sheet's Apps Script project, then
**Deploy → Manage deployments → Edit → New version** (Execute as: Me,
Access: Anyone). The URL stays the same, so `config.js` doesn't change.

## Run locally

```bash
python3 -m http.server 8000
```
