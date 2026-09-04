// server.js

require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { MongoClient } = require("mongodb");

const apiRouter = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------
// MONGODB
// ---------------------------------------------------------------

const client = new MongoClient(process.env.MONGODB_URI);

let db;

async function connectDB() {
  try {
    await client.connect();

    db = client.db("shortstory");

    console.log("MongoDB connected!");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

// ---------------------------------------------------------------
// EXPRESS
// ---------------------------------------------------------------

app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());

// ---------------------------------------------------------------
// SESSION
// ---------------------------------------------------------------

app.use((req, res, next) => {
  let sessionId = req.cookies.sbSession;

  if (!sessionId) {
    sessionId = uuidv4();

    res.cookie("sbSession", sessionId, {
      maxAge: 1000 * 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: "lax",
    });
  }

  req.sessionId = sessionId;

  // Make MongoDB available to your routes
  req.db = db;

  next();
});

// ---------------------------------------------------------------
// STATIC FILES
// ---------------------------------------------------------------

app.use(
  express.static(path.join(__dirname, "public"), {
    index: "page1.html",
  })
);

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

app.use(
  "/pdfs",
  express.static(path.join(__dirname, "pdfs"))
);

// ---------------------------------------------------------------
// API ROUTES
// ---------------------------------------------------------------

app.use("/api", apiRouter);

// ---------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------

async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`ShortBook backend running at http://localhost:${PORT}`);
  });
}

startServer();