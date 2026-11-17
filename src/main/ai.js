// Provider-agnostic LLM client. Runs in the Electron main process so API keys
// never reach the renderer, and CORS is never a problem.

function systemPrompt(config) {
  const identity = config.identity || {};
  const assistant = (identity.assistantName || 'Jarvis').trim();
  const user = (identity.userName || '').trim();
  return [
    `You are ${assistant}, a helpful desktop voice assistant inspired by Iron Man.`,
    user ? `The person you are speaking with is called ${user}. Address them by name naturally when it fits.` : '',
    'Reply in one to three short sentences, in plain text.',
    'Never use markdown, bullets, code blocks, or emojis — your reply is read aloud.',
    'Be concise, calm and a little witty.',
  ].filter(Boolean).join(' ');
}

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
  },
  anthropic: {
    name: 'Claude',
    models: ['claude-3-5-haiku-latest', 'claude-sonnet-4-5', 'claude-opus-4-1'],
  },
  gemini: {
    name: 'Gemini',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  groq: {
    name: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'qwen/qwen3-32b'],
  },
};

async function httpJson(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const body = await res.text();
  let data;
  try { data = JSON.parse(body); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || body.slice(0, 200) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function ask(config, prompt) {
  const provider = config.provider;
  const key = (config.keys[provider] || '').trim();
  if (!PROVIDERS[provider]) return { ok: false, error: `Unknown provider: ${provider}` };
  if (!key) return { ok: false, error: `No API key set for ${PROVIDERS[provider].name}. Open AI settings to add one.` };

  const model = config.models[provider] || PROVIDERS[provider].models[0];

  try {
    let text = '';

    if (provider === 'openai' || provider === 'groq') {
      const base = provider === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions';
      const data = await httpJson(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt(config) },
            { role: 'user', content: prompt },
          ],
          max_tokens: 220,
          temperature: 0.7,
        }),
      });
      text = data?.choices?.[0]?.message?.content || '';
    }

    else if (provider === 'anthropic') {
      const data = await httpJson('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 220,
          system: systemPrompt(config),
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    }

    else if (provider === 'gemini') {
      const data = await httpJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt(config) }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 220, temperature: 0.7 },
          }),
        }
      );
      text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(' ');
    }

    text = String(text || '').trim();
    if (!text) return { ok: false, error: `${PROVIDERS[provider].name} returned an empty response.` };
    return { ok: true, text, provider, model };
  } catch (e) {
    return { ok: false, error: `${PROVIDERS[provider].name}: ${e.message}` };
  }
}

module.exports = { ask, PROVIDERS };
