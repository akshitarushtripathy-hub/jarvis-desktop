const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const FILE = path.join(app.getPath('userData'), 'jarvis-settings.json');

const SETUP_NOTE = '(paste api here) — add a key with: jarvis set-key groq gsk_...  (or use the settings panel in the app)';

const DEFAULTS = {
  _setup: SETUP_NOTE,
  provider: 'groq',
  identity: { userName: '', assistantName: 'Jarvis' },
  keys: { openai: '', anthropic: '', gemini: '', groq: '' },
  models: {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    gemini: 'gemini-2.0-flash',
    groq: 'llama-3.3-70b-versatile',
  },
};

function encrypt(value) {
  if (!value) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64');
  }
  return 'raw:' + Buffer.from(value).toString('base64');
}

function decrypt(value) {
  if (!value) return '';
  if (value.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64')); } catch { return ''; }
  }
  if (value.startsWith('raw:')) {
    return Buffer.from(value.slice(4), 'base64').toString();
  }
  return value; // legacy plaintext file
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const keys = {};
    for (const p of Object.keys(DEFAULTS.keys)) keys[p] = decrypt(raw.keys?.[p] || '');
    const provider = Object.prototype.hasOwnProperty.call(DEFAULTS.keys, raw.provider)
      ? raw.provider
      : DEFAULTS.provider;
    return {
      _setup: raw._setup ?? SETUP_NOTE,
      provider,
      identity: { ...DEFAULTS.identity, ...(raw.identity || {}) },
      keys,
      models: { ...DEFAULTS.models, ...(raw.models || {}) },
    };
  } catch {
    return {
      _setup: SETUP_NOTE,
      provider: DEFAULTS.provider,
      identity: { ...DEFAULTS.identity },
      keys: { ...DEFAULTS.keys },
      models: { ...DEFAULTS.models },
    };
  }
}

function save(config) {
  const out = {
    _setup: config._setup ?? SETUP_NOTE,
    provider: config.provider,
    identity: config.identity,
    models: config.models,
    keys: {},
  };
  for (const p of Object.keys(DEFAULTS.keys)) out.keys[p] = encrypt(config.keys[p] || '');
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2), { mode: 0o600 });
}

module.exports = { load, save, DEFAULTS, FILE };
