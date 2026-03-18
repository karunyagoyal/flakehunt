// src/aiClient.js
// Provider-agnostic AI client factory.
// Returns a unified interface: client.chat(prompt, maxTokens, useCase)
// All providers implemented with native fetch (Node 20+) — no extra deps.
//
// Supported providers:
//   anthropic  — Claude Haiku (classify) + Claude Sonnet (fix)   [paid, ~$0.01/run]
//   gemini     — Gemini 1.5 Flash (both)                         [free tier available]
//   groq       — Llama 3.1 8B (classify) + Llama 3.3 70B (fix)  [free tier available]
//   github     — GPT-4o-mini (classify) + GPT-4o (fix)           [free with GitHub account]
//   rules-only — keyword matching, no API call                    [always free]

const MODELS = {
  anthropic: { classify: 'claude-haiku-4-5-20251001', fix: 'claude-sonnet-4-6'       },
  gemini:    { classify: 'gemini-1.5-flash',           fix: 'gemini-1.5-flash'         },
  groq:      { classify: 'llama-3.1-8b-instant',       fix: 'llama-3.3-70b-versatile' },
  github:    { classify: 'gpt-4o-mini',                fix: 'gpt-4o'                   },
};

// ── Anthropic ──────────────────────────────────────────────────────────────────
function createAnthropicClient(apiKey) {
  return async function chat(prompt, maxTokens, useCase) {
    const model = MODELS.anthropic[useCase] || MODELS.anthropic.classify;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Anthropic error: ' + (data.error?.message || res.status));
    return data.content[0].text;
  };
}

// ── Google Gemini ──────────────────────────────────────────────────────────────
function createGeminiClient(apiKey) {
  return async function chat(prompt, maxTokens, useCase) {
    const model = MODELS.gemini[useCase] || MODELS.gemini.classify;
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res   = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Gemini error: ' + (data.error?.message || res.status));
    return data.candidates[0].content.parts[0].text;
  };
}

// ── Groq (OpenAI-compatible) ───────────────────────────────────────────────────
function createGroqClient(apiKey) {
  return createOpenAICompatibleClient(apiKey, 'https://api.groq.com/openai/v1', MODELS.groq, 'Groq');
}

// ── GitHub Models (OpenAI-compatible) ─────────────────────────────────────────
// Uses the GITHUB_TOKEN already present in the workflow — no separate key needed.
function createGithubClient(apiKey) {
  return createOpenAICompatibleClient(apiKey, 'https://models.inference.ai.azure.com', MODELS.github, 'GitHub Models');
}

// ── Shared OpenAI-compatible helper (used by Groq + GitHub) ───────────────────
function createOpenAICompatibleClient(apiKey, baseUrl, models, providerName) {
  return async function chat(prompt, maxTokens, useCase) {
    const model = models[useCase] || models.classify;
    const res   = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer ' + apiKey,
        'content-type':  'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(providerName + ' error: ' + (data.error?.message || res.status));
    return data.choices[0].message.content;
  };
}

// ── Factory ────────────────────────────────────────────────────────────────────
function createClient(provider, apiKey) {
  switch (provider) {
    case 'anthropic':   return createAnthropicClient(apiKey);
    case 'gemini':      return createGeminiClient(apiKey);
    case 'groq':        return createGroqClient(apiKey);
    case 'github':      return createGithubClient(apiKey);
    case 'rules-only':  return null; // classifier handles this case — no API calls
    default:
      throw new Error('Unknown model-provider "' + provider + '". Choose: anthropic | gemini | groq | github | rules-only');
  }
}

module.exports = { createClient };
