// routes/api.js
// All the endpoints your front-end pages will call instead of reading
// and writing window.name / localStorage directly.
//
//   POST   /api/upload        - upload one or more images
//   GET    /api/images        - list this session's images
//   DELETE /api/images/:index - remove one image by its position
//   GET    /api/panels        - get all saved panel/speech-bubble data
//   POST   /api/panels        - save panel/speech-bubble data for one page
//   POST   /api/pdf           - turn a rendered comic page into a PDF
//   GET    /api/pdf/status    - check whether a PDF already exists

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const { readSession, writeSession } = require("../store");

const router = express.Router();

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");
const PDF_ROOT = path.join(__dirname, "..", "pdfs");

// -----------------------------------------------------------------
// MULTER SETUP (handles the multipart/form-data file upload)
// -----------------------------------------------------------------
// Each session gets its own sub-folder under uploads/, so one
// person's pictures never collide with another's.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, req.sessionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // keep it simple + collision-proof: timestamp + original name
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per image
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

// -----------------------------------------------------------------
// IMAGES
// -----------------------------------------------------------------

// Upload one or more images. Field name must be "images" on the client:
//   const fd = new FormData();
//   for (const file of fileInput.files) fd.append("images", file);
//   fetch("/api/upload", { method: "POST", body: fd });
router.post("/upload", upload.array("images", 20), (req, res) => {
  const session = readSession(req.sessionId);

  const newEntries = req.files.map((f) => ({
    filename: f.filename,
    url: `/uploads/${req.sessionId}/${f.filename}`,
  }));

  session.images.push(...newEntries);
  writeSession(req.sessionId, session);

  res.json({ images: session.images });
});

// List this session's images (what page1/page2's renderSquares() loops over).
router.get("/images", (req, res) => {
  const session = readSession(req.sessionId);
  res.json({ images: session.images });
});

// Remove one image by its index in the array (matches the "x" button
// and the Delete Back / Delete Forward buttons on page2).
router.delete("/images/:index", (req, res) => {
  const session = readSession(req.sessionId);
  const index = parseInt(req.params.index, 10);

  if (Number.isNaN(index) || index < 0 || index >= session.images.length) {
    return res.status(404).json({ error: "Image not found" });
  }

  const [removed] = session.images.splice(index, 1);

  // also delete the actual file from disk so uploads/ doesn't fill up
  if (removed) {
    const filePath = path.join(UPLOAD_ROOT, req.sessionId, removed.filename);
    fs.unlink(filePath, () => {}); // ignore errors - file may already be gone
  }

  writeSession(req.sessionId, session);
  res.json({ images: session.images });
});

// -----------------------------------------------------------------
// PANELS (speech bubbles / positions per comic page)
// -----------------------------------------------------------------

// Get everything saved so far - shape matches what panel-view.html
// already expects: an array where panels[i] = { position1, position2, extras }
router.get("/panels", (req, res) => {
  const session = readSession(req.sessionId);
  res.json({ panels: session.panels });
});

// Save (or overwrite) the data for a single page.
// Body: { index: 0, data: { position1: [...], position2: [...], extras: {...} } }
router.post("/panels", (req, res) => {
  const { index, data } = req.body;

  if (typeof index !== "number" || index < 0) {
    return res.status(400).json({ error: "A valid page 'index' is required" });
  }

  const session = readSession(req.sessionId);
  session.panels[index] = data;
  writeSession(req.sessionId, session);

  res.json({ panels: session.panels });
});

// -----------------------------------------------------------------
// PDF EXPORT
// -----------------------------------------------------------------

// Body: { imageDataUrl: "data:image/png;base64,...." }
// The front end still uses html2canvas to render the finished comic
// page to an image (that part doesn't need to change) - it just posts
// the resulting data URL here instead of building the PDF itself with
// jsPDF. Keeping the render on the client and the PDF assembly on the
// server means huge multi-page comics don't have to travel back and
// forth more than once.
router.post("/pdf", (req, res) => {
  const { imageDataUrl } = req.body;
  if (!imageDataUrl || !imageDataUrl.startsWith("data:image")) {
    return res.status(400).json({ error: "imageDataUrl is required" });
  }

  const base64 = imageDataUrl.split(",")[1];
  const imgBuffer = Buffer.from(base64, "base64");

  fs.mkdirSync(PDF_ROOT, { recursive: true });
  const pdfPath = path.join(PDF_ROOT, `${req.sessionId}.pdf`);

  // Size the PDF page to the image itself so nothing gets cropped or
  // letterboxed - this mirrors the [w, h] custom-format trick the old
  // client-side jsPDF code used.
  const doc = new PDFDocument({ autoFirstPage: false });
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  // pdfkit needs image dimensions up front; easiest reliable way
  // without an extra image-parsing library is to just embed at a fixed
  // comic-page size (matches the 7:9 aspect ratio used in panel-view.html).
  const pageWidth = 700;
  const pageHeight = 900;
  doc.addPage({ size: [pageWidth, pageHeight] });
  doc.image(imgBuffer, 0, 0, { fit: [pageWidth, pageHeight], align: "center", valign: "center" });
  doc.end();

  writeStream.on("finish", () => {
    res.json({ url: `/pdfs/${req.sessionId}.pdf` });
  });
  writeStream.on("error", (err) => {
    console.error("PDF write failed:", err);
    res.status(500).json({ error: "Could not generate PDF" });
  });
});

// Quick check so the front end can grey out "Download" until a PDF exists.
router.get("/pdf/status", (req, res) => {
  const pdfPath = path.join(PDF_ROOT, `${req.sessionId}.pdf`);
  res.json({ exists: fs.existsSync(pdfPath) });
});

module.exports = router;
