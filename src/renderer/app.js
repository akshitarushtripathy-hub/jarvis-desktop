/* global jarvis */

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const core = $('core');
const clockEl = $('clock');
const secondsEl = $('seconds');
const dateEl = $('date');
const statusEl = $('status');
const statusText = $('statusText');
const coreSub = $('coreSub');
const transcriptEl = $('transcript');
const waveEl = $('wave');
const btnMic = $('btn-mic');
const cmdForm = $('cmdForm');
const cmdInput = $('cmdInput');
const hintEl = $('hint');

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------
function tickClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  clockEl.childNodes[0].nodeValue = `${hh}:${mm}`;
  secondsEl.textContent = ss;
  dateEl.textContent = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}
tickClock();
setInterval(tickClock, 1000);

// ---------------------------------------------------------------------------
// HUD ticks (generated once)
// ---------------------------------------------------------------------------
(function buildTicks() {
  const ns = 'http://www.w3.org/2000/svg';
  const group = $('ticks');
  const cx = 210, cy = 210, r = 136;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
    const major = i % 6 === 0;
    const len = major ? 12 : 5;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', cx + Math.cos(a) * r);
    line.setAttribute('y1', cy + Math.sin(a) * r);
    line.setAttribute('x2', cx + Math.cos(a) * (r + len));
    line.setAttribute('y2', cy + Math.sin(a) * (r + len));
    if (major) line.classList.add('major');
    group.appendChild(line);
  }
})();

// ---------------------------------------------------------------------------
// Waveform
// ---------------------------------------------------------------------------
const bars = [];
for (let i = 0; i < 36; i++) {
  const bar = document.createElement('i');
  waveEl.appendChild(bar);
  bars.push(bar);
}
function animateWave(on) {
  waveEl.classList.toggle('on', on);
  if (!on) {
    bars.forEach((b) => { b.style.height = '3px'; });
    return;
  }
  clearInterval(animateWave._t);
  animateWave._t = setInterval(() => {
    bars.forEach((b) => {
      const h = 3 + Math.pow(Math.random(), 1.6) * 23;
      b.style.height = `${h}px`;
    });
  }, 90);
}

// ---------------------------------------------------------------------------
// State machine:  asleep  ->  awake  ->  (execute)  ->  asleep
// ---------------------------------------------------------------------------
let mode = 'asleep';      // asleep | awake
let micOn = false;        // do we want the microphone active
let commandBuffer = '';
let commandTimer = null;
let ignoreJarvisUntil = 0;
let aiConfig = null;      // provider config loaded from the main process

function setVisual(state) {
  core.classList.remove('listening', 'speaking', 'thinking');
  if (state) core.classList.add(state);
  coreSub.textContent = state ? state.toUpperCase() : 'STANDBY';
}

function setStatus(text, active = false) {
  statusText.textContent = text;
  statusEl.classList.toggle('active', active);
}

function showTranscript(text) {
  if (!text) { transcriptEl.classList.remove('show'); return; }
  transcriptEl.textContent = text;
  transcriptEl.classList.add('show');
}

// ---------------------------------------------------------------------------
// Speech output
// ---------------------------------------------------------------------------
let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  voice = voices.find((v) => /google|natural|premium|jenny|aria|daniel/i.test(v.name)) || voices[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.addEventListener('voiceschanged', pickVoice);
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.03;
  u.pitch = 0.92;
  if (voice) u.voice = voice;
  u.onstart = () => setVisual('speaking');
  u.onend = () => {
    setVisual(mode === 'awake' && micOn ? 'listening' : null);
  };
  speechSynthesis.speak(u);
}

// ---------------------------------------------------------------------------
// Speech input
// ---------------------------------------------------------------------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function isWakeWord(text) {
  if (!text) return false;
  const name = (identity.assistantName || 'Jarvis').toLowerCase().trim();
  const forms = [name, name.replace(/[^a-z0-9]/g, '')].filter(Boolean);
  if (name === 'jarvis') forms.push('jervis', 'jarves', 'jarvish');
  return forms.some((f) => text.toLowerCase().includes(f));
}

function initRecognition() {
  if (!SR) {
    setStatus('Voice input unavailable — use the command bar below');
    btnMic.disabled = true;
    return false;
  }
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const txt = res[0].transcript.trim();
      if (res.isFinal) {
        if (mode === 'asleep') {
          if (Date.now() > ignoreJarvisUntil && isWakeWord(txt)) {
            wake();
          }
        } else {
          commandBuffer += (commandBuffer ? ' ' : '') + txt;
          showTranscript(commandBuffer);
          scheduleCommand();
        }
      } else {
        interim += txt;
        if (mode === 'asleep' && isWakeWord(interim)) {
          wake();
        }
      }
    }
    if (interim && mode === 'awake' && !commandBuffer) showTranscript(interim);
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      micOn = false;
      stopRecognition();
      setStatus('Microphone blocked — allow mic access or use the command bar');
      btnMic.classList.remove('active');
    } else if (e.error === 'no-speech') {
      // harmless: recognition will restart
    } else if (e.error === 'network') {
      micOn = false;
      stopRecognition();
      btnMic.classList.remove('active');
      setVisual(null);
      setStatus('Voice service offline — use the command bar below');
    }
  };

  recognition.onend = () => {
    if (micOn) {
      clearTimeout(recognition._restart);
      recognition._restart = setTimeout(() => {
        try { recognition.start(); } catch (_) { /* already starting */ }
      }, 350);
    }
  };
  return true;
}

function startRecognition() {
  if (!recognition) return;
  try { recognition.start(); } catch (_) { /* already running */ }
}

function stopRecognition() {
  micOn = false;
  if (recognition) {
    try { recognition.stop(); } catch (_) { /* not running */ }
  }
  animateWave(false);
}

function wake() {
  mode = 'awake';
  commandBuffer = '';
  showTranscript('');
  ignoreJarvisUntil = Date.now() + 2500;
  setVisual('listening');
  animateWave(true);
  setStatus('Listening…', true);
  speak('Yes?');
  clearTimeout(wake._t);
  wake._t = setTimeout(() => {
    if (mode === 'awake' && !commandBuffer) sleep(true);
  }, 9000);
}

function sleep(spoken = false) {
  mode = 'asleep';
  commandBuffer = '';
  clearTimeout(commandTimer);
  clearTimeout(wake._t);
  showTranscript('');
  setVisual(micOn ? null : null);
  setStatus('Say “' + identity.assistantName + '” to wake me');
  if (spoken) speak('Going back to standby.');
}

function scheduleCommand() {
  clearTimeout(commandTimer);
  commandTimer = setTimeout(() => {
    const cmd = commandBuffer.trim();
    commandBuffer = '';
    if (cmd) runCommand(cmd);
  }, 1400);
}

// ---------------------------------------------------------------------------
// First-run onboarding / identity
// ---------------------------------------------------------------------------
let identity = { userName: '', assistantName: 'Jarvis' };
const onboarding = $('onboarding');

async function loadIdentity() {
  if (!window.jarvis) return;
  identity = await window.jarvis.getIdentity();
  applyIdentity();
}

function applyIdentity() {
  const name = (identity.assistantName || 'Jarvis').trim() || 'Jarvis';
  document.title = name.toUpperCase();
  const nameEl = document.querySelector('.core__name');
  if (nameEl) nameEl.textContent = name.toUpperCase();
}

function openOnboarding() {
  onboarding.hidden = false;
  $('onbUserName').value = identity.userName || '';
  $('onbAssistantName').value = identity.assistantName || 'Jarvis';
  setTimeout(() => $('onbUserName').focus(), 50);
}

async function finishOnboarding() {
  const userName = $('onbUserName').value.trim().slice(0, 60);
  const assistantName = $('onbAssistantName').value.trim().slice(0, 60) || 'Jarvis';
  if (window.jarvis) identity = await window.jarvis.setIdentity({ userName, assistantName });
  applyIdentity();
  onboarding.hidden = true;
  speak(`Hello ${userName || 'there'}. I'm ${assistantName}. Say ${assistantName} whenever you need me.`);
  setStatus('Say “' + assistantName + '” to wake me');
}

$('onbContinue').addEventListener('click', finishOnboarding);
$('onboarding').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); finishOnboarding(); }
});
$('btn-edit-identity').addEventListener('click', () => {
  closeSettings();
  openOnboarding();
});

// ---------------------------------------------------------------------------
// AI provider settings
// ---------------------------------------------------------------------------
const settingsPanel = $('settingsPanel');
const providersEl = $('providers');
const apiKeyInput = $('apiKey');
const modelSelect = $('modelSelect');
const keyNote = $('keyNote');
let selectedProvider = 'groq';

async function loadAIConfig() {
  if (!window.jarvis) return;
  aiConfig = await window.jarvis.getAIConfig();
  selectedProvider = aiConfig.provider;
  renderProviders();
  renderModels();
  $('keyProviderName').textContent = (aiConfig.providers[selectedProvider]?.name || selectedProvider).toUpperCase();
  apiKeyInput.value = '';
  keyNote.textContent = aiConfig.configured[selectedProvider]
    ? 'A key is saved for this provider. Leave blank and Save to keep it.'
    : 'No key saved yet. Paste your API key and click Save.';
}

function renderProviders() {
  providersEl.innerHTML = '';
  for (const [id, meta] of Object.entries(aiConfig.providers)) {
    const ready = aiConfig.configured[id];
    const btn = document.createElement('button');
    btn.className = 'provider' + (id === selectedProvider ? ' selected' : '') + (ready ? ' ready' : '');
    btn.innerHTML =
      '<span class="provider__dot"></span>' +
      '<span><span class="provider__name">' + meta.name + '</span>' +
      '<span class="provider__state">' + (ready ? 'Connected' : 'No key') + '</span></span>';
    btn.addEventListener('click', () => selectProvider(id));
    providersEl.appendChild(btn);
  }
}

function renderModels() {
  const models = aiConfig.providers[selectedProvider]?.models || [];
  const current = aiConfig.models[selectedProvider];
  modelSelect.innerHTML = '';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    modelSelect.appendChild(opt);
  }
  if (current && models.includes(current)) modelSelect.value = current;
}

async function selectProvider(id) {
  selectedProvider = id;
  if (window.jarvis) await window.jarvis.setAIProvider(id);
  await loadAIConfig();
}

function openSettings() {
  settingsPanel.hidden = false;
  loadAIConfig();
  showTopbar();
}
function closeSettings() { settingsPanel.hidden = true; }

$('btn-settings').addEventListener('click', openSettings);
$('btn-close-settings').addEventListener('click', closeSettings);
$('settingsBackdrop').addEventListener('click', closeSettings);

modelSelect.addEventListener('change', async () => {
  if (window.jarvis) await window.jarvis.setAIModel(selectedProvider, modelSelect.value);
  if (aiConfig) aiConfig.models[selectedProvider] = modelSelect.value;
});

$('btn-save-key').addEventListener('click', async () => {
  const val = apiKeyInput.value.trim();
  if (val && window.jarvis) await window.jarvis.setAIKey(selectedProvider, val);
  apiKeyInput.value = '';
  await loadAIConfig();
  keyNote.textContent = val ? 'Key saved and encrypted locally.' : 'No changes made.';
});

$('btn-clear-key').addEventListener('click', async () => {
  if (window.jarvis) await window.jarvis.clearAIKey(selectedProvider);
  apiKeyInput.value = '';
  await loadAIConfig();
  keyNote.textContent = 'Key removed.';
});

// Plain text for speech synthesis (no markdown).
function cleanForSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-•]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function askAI(prompt) {
  setVisual('thinking');
  setStatus('Thinking…', true);
  showTranscript(prompt);
  let res;
  try {
    res = await window.jarvis.askAI(prompt);
  } catch {
    res = { ok: false, error: 'Could not reach the AI service.' };
  }
  if (res.ok) {
    const provider = aiConfig?.providers[res.provider]?.name || res.provider || 'AI';
    setStatus(`${provider} · ${res.model || ''}`.trim().replace(/ · $/, ''));
    speak(cleanForSpeech(res.text));
  } else {
    setStatus(res.error || 'AI request failed');
    speak(res.error || 'Something went wrong with the AI service.');
  }
  setTimeout(() => { if (mode === 'awake') sleep(false); }, 1400);
}

// ---------------------------------------------------------------------------
// Command handling
// ---------------------------------------------------------------------------
const jokes = [
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'I told my wife she should embrace her mistakes. She gave me a hug.',
  'There are only 10 kinds of people: those who understand binary and those who don’t.',
  'Why did the developer go broke? Because he used up all his cache.',
];

async function runCommand(raw) {
  const t = raw.toLowerCase().replace(/[.,!?]/g, '').trim();
  showTranscript(raw);

  // AI settings / provider control
  if (/\b(settings|api key|ai provider|configure)\b/.test(t)) {
    openSettings();
    speak('Opening AI settings.');
    return;
  }
  const providerWord = Object.entries(aiConfig?.providers || {})
    .find(([id, meta]) => t.includes(id) || t.includes(meta.name.toLowerCase()));
  if (providerWord && /\b(use|switch|connect|set)\b/.test(t)) {
    await selectProvider(providerWord[0]);
    const id = providerWord[0];
    const ready = aiConfig?.configured[id];
    speak(ready
      ? `Now using ${providerWord[1].name}.`
      : `${providerWord[1].name} selected, but it needs an API key. Opening settings.`);
    if (!ready) openSettings();
    return;
  }

  // time / date
  if (/\b(time|clock)\b/.test(t)) {
    const now = new Date();
    speak(`The time is ${now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`);
  }
  // who are you / help
  else if (/\b(help|what can you do|commands)\b/.test(t)) {
    speak('I can tell you the time, open websites, search the web, tell jokes, or shut down. Ask me anything else and I will use the connected A I provider to answer. Say settings to add an A P I key.');
  }
  else if (/\b(who are you|your name|what are you)\b/.test(t)) {
    speak(`I am ${identity.assistantName}, your voice-activated desktop assistant.`);
  }
  // greeting / small talk
  else if (/\b(hello|hi|hey|good morning|good evening)\b/.test(t)) {
    speak(identity.userName ? `Good day, ${identity.userName}. How can I help you?` : 'Good day. How can I help you?');
  }
  else if (/\b(how are you)\b/.test(t)) {
    speak('All systems nominal. Ready when you are.');
  }
  else if (/\b(thank you|thanks)\b/.test(t)) {
    speak('My pleasure.');
  }
  // joke
  else if (/\b(joke|funny)\b/.test(t)) {
    speak(jokes[Math.floor(Math.random() * jokes.length)]);
  }
  // open app
  else if (/\b(open|launch|start)\b/.test(t)) {
    const map = {
      youtube: 'youtube', chrome: 'chrome', google: 'chrome', browser: 'chrome',
      github: 'github', reddit: 'reddit', spotify: 'spotify', gmail: 'gmail', mail: 'gmail',
    };
    const key = Object.keys(map).find((k) => t.includes(k));
    if (key) {
      const ok = window.jarvis && await window.jarvis.openApp(map[key]);
      speak(ok ? `Opening ${key}.` : `I couldn't open ${key}.`);
    } else {
      speak('Which app would you like me to open? Try YouTube, GitHub or Spotify.');
    }
  }
  // web search
  else if (/\b(search|google|look up|find)\b/.test(t)) {
    const q = raw.replace(/^(search|google|look up|find)\s+(for\s+)?/i, '').trim();
    if (q) {
      const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      const ok = window.jarvis && await window.jarvis.openExternal(url);
      speak(ok ? `Searching for ${q}.` : 'I couldn’t start the search.');
    } else {
      speak('What would you like me to search for?');
    }
  }
  // fullscreen
  else if (/\b(full ?screen|maximi[sz]e)\b/.test(t)) {
    if (window.jarvis) await window.jarvis.toggleFullscreen();
    speak('Toggled fullscreen.');
  }
  // sleep / stop
  else if (/\b(sleep|standby|stop listening|go away|goodbye|good night)\b/.test(t)) {
    sleep(true);
    return;
  }
  // quit
  else if (/\b(quit|exit|shut down|shutdown|close the app)\b/.test(t)) {
    speak('Shutting down. Goodbye.');
    setTimeout(() => { if (window.jarvis) window.jarvis.quit(); }, 1600);
    return;
  }
  else {
    // Anything unmatched becomes a question for the connected AI provider,
    // which is spoken back aloud.
    await askAI(raw);
    return;
  }

  // return to standby after speaking
  setTimeout(() => {
    if (mode === 'awake') sleep(false);
  }, 1200);
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function toggleMic() {
  if (micOn) {
    stopRecognition();
    btnMic.classList.remove('active');
    setVisual(null);
    setStatus('Say “' + identity.assistantName + '” to wake me');
    sleep(false);
  } else {
    micOn = true;
    btnMic.classList.add('active');
    startRecognition();
    animateWave(true);
    setVisual('listening');
    setStatus('Listening for “' + identity.assistantName + '”…', true);
  }
}

btnMic.addEventListener('click', toggleMic);
$('btn-full').addEventListener('click', () => window.jarvis && window.jarvis.toggleFullscreen());
$('btn-quit').addEventListener('click', () => window.jarvis && window.jarvis.quit());

cmdForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const val = cmdInput.value.trim();
  if (!val) return;
  cmdInput.value = '';
  mode = 'awake';
  setVisual('thinking');
  runCommand(val);
});

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.target === cmdInput) {
    if (e.key === 'Escape') cmdInput.blur();
    return;
  }
  if (e.key === 'Escape') {
    if (!onboarding.hidden) return;
    if (!settingsPanel.hidden) { closeSettings(); return; }
    window.jarvis && window.jarvis.quit();
    return;
  }
  if (e.key === 'm' || e.key === 'M') toggleMic();
  else if (e.key === 'f' || e.key === 'F') window.jarvis && window.jarvis.toggleFullscreen();
  else if (e.key === 's' || e.key === 'S') { if (onboarding.hidden) openSettings(); }
});

// auto-hide topbar
let topbarTimer;
function showTopbar() {
  const bar = $('topbar');
  bar.classList.add('visible');
  clearTimeout(topbarTimer);
  topbarTimer = setTimeout(() => bar.classList.remove('visible'), 2600);
}
document.addEventListener('mousemove', showTopbar);
window.addEventListener('focus', showTopbar);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(async function boot() {
  await loadIdentity();
  await loadAIConfig();

  const voiceReady = initRecognition();
  if (voiceReady) {
    micOn = true;
    btnMic.classList.add('active');
    startRecognition();
    animateWave(true);
    setVisual('listening');
    setStatus('Listening for “' + identity.assistantName + '”…', true);
  }

  // First launch: ask for the user's name and what to call the assistant.
  if (!identity.userName) openOnboarding();

  setTimeout(() => { hintEl.style.opacity = '0.25'; }, 12000);
})();
