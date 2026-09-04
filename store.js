// store.js
// Tiny file-based database. Each session gets one JSON file:
//   data/<sessionId>.json  ->  { images: [...], panels: [...] }
// No real database needed for a project this size - just read the
// file, change it in memory, write it back. Same idea as the
// localStorage Store object you already had on the front end, just
// living on the server instead of in the browser.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");

function filePath(sessionId) {
  return path.join(DATA_DIR, `${sessionId}.json`);
}

function readSession(sessionId) {
  const file = filePath(sessionId);
  if (!fs.existsSync(file)) {
    return { images: [], panels: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    console.error(`Could not parse session file for ${sessionId}:`, err);
    return { images: [], panels: [] };
  }
}

function writeSession(sessionId, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(sessionId), JSON.stringify(data, null, 2));
}

module.exports = { readSession, writeSession };
