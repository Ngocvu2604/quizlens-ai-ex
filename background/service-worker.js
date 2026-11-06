// src/shared/constants.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  mode: "direct",
  backendUrl: "https://quizlens-ai-omega.vercel.app",
  activeProvider: "gemini",
  geminiModel: "gemini-2.5-flash",
  groqModel: "llama-3.3-70b-versatile",
  openrouterModel: "meta-llama/llama-3.3-70b-instruct:free",
  autoCopy: false,
  debounceMs: 400
};

// src/background/direct-ai.ts
var SYSTEM_PROMPT = `You are QuizLens AI, an expert examination solver.
Analyze the multiple-choice question and options, and identify the single most accurate option.
Return ONLY raw JSON with no markdown wrapping:
{
  "status": "SUCCESS",
  "answer": "A" | "B" | "C" | "D" | "E",
  "answerText": "<exact text of option>",
  "confidence": 0.95
}
If ambiguous or cannot determine, return:
{
  "status": "UNKNOWN",
  "answer": null,
  "answerText": null,
  "confidence": 0
}`;
function buildPrompt(question, options) {
  const optionsText = Object.entries(options).filter(([_, val]) => typeof val === "string" && val.trim().length > 0).map(([key, val]) => `${key}. ${val}`).join("\n");
  return `${SYSTEM_PROMPT}

C\xC2U H\u1ECEI:
${question}

C\xC1C PH\u01AF\u01A0NG \xC1N:
${optionsText}

Tr\u1EA3 v\u1EC1 duy nh\u1EA5t \u0111\u1ECBnh d\u1EA1ng JSON:`;
}
function parseJsonResult(raw) {
  if (!raw) return { status: "UNKNOWN", answer: null, answerText: null, confidence: 0 };
  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  cleaned = cleaned.replace(/,\s*([\}\]])/g, "$1");
  try {
    const parsed = JSON.parse(cleaned);
    const letter = typeof parsed.answer === "string" ? parsed.answer.toUpperCase().trim() : null;
    if (letter && ["A", "B", "C", "D", "E"].includes(letter)) {
      return {
        status: "SUCCESS",
        answer: letter,
        answerText: parsed.answerText || null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.95
      };
    }
  } catch (e) {
    const match = raw.match(/"answer"\s*:\s*"([A-E])"/i);
    if (match) {
      return {
        status: "SUCCESS",
        answer: match[1].toUpperCase(),
        answerText: null,
        confidence: 0.8
      };
    }
  }
  return { status: "UNKNOWN", answer: null, answerText: null, confidence: 0 };
}
async function solveWithGeminiDirect(question, options, apiKey, modelName = "gemini-2.0-flash") {
  const prompt = buildPrompt(question, options);
  const candidateModels = [
    modelName,
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-2.5-flash"
  ];
  const uniqueModels = [...new Set(candidateModels)];
  let lastError = "";
  for (const model of uniqueModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 }
        })
      });
      if (!response.ok) {
        if (response.status === 404 || response.status === 503 || response.status === 429) {
          lastError = `M\xF4 h\xECnh ${model} \u0111ang b\u1EADn (${response.status}), \u0111ang th\u1EED m\xF4 h\xECnh ti\u1EBFp theo...`;
          continue;
        }
        if (response.status === 400 || response.status === 403) {
          throw new Error("Gemini API Key kh\xF4ng h\u1EE3p l\u1EC7. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i key.");
        }
        const errText = await response.text();
        lastError = `Gemini Error (${response.status}): ${errText}`;
        continue;
      }
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const result = parseJsonResult(text);
      result.provider = `gemini (${model})`;
      return result;
    } catch (e) {
      if (e.message.includes("kh\xF4ng h\u1EE3p l\u1EC7")) throw e;
      lastError = e.message;
    }
  }
  if (lastError.includes("503") || lastError.includes("high demand") || lastError.includes("b\u1EADn")) {
    throw new Error(
      "M\xE1y ch\u1EE7 Google Gemini \u0111ang b\u1ECB qu\xE1 t\u1EA3i t\u1EA1m th\u1EDDi (503 High Demand). Vui l\xF2ng th\u1EED l\u1EA1i sau v\xE0i gi\xE2y ho\u1EB7c chuy\u1EC3n sang Groq Cloud (mi\u1EC5n ph\xED, si\xEAu t\u1ED1c, kh\xF4ng b\u1ECB qu\xE1 t\u1EA3i)."
    );
  }
  throw new Error(lastError || "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn Gemini API. H\xE3y th\u1EED l\u1EA1i ho\u1EB7c chuy\u1EC3n sang Groq.");
}
async function solveWithGroqDirect(question, options, apiKey, modelName = "llama-3.3-70b-versatile") {
  const prompt = buildPrompt(question, options);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300
    })
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Groq API Key kh\xF4ng h\u1EE3p l\u1EC7.");
    if (response.status === 429) throw new Error("Groq API \u0111\u1EA1t gi\u1EDBi h\u1EA1n Rate Limit.");
    throw new Error(`Groq Error (${response.status})`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const result = parseJsonResult(text);
  result.provider = `groq (${modelName})`;
  return result;
}
async function solveWithOpenRouterDirect(question, options, apiKey, modelName = "meta-llama/llama-3.3-70b-instruct:free") {
  const prompt = buildPrompt(question, options);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://quizlens.ai",
      "X-Title": "QuizLens AI"
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300
    })
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("OpenRouter API Key kh\xF4ng h\u1EE3p l\u1EC7.");
    throw new Error(`OpenRouter Error (${response.status})`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const result = parseJsonResult(text);
  result.provider = `openrouter (${modelName})`;
  return result;
}

// src/background/service-worker.ts
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get("settings");
  if (!existing || !existing.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
  try {
    chrome.contextMenus.create({
      id: "quizlens-solve-selection",
      title: "Gi\u1EA3i b\u1EB1ng QuizLens AI",
      contexts: ["selection"]
    });
  } catch (_) {
  }
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "quizlens-solve-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SELECTION_ANALYSIS" }).catch(() => {
    });
  }
});
async function getSettings() {
  try {
    const data = await chrome.storage.sync.get("settings");
    return { ...DEFAULT_SETTINGS, ...data.settings || {} };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}
async function saveSettings(newSettings) {
  const current = await getSettings();
  const updated = { ...current, ...newSettings };
  await chrome.storage.sync.set({ settings: updated });
  return updated;
}
async function solveDirectly(payload, settings) {
  const provider = payload.provider || settings.activeProvider;
  if (provider === "gemini") {
    const key = payload.apiKey || settings.geminiApiKey;
    if (!key) throw new Error("NO_API_KEY");
    return solveWithGeminiDirect(payload.question, payload.options, key, payload.model || settings.geminiModel);
  }
  if (provider === "groq") {
    const key = payload.apiKey || settings.groqApiKey;
    if (!key) throw new Error("NO_API_KEY");
    return solveWithGroqDirect(payload.question, payload.options, key, payload.model || settings.groqModel);
  }
  if (provider === "openrouter") {
    const key = payload.apiKey || settings.openrouterApiKey;
    if (!key) throw new Error("NO_API_KEY");
    return solveWithOpenRouterDirect(payload.question, payload.options, key, payload.model || settings.openrouterModel);
  }
  throw new Error(`Nh\xE0 cung c\u1EA5p AI kh\xF4ng h\u1EE3p l\u1EC7: ${provider}`);
}
async function solveWithBackend(payload, settings) {
  const baseUrl = settings.backendUrl.replace(/\/+$/, "");
  const targetUrl = `${baseUrl}/api/v1/answer`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2e4);
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: payload.question,
      options: payload.options,
      provider: payload.provider || settings.activeProvider,
      model: payload.model,
      apiKey: payload.apiKey
    }),
    signal: controller.signal
  });
  clearTimeout(timeoutId);
  if (!response.ok) {
    let errorMsg = `L\u1ED7i m\xE1y ch\u1EE7 (${response.status})`;
    try {
      const errorJson = await response.json();
      if (errorJson.error?.message) errorMsg = errorJson.error.message;
    } catch (_) {
    }
    throw new Error(errorMsg);
  }
  const json = await response.json();
  if (!json.success || !json.data) {
    throw new Error(json.error?.message || "Kh\xF4ng c\xF3 k\u1EBFt qu\u1EA3 tr\u1EA3 v\u1EC1 t\u1EEB Backend");
  }
  return json.data;
}
async function handleAnalyzeQuestion(payload, settings) {
  const activeKey = settings.activeProvider === "gemini" ? settings.geminiApiKey : settings.activeProvider === "groq" ? settings.groqApiKey : settings.openrouterApiKey;
  if (activeKey && activeKey.trim().length > 0) {
    try {
      return await solveDirectly(payload, settings);
    } catch (directErr) {
      if (directErr.message !== "NO_API_KEY") {
        throw directErr;
      }
    }
  }
  try {
    return await solveWithBackend(payload, settings);
  } catch (backendErr) {
    throw new Error(
      "Vui l\xF2ng b\u1EA5m v\xE0o bi\u1EC3u t\u01B0\u1EE3ng QuizLens AI tr\xEAn thanh tr\xECnh duy\u1EC7t v\xE0 nh\u1EADp API Key (Gemini ho\u1EB7c Groq) \u0111\u1EC3 b\u1EAFt \u0111\u1EA7u s\u1EED d\u1EE5ng!"
    );
  }
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "GET_SETTINGS": {
          const settings = await getSettings();
          sendResponse({ success: true, data: settings });
          break;
        }
        case "SAVE_SETTINGS": {
          const updated = await saveSettings(message.payload);
          sendResponse({ success: true, data: updated });
          break;
        }
        case "TEST_CONNECTION": {
          const settings = await getSettings();
          const activeKey = settings.activeProvider === "gemini" ? settings.geminiApiKey : settings.activeProvider === "groq" ? settings.groqApiKey : settings.openrouterApiKey;
          if (activeKey && activeKey.trim().length > 0) {
            sendResponse({ success: true, data: { mode: "direct", message: "API Key s\u1EB5n s\xE0ng ho\u1EA1t \u0111\u1ED9ng \u0111\u1ED9c l\u1EADp!" } });
          } else {
            const baseUrl = settings.backendUrl.replace(/\/+$/, "");
            try {
              const res = await fetch(`${baseUrl}/api/v1/health`, { signal: AbortSignal.timeout(3e3) });
              sendResponse({ success: res.ok, data: { mode: "backend", connected: res.ok } });
            } catch (e) {
              sendResponse({ success: false, data: { mode: "none" } });
            }
          }
          break;
        }
        case "ANALYZE_QUESTION": {
          const settings = await getSettings();
          const result = await handleAnalyzeQuestion(message.payload, settings);
          sendResponse({ success: true, data: result });
          break;
        }
        default:
          sendResponse({ success: false, error: "H\xE0nh \u0111\u1ED9ng kh\xF4ng h\u1EE3p l\u1EC7" });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message || "L\u1ED7i kh\xF4ng x\xE1c \u0111\u1ECBnh" });
    }
  })();
  return true;
});
//# sourceMappingURL=service-worker.js.map
