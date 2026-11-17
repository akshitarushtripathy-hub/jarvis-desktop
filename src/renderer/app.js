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
          if (Date.now() > ignoreJarvisUntil && /\b(jarvis|jervis|jarves|jarvish)\b/i.test(txt)) {
            wake();
          }
        } else {
          commandBuffer += (commandBuffer ? ' ' : '') + txt;
          showTranscript(commandBuffer);
          scheduleCommand();
        }
      } else {
        interim += txt;
        if (mode === 'asleep' && /\b(jarvis|jervis|jarves|jarvish)\b/i.test(interim)) {
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
  setStatus('Say “Jarvis” to wake me');
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

  // time / date
  if (/\b(time|clock)\b/.test(t)) {
    const now = new Date();
    speak(`The time is ${now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`);
  }
  // who are you / help
  else if (/\b(help|what can you do|commands)\b/.test(t)) {
    speak('I can tell you the time, open websites like YouTube or GitHub, search the web, tell a joke, adjust fullscreen, or shut down. Just say the word.');
  }
  else if (/\b(who are you|your name|what are you)\b/.test(t)) {
    speak('I am Jarvis, your voice-activated desktop assistant.');
  }
  // greeting / small talk
  else if (/\b(hello|hi|hey|good morning|good evening)\b/.test(t)) {
    speak('Good day. How can I help you?');
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
    speak('I didn’t catch that. Say “help” to hear what I can do.');
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
    setStatus('Say “Jarvis” to wake me');
    sleep(false);
  } else {
    micOn = true;
    btnMic.classList.add('active');
    startRecognition();
    animateWave(true);
    setVisual('listening');
    setStatus('Listening for “Jarvis”…', true);
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
  if (e.key === 'm' || e.key === 'M') toggleMic();
  else if (e.key === 'f' || e.key === 'F') window.jarvis && window.jarvis.toggleFullscreen();
  else if (e.key === 'Escape') window.jarvis && window.jarvis.quit();
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
const voiceReady = initRecognition();
if (voiceReady) {
  micOn = true;
  btnMic.classList.add('active');
  startRecognition();
  animateWave(true);
  setVisual('listening');
  setStatus('Listening for “Jarvis”…', true);
}
setTimeout(() => { hintEl.style.opacity = '0.25'; }, 12000);
