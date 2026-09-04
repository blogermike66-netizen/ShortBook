# ShortBook Backend

Node.js/Express API for the ShortBook project. Replaces the `window.name` /
`localStorage` shim your pages currently use to pass images and panel data
between page1 → page2 → index → panel-view, and moves PDF generation
server-side.

## Setup

```bash
cd shortbook-backend
npm install
```

Copy your existing pages into `public/`:

```
public/
  page1.html
  page2.html
  index.html
  comic-strip-studio.html
  panel-view.html
  about.html
  policy.html
```

Run it:

```bash
npm start
```

Then open `http://localhost:3000/page1.html`.

## How sessions work

There's no login. On first visit, the server sets a cookie called
`sbSession` with a random id. Every request after that carries the same
cookie, so the server knows which images/panels belong to that visitor —
same idea as your `Store` object, just living in `data/<sessionId>.json`
and `uploads/<sessionId>/` instead of the browser.

## Endpoints

| Method | Path                | Body / Params                          | What it does |
|--------|---------------------|-----------------------------------------|--------------|
| POST   | `/api/upload`       | `FormData` field `images` (multiple)    | Saves files to `uploads/<session>/`, returns updated image list |
| GET    | `/api/images`       | —                                        | Returns this session's image list |
| DELETE | `/api/images/:index`| —                                        | Removes one image by array position |
| GET    | `/api/panels`       | —                                        | Returns saved speech-bubble/panel data for every page |
| POST   | `/api/panels`       | `{ index, data }`                        | Saves panel data for one page |
| POST   | `/api/pdf`          | `{ imageDataUrl }` (from html2canvas)   | Builds a PDF, returns `{ url }` to download |
| GET    | `/api/pdf/status`   | —                                        | `{ exists: true/false }` |

## Front-end changes needed

Your pages currently do this on page1.html:

```js
Store.set("store", store);
window.location.href = "page2.html";
```

Swap that for:

```js
const fd = new FormData();
for (const file of fileInput.files) fd.append("images", file);
await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
window.location.href = "page2.html";
```

And where page2.html currently does `Store.get("store")`, do:

```js
const res = await fetch("/api/images", { credentials: "include" });
const { images } = await res.json();
// images[i].url is a real path like /uploads/<session>/169...-cat.png
// use it directly as sq.style.backgroundImage = `url("${images[i].url}")`
```

`credentials: "include"` matters — it's what makes the browser send the
`sbSession` cookie with each request.

I can go through and update page1.html / page2.html / panel-view.html to
call these endpoints instead of the `Store` shim, if you want that done
next — just say the word.

## Notes

- Storage is flat JSON files under `data/`, no database. Fine for a
  personal project; if this ever needs real users/accounts, swap
  `store.js` for a real database without touching the routes much.
- `pdfkit` builds the PDF from whatever image `html2canvas` produces
  client-side — the render step stays on the front end, only the "turn
  it into a downloadable file" step moved to the server.
- 10MB per-image upload limit and 20 images per request — adjust in
  `routes/api.js` if needed.
