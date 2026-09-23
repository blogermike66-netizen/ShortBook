// shortbook-translate-speak-routes.js
//
// Adds two routes to your Express app:
//   POST /api/translate  -> just translates story text
//   POST /api/speak      -> translates AND returns spoken audio (MP3)
//
// SETUP:
//   1. npm install @travisvn/edge-tts
//      (Node 18+ has fetch built in, so no extra package needed for MyMemory)
//
//   2. In server.js, add near your other requires:
//      const { registerStoryLanguageRoutes } = require('./shortbook-translate-speak-routes');
//
//   3. After you create your Express `app`, add:
//      registerStoryLanguageRoutes(app);

const { EdgeTTS } = require('@travisvn/edge-tts');

// Add more languages here as you support them.
// myMemoryCode = language code MyMemory understands
// voice = Edge neural voice name (must exist in the edge-tts voice list)
const LANGUAGES = {
  zulu: { myMemoryCode: 'zu', voice: 'zu-ZA-ThandoNeural' },
  afrikaans: { myMemoryCode: 'af', voice: 'af-ZA-AdriNeural' },
  english: { myMemoryCode: 'en', voice: 'en-US-EmmaMultilingualNeural' },
};

async function translateText(text, targetLangKey) {
  const lang = LANGUAGES[targetLangKey];
  if (!lang) throw new Error(`Unsupported language: ${targetLangKey}`);

  // No need to call the API if the story is already in English
  if (lang.myMemoryCode === 'en') {
    return text;
  }

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
    text
  )}&langpair=en|${lang.myMemoryCode}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.responseData || !data.responseData.translatedText) {
    throw new Error('Translation failed - unexpected response from MyMemory');
  }

  return data.responseData.translatedText;
}

async function synthesizeSpeech(text, targetLangKey) {
  const lang = LANGUAGES[targetLangKey];
  if (!lang) throw new Error(`Unsupported language: ${targetLangKey}`);

  const tts = new EdgeTTS(text, lang.voice);
  const result = await tts.synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

function registerStoryLanguageRoutes(app) {
  // Translate only - useful if you want to display the translated text on screen
  app.post('/api/translate', async (req, res) => {
    try {
      const { text, language } = req.body;
      if (!text || !language) {
        return res.status(400).json({ error: 'text and language are required' });
      }
      const translated = await translateText(text, language);
      res.json({ translated });
    } catch (err) {
      console.error('Translate error:', err);
      res.status(500).json({ error: 'Translation failed' });
    }
  });

  // Translate + speak in one call - returns an MP3 file directly
  app.post('/api/speak', async (req, res) => {
    try {
      const { text, language } = req.body;
      if (!text || !language) {
        return res.status(400).json({ error: 'text and language are required' });
      }

      const translated = await translateText(text, language);
      const audioBuffer = await synthesizeSpeech(translated, language);

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
      });
      res.send(audioBuffer);
    } catch (err) {
      console.error('Speak error:', err);
      res.status(500).json({ error: 'Speech generation failed' });
    }
  });
}

module.exports = { registerStoryLanguageRoutes, translateText, synthesizeSpeech, LANGUAGES };
