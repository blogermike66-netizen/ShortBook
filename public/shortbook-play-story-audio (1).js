// Drop this into index.html (or shop.html for read-only mode) wherever
// you handle the "read aloud" / narration button.
//
// Example: <select id="languageSelect">
//            <option value="english">English</option>
//            <option value="zulu">isiZulu</option>
//            <option value="afrikaans">Afrikaans</option>
//          </select>
//          <button onclick="playCurrentPanelAudio()">🔊 Read aloud</button>

async function playStoryAudio(text, language) {
  const response = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
  });

  if (!response.ok) {
    console.error('Failed to generate speech');
    return;
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);
  audio.play();
}

// Example wiring - adjust to however you currently grab the current
// panel's speech bubble text and selected language
function playCurrentPanelAudio() {
  const text = getCurrentPanelText(); // your existing function
  const language = document.getElementById('languageSelect').value;
  playStoryAudio(text, language);
}
