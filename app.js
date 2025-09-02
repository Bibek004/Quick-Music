const API = "http://localhost:5001";

function $(id){ return document.getElementById(id); }

// Helper for status updates
function setStatus(element, message, isLoading = false) {
  element.classList.toggle('loading', isLoading);
  if (isLoading) {
    element.innerHTML = `<div class="loader"></div><span>${message}</span>`;
  } else {
    try {
      element.textContent = JSON.stringify(JSON.parse(message), null, 2);
    } catch {
      element.textContent = message;
    }
  }
}

// 1) Add song from YouTube -> /add-youtube
$("btnAddYtSong").onclick = async () => {
  const url = $("ytUrl").value.trim();
  if (!url) {
    setStatus($("ytStatus"), "Please enter a YouTube URL.", false);
    return;
  }
  const name = $("ytName").value.trim();
  setStatus($("ytStatus"), "Requesting download... This may take a moment.", true);
  $("btnAddYtSong").disabled = true;

  try {
    const res = await fetch(`${API}/add-youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, name })
    });
    
    if(res.ok) {
        const data = await res.json();
        setStatus($("ytStatus"), `Added: ${data.name}`);
        refreshSongs();
        $("ytUrl").value = "";
        $("ytName").value = "";
    } else {
        const txt = await res.text();
        setStatus($("ytStatus"), `Error: ${txt}`);
    }
  } catch (e) {
    setStatus($("ytStatus"), "Network Error: " + e.message);
  } finally {
    $("btnAddYtSong").disabled = false;
  }
};

// 2) Refresh DB list -> /songs (populates the right panel)
async function refreshSongs(){
  const res = await fetch(`${API}/songs`);
  const data = await res.json();
  const songList = $("songs");
  songList.innerHTML = "";

  if (data.songs.length === 0) {
    songList.innerHTML = `<li style="text-align: center; color: var(--color-text-muted); padding: 20px;">Database is empty. Add some songs!</li>`;
    return;
  }
  for (const s of data.songs) {
    const li = document.createElement("li");
    const text = `[${s.id}] ${s.name} (${s.fingerprints} fps)`;
    
    if (s.url) {
        const a = document.createElement("a");
        a.href = s.url;
        a.textContent = text;
        a.target = "_blank";
        li.appendChild(a);
    } else {
        li.textContent = text;
    }
    songList.appendChild(li);
  }
}
// Initial load
refreshSongs();


// --- MODIFIED: Microphone Logic ---

// This will hold our single, persistent microphone stream
let persistentMicStream = null;

// 3) Record N seconds using the persistent stream
$("shazamButton").onclick = async () => {
  const secs = 5; // Recording duration
  const resultBox = $("idResult");

  // Check if permission was granted on page load.
  if (!persistentMicStream) {
    setStatus(resultBox, "Microphone permission was not granted. Please allow microphone access and refresh the page.", false);
    return;
  }
  
  try {
    setStatus(resultBox, `Listening for ${secs}s...`, true);
    // The recordAndEncodeWav function now handles enabling and disabling the tracks
    const blob = await recordAndEncodeWav(persistentMicStream, secs);
    
    setStatus(resultBox, "Identifying...", true);
    const res = await fetch(`${API}/recognize`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: await blob.arrayBuffer()
    });
    const result = await res.json();
    displayIdResult(result);
  } catch (e) {
    let errorMsg = "An error occurred during recording or identification: " + e.message;
    setStatus(resultBox, errorMsg);
  }
};

function displayIdResult(result) {
    const container = $("idResult");
    container.classList.remove('loading');
    container.innerHTML = '';

    if (result.error) {
        container.textContent = `An error occurred: ${result.error}`;
        return;
    }
    if (result.match === null) {
        container.textContent = "No match found. 😔 Try again or add more songs to the database.";
        return;
    }
    
    let html = `<h3><i class="fa-solid fa-music"></i>Match Found!</h3>`;
    html += `<div class="matched-song-details">`;
    
    html += `<p><strong>Song:</strong> `;
    if (result.url) {
        html += `<a href="${result.url}" target="_blank">${result.name}</a>`;
    } else {
        html += result.name;
    }
    html += `</p>`;
    html += `</div>`; 
    
    container.innerHTML = html;
}

// --- MODIFIED: Request microphone on page load and KEEP it.
async function initializeMicrophone() {
  const resultBox = $("idResult");
  try {
    setStatus(resultBox, "Waiting for microphone permission...", true);
    // Get the stream and store it in our global variable
    persistentMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Disable the tracks so it's not "active" but the connection is kept.
    persistentMicStream.getTracks().forEach(track => track.enabled = false);
    
    setStatus(resultBox, "Microphone is ready. Click the button to identify a song.", false);
    console.log("Microphone permission granted and stream is being held.");
    
  } catch (e) {
    console.error("Microphone permission was denied on page load.", e);
    setStatus(resultBox, "Microphone access is needed for this site to work. Please allow permission and refresh the page.", false);
  }
}

// Run the initialization when the page has loaded
window.addEventListener('DOMContentLoaded', initializeMicrophone);