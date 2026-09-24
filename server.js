require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const nodemailer = require("nodemailer");
const narrationRouter = require("./routes/narration");

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" })); // pages have base64 images in them
app.use("/api", narrationRouter); // /api/narrate + /api/narrate/audio/:key

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env - see .env.example");
  process.exit(1);
}
if (!ADMIN_KEY) {
  console.error("Missing ADMIN_KEY in .env - see .env.example");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// One page of a book: a picture plus whatever speech bubbles/pointers
// control.html saved for it. Matches the shape control.html already
// builds client-side, so nothing has to be reshaped on the way in/out.
const pageSchema = new mongoose.Schema(
  {
    page: Number,
    image: String, // base64 data URL
    text: String,
    text2: String,
    position1: mongoose.Schema.Types.Mixed,
    position2: mongoose.Schema.Types.Mixed,
    extras: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  cover: String, // base64 data URL, usually pages[0].image
  pages: { type: [pageSchema], validate: (v) => v.length > 0 },
  updatedAt: { type: Date, default: Date.now },
});

const Book = mongoose.model("Book", bookSchema);

// One subscriber email address. Kept deliberately minimal - just enough
// to send a "new story is up" notice.
const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});
const Subscriber = mongoose.model("Subscriber", subscriberSchema);

// Mailer: works with any SMTP provider - set these in .env. Brevo's free
// tier (300 emails/day, no card required) is a good default - see
// EMAIL-SETUP.md for how to get these values.
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
} else {
  console.warn("SMTP_HOST/SMTP_USER/SMTP_PASS not set - new-story emails will be skipped. See EMAIL-SETUP.md.");
}

// Emails every subscriber that a new book is up. Never throws - a mail
// failure should never break publishing a book.
async function notifySubscribersOfNewBook(book) {
  if (!transporter) return;
  try {
    const subscribers = await Subscriber.find({}, { email: 1 });
    if (subscribers.length === 0) return;

    const bookUrl = `${process.env.SITE_URL || ""}/index.html?id=${book._id}`;
    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      bcc: subscribers.map((s) => s.email), // bcc - subscribers don't see each other
      subject: `New story on Short Book: ${book.title}`,
      text: `A new story just went up - "${book.title}".\n\nRead it here: ${bookUrl}`,
    });
    console.log(`Notified ${subscribers.length} subscriber(s) about "${book.title}"`);
  } catch (err) {
    console.error("Failed to send new-book notification emails:", err);
  }
}

// Only control.html ever sends this header. Checked on the server, not
// trusted from the browser - the key never has to leave your machine
// except as this header value.
function requireAdmin(req, res, next) {
  const key = req.get("x-admin-key");
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Wrong key" });
  }
  next();
}

// Public: list every published book, newest first. Deliberately leaves
// "pages" out - shop.html/page1.html only need title+cover to show a
// card, and pages can get big once there are a lot of books.
app.get("/api/books", async (req, res) => {
  try {
    const books = await Book.find({}, { pages: 0 }).sort({ updatedAt: -1 });
    res.json(books);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load books" });
  }
});

// Public: the full book (with pages) for reading in index.html.
app.get("/api/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Not found" });
    res.json(book);
  } catch (err) {
    res.status(404).json({ error: "Not found" });
  }
});

// Public: subscribe an email to "new story" notifications.
app.post("/api/subscribe", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!looksLikeEmail) {
      return res.status(400).json({ error: "That doesn't look like a valid email" });
    }
    await Subscriber.updateOne({ email }, { email }, { upsert: true });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save that email" });
  }
});

// Admin only: create a new book, or update one if an id is given.
app.post("/api/books", requireAdmin, async (req, res) => {
  try {
    const { id, title, cover, pages } = req.body;
    if (!title || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({ error: "Title and at least one page are required" });
    }

    let book = null;
    let isNewBook = false;
    if (id) {
      book = await Book.findByIdAndUpdate(
        id,
        { title, cover, pages, updatedAt: new Date() },
        { new: true, runValidators: true }
      );
    }
    if (!book) {
      book = await Book.create({ title, cover, pages });
      isNewBook = true;
    }

    res.json(book);

    // Fire-and-forget - don't make the admin wait on email sending.
    if (isNewBook) notifySubscribersOfNewBook(book);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save book" });
  }
});

// Admin only: remove a book.
app.delete("/api/books/:id", requireAdmin, async (req, res) => {
  try {
    await Book.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete book" });
  }
});

// Landing page: shop.html instead of the static default of index.html.
// Must come BEFORE express.static, which would otherwise hand out
// index.html for "/" on its own.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "shop.html"));
});

// Serves the PUBLIC reading site only. Keep control.html and bake.html
// OUT of this folder - they're the owner tools and should never be
// deployed alongside this.
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Short Book server running on http://localhost:${PORT}`);
});