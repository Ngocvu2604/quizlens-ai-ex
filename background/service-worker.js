// src/shared/constants.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  mode: "backend",
  backendUrl: "https://quizlens-ai-omega.vercel.app",
  activeProvider: "gemini",
  geminiModel: "gemini-2.0-flash",
  groqModel: "llama-3.3-70b-versatile",
  openaiModel: "gpt-4o-mini",
  deepseekModel: "deepseek-chat",
  openrouterModel: "meta-llama/llama-3.3-70b-instruct:free",
  autoCopy: false,
  debounceMs: 400
};

// src/background/direct-ai.ts
var SYSTEM_PROMPT = `You are QuizLens AI, an expert examination and quiz solver.
Your task is to analyze questions of diverse formats and accurately determine the correct answer.

QUESTION FORMAT GUIDELINES:
1. Multiple-choice (Single option):
   - Choose the single most accurate letter: "A", "B", "C", "D", "E"...
2. Binary / True-False (2 options: \u0110\xFAng/Sai, True/False, C\xF3/Kh\xF4ng, Yes/No):
   - Choose "A" or "B" (or "\u0110\xFAng" / "Sai").
3. Multi-select (Tick / Checkbox / "Ch\u1ECDn c\xE1c \u0111\xE1p \xE1n \u0111\xFAng", "Ch\u1ECDn 2 \u0111\xE1p \xE1n..."):
   - Return ALL correct option letters separated by commas, e.g. "A, C" or "A, B, D".
   - In "answerText", list the content of the selected options.
4. Fill-in-the-blank (\u0110i\u1EC1n v\xE0o \xF4 tr\u1ED1ng: ..., ___, [...], (...)):
   - If options (A, B, C, D) are provided: Choose the best option letter.
   - If NO options are provided (open-ended fill-in-the-blank): Put the exact missing word/phrase in "answer" (e.g. "54", "L\u1EE5c l\u1EA1p", "Paris"), and the full completed sentence in "answerText".
5. Unlabeled / Numbered options:
   - If options were numbered 1, 2, 3, 4, they are mapped to A, B, C, D. Choose the corresponding letter.
6. Direct questions without options (Ch\u1EC9 c\xF3 c\xE2u h\u1ECFi, kh\xF4ng c\xF3 \u0111\xE1p \xE1n l\u1EF1a ch\u1ECDn):
   - Determine the correct answer directly.
   - Put ONLY the most CONCISE, DIRECT answer in "answer" (e.g. "H\xE0 N\u1ED9i", "5 cm", "Nitrogen (N2)", "object", "1954", "William Shakespeare"). Keep it strictly to the core answer word, number, or key term.
   - In "answerText", provide a brief 1-sentence explanation.

RESPONSE SCHEMA:
Return ONLY raw JSON with no markdown wrapping:
{
  "status": "SUCCESS",
  "answer": "<Letter(s) e.g. 'A', 'B', 'A, C' OR concise direct answer for questions without options>",
  "answerText": "<exact text of option(s) or brief 1-sentence explanation>",
  "confidence": 0.95
}
If ambiguous or cannot determine, return:
{
  "status": "UNKNOWN",
  "answer": null,
  "answerText": null,
  "confidence": 0
}`;
function buildUserContent(question, options, questionType) {
  const optionsEntries = Object.entries(options).filter(
    ([_, val]) => typeof val === "string" && val.trim().length > 0
  );
  let optionsText = "";
  if (optionsEntries.length > 0) {
    optionsText = optionsEntries.map(([key, val]) => `${key}. ${val}`).join("\n");
  }
  let text = `C\xC2U H\u1ECEI:
${question}`;
  if (questionType) {
    text += `
[Lo\u1EA1i c\xE2u h\u1ECFi: ${questionType}]`;
  }
  if (optionsText) {
    text += `

C\xC1C PH\u01AF\u01A0NG \xC1N:
${optionsText}`;
  } else {
    text += `

(C\xE2u h\u1ECFi tr\u1EF1c ti\u1EBFp kh\xF4ng c\xF3 ph\u01B0\u01A1ng \xE1n l\u1EF1a ch\u1ECDn s\u1EB5n. Y\xCAU C\u1EA6U: H\xE3y tr\u1EA3 v\u1EC1 \u0111\xE1p \xE1n TH\u1EACT NG\u1EAEN G\u1ECCN (ch\u1EC9 t\u1EEB kh\xF3a, t\xEAn, con s\u1ED1 ho\u1EB7c k\u1EBFt qu\u1EA3 ch\xEDnh x\xE1c) v\xE0o tr\u01B0\u1EDDng "answer" v\xE0 gi\u1EA3i th\xEDch ng\u1EAFn 1 c\xE2u v\xE0o "answerText".)`;
  }
  text += `

Tr\u1EA3 v\u1EC1 duy nh\u1EA5t \u0111\u1ECBnh d\u1EA1ng JSON:`;
  return text;
}
function buildPrompt(question, options, questionType) {
  return `${SYSTEM_PROMPT}

${buildUserContent(question, options, questionType)}`;
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
    let rawAnswer = parsed.answer != null ? String(parsed.answer).trim() : null;
    if (rawAnswer && /^[a-hA-H](?:[\s,;]+[a-hA-H])*$/.test(rawAnswer)) {
      rawAnswer = rawAnswer.toUpperCase().replace(/\s*[,;]\s*/g, ", ");
    }
    if (rawAnswer) {
      return {
        status: "SUCCESS",
        answer: rawAnswer,
        answerText: parsed.answerText || null,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.95
      };
    }
  } catch (e) {
    const match = raw.match(/"answer"\s*:\s*"([^"]+)"/i);
    if (match) {
      let letter = match[1].trim();
      if (/^[a-hA-H](?:[\s,;]+[a-hA-H])*$/.test(letter)) {
        letter = letter.toUpperCase().replace(/\s*[,;]\s*/g, ", ");
      }
      return {
        status: "SUCCESS",
        answer: letter,
        answerText: null,
        confidence: 0.8
      };
    }
  }
  return { status: "UNKNOWN", answer: null, answerText: null, confidence: 0 };
}
async function solveWithGeminiDirect(question, options, apiKey, modelName = "gemini-2.0-flash", questionType) {
  const prompt = buildPrompt(question, options, questionType);
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
async function getGroqLiveModels(apiKey) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey.trim()}` }
    });
    if (res.status === 401) {
      throw new Error("Groq API Key kh\xF4ng h\u1EE3p l\u1EC7. Vui l\xF2ng l\u1EA5y key m\u1EDBi t\u1EA1i console.groq.com/keys");
    }
    if (res.ok) {
      const data = await res.json();
      return (data.data || []).map((m) => m.id).filter((id) => !id.includes("whisper") && !id.includes("guard"));
    }
  } catch (e) {
    if (e.message.includes("kh\xF4ng h\u1EE3p l\u1EC7")) throw e;
  }
  return [];
}
async function solveWithGroqDirect(question, options, apiKey, modelName = "llama-3.3-70b-versatile", questionType) {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) {
    throw new Error("Ch\u01B0a c\xF3 Groq API Key. Vui l\xF2ng nh\u1EADp key trong Popup!");
  }
  const liveModels = await getGroqLiveModels(cleanKey);
  const candidateModels = [];
  if (modelName && (liveModels.length === 0 || liveModels.includes(modelName))) {
    candidateModels.push(modelName);
  }
  for (const m of liveModels) {
    if (!candidateModels.includes(m)) candidateModels.push(m);
  }
  if (candidateModels.length === 0) {
    candidateModels.push(
      modelName || "llama-3.3-70b-versatile",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant"
    );
  }
  const userContent = buildUserContent(question, options, questionType);
  let lastError = "";
  for (const model of candidateModels) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent }
          ],
          temperature: 0.1,
          max_tokens: 300
        })
      });
      if (!response.ok) {
        let errDetail = "";
        try {
          const errData = await response.json();
          errDetail = errData?.error?.message || "";
        } catch (_) {
          try {
            errDetail = await response.text();
          } catch (_2) {
          }
        }
        if (response.status === 401) {
          throw new Error("Groq API Key kh\xF4ng h\u1EE3p l\u1EC7. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i key t\u1EA1i console.groq.com");
        }
        if (response.status === 429) {
          throw new Error("Groq API \u0111\u1EA1t gi\u1EDBi h\u1EA1n Rate Limit. Th\u1EED l\u1EA1i sau \xEDt ph\xFAt.");
        }
        lastError = errDetail ? `Groq (${model}): ${errDetail}` : `Groq Error (${response.status})`;
        if (errDetail.toLowerCase().includes("model") || response.status === 404) {
          continue;
        }
        throw new Error(lastError);
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      const result = parseJsonResult(text);
      result.provider = `groq (${model})`;
      return result;
    } catch (e) {
      if (e.message.includes("kh\xF4ng h\u1EE3p l\u1EC7") || e.message.includes("Rate Limit") || e.message.includes("Groq:")) throw e;
      lastError = e.message;
    }
  }
  throw new Error(lastError || "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn Groq API");
}
async function solveWithOpenRouterDirect(question, options, apiKey, modelName = "meta-llama/llama-3.3-70b-instruct:free", questionType) {
  const prompt = buildPrompt(question, options, questionType);
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
async function solveWithOpenAIDirect(question, options, apiKey, modelName = "gpt-4o-mini", questionType) {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) {
    throw new Error("Ch\u01B0a c\xF3 OpenAI API Key. Vui l\xF2ng nh\u1EADp key trong Popup!");
  }
  const userContent = buildUserContent(question, options, questionType);
  const candidateModels = [modelName || "gpt-4o-mini", "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
  const uniqueModels = [...new Set(candidateModels)];
  let lastError = "";
  for (const model of uniqueModels) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 300
        })
      });
      if (!response.ok) {
        let errDetail = "";
        try {
          const errData = await response.json();
          errDetail = errData?.error?.message || "";
        } catch (_) {
          try {
            errDetail = await response.text();
          } catch (_2) {
          }
        }
        if (response.status === 401) {
          throw new Error("OpenAI API Key kh\xF4ng h\u1EE3p l\u1EC7. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i key t\u1EA1i platform.openai.com/api-keys");
        }
        if (response.status === 429) {
          throw new Error("OpenAI API h\u1EBFt h\u1EA1n ng\u1EA1ch ho\u1EB7c \u0111\u1EA1t gi\u1EDBi h\u1EA1n Rate Limit.");
        }
        lastError = errDetail ? `OpenAI (${model}): ${errDetail}` : `OpenAI Error (${response.status})`;
        if (errDetail.toLowerCase().includes("model") || response.status === 404) {
          continue;
        }
        throw new Error(lastError);
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      const result = parseJsonResult(text);
      result.provider = `openai (${model})`;
      return result;
    } catch (e) {
      if (e.message.includes("kh\xF4ng h\u1EE3p l\u1EC7") || e.message.includes("Rate Limit") || e.message.includes("OpenAI:")) throw e;
      lastError = e.message;
    }
  }
  throw new Error(lastError || "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn OpenAI API");
}
async function solveWithDeepSeekDirect(question, options, apiKey, modelName = "deepseek-chat", questionType) {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) {
    throw new Error("Ch\u01B0a c\xF3 DeepSeek API Key. Vui l\xF2ng nh\u1EADp key trong Popup!");
  }
  const userContent = buildUserContent(question, options, questionType);
  const candidateModels = [modelName || "deepseek-chat", "deepseek-chat", "deepseek-reasoner"];
  const uniqueModels = [...new Set(candidateModels)];
  let lastError = "";
  for (const model of uniqueModels) {
    try {
      const isReasoner = model === "deepseek-reasoner";
      const bodyPayload = {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
        max_tokens: isReasoner ? 1e3 : 400
      };
      if (!isReasoner) {
        bodyPayload.response_format = { type: "json_object" };
        bodyPayload.temperature = 0.1;
      }
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cleanKey}`
        },
        body: JSON.stringify(bodyPayload)
      });
      if (!response.ok) {
        let errDetail = "";
        try {
          const errData = await response.json();
          errDetail = errData?.error?.message || "";
        } catch (_) {
          try {
            errDetail = await response.text();
          } catch (_2) {
          }
        }
        if (response.status === 401) {
          throw new Error("DeepSeek API Key kh\xF4ng h\u1EE3p l\u1EC7. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i key t\u1EA1i platform.deepseek.com/api_keys");
        }
        if (response.status === 402) {
          throw new Error("T\xE0i kho\u1EA3n DeepSeek ch\u01B0a c\xF3 s\u1ED1 d\u01B0 (Insufficient Balance). Vui l\xF2ng n\u1EA1p credit t\u1EA1i platform.deepseek.com");
        }
        if (response.status === 429) {
          throw new Error("DeepSeek API \u0111\u1EA1t gi\u1EDBi h\u1EA1n Rate Limit. Th\u1EED l\u1EA1i sau \xEDt ph\xFAt.");
        }
        lastError = errDetail ? `DeepSeek (${model}): ${errDetail}` : `DeepSeek Error (${response.status})`;
        if (errDetail.toLowerCase().includes("model") || response.status === 404) {
          continue;
        }
        throw new Error(lastError);
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      const result = parseJsonResult(text);
      result.provider = `deepseek (${model})`;
      return result;
    } catch (e) {
      if (e.message.includes("kh\xF4ng h\u1EE3p l\u1EC7") || e.message.includes("s\u1ED1 d\u01B0") || e.message.includes("Rate Limit") || e.message.includes("DeepSeek:")) throw e;
      lastError = e.message;
    }
  }
  throw new Error(lastError || "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn DeepSeek API");
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
    const merged = { ...DEFAULT_SETTINGS, ...data.settings || {} };
    merged.backendUrl = "https://quizlens-ai-omega.vercel.app";
    return merged;
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
    return solveWithGeminiDirect(payload.question, payload.options, key, payload.model || settings.geminiModel, payload.questionType);
  }
  if (provider === "groq") {
    const key = payload.apiKey || settings.groqApiKey;
    if (!key) throw new Error("NO_API_KEY");
    const rawModel = payload.model || settings.groqModel || "llama-3.3-70b-versatile";
    const groqModel = rawModel.includes("mixtral") ? "llama-3.3-70b-versatile" : rawModel;
    return solveWithGroqDirect(payload.question, payload.options, key, groqModel, payload.questionType);
  }
  if (provider === "openai") {
    const key = payload.apiKey || settings.openaiApiKey;
    if (!key) throw new Error("NO_API_KEY");
    return solveWithOpenAIDirect(payload.question, payload.options, key, payload.model || settings.openaiModel, payload.questionType);
  }
  if (provider === "deepseek") {
    const key = payload.apiKey || settings.deepseekApiKey;
    if (!key) throw new Error("NO_API_KEY");
    return solveWithDeepSeekDirect(payload.question, payload.options, key, payload.model || settings.deepseekModel, payload.questionType);
  }
  if (provider === "openrouter") {
    const key = payload.apiKey || settings.openrouterApiKey;
    if (!key) throw new Error("NO_API_KEY");
    return solveWithOpenRouterDirect(payload.question, payload.options, key, payload.model || settings.openrouterModel, payload.questionType);
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
      questionType: payload.questionType,
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
  const activeKey = settings.activeProvider === "gemini" ? settings.geminiApiKey : settings.activeProvider === "groq" ? settings.groqApiKey : settings.activeProvider === "openai" ? settings.openaiApiKey : settings.activeProvider === "deepseek" ? settings.deepseekApiKey : settings.openrouterApiKey;
  let activeGroqModel = settings.groqModel || "llama-3.3-70b-versatile";
  if (activeGroqModel.includes("mixtral")) activeGroqModel = "llama-3.3-70b-versatile";
  const activeModel = settings.activeProvider === "gemini" ? settings.geminiModel : settings.activeProvider === "groq" ? activeGroqModel : settings.activeProvider === "openai" ? settings.openaiModel : settings.activeProvider === "deepseek" ? settings.deepseekModel : settings.openrouterModel;
  const enrichedPayload = {
    ...payload,
    provider: payload.provider || settings.activeProvider,
    model: payload.model || activeModel,
    apiKey: payload.apiKey || activeKey || void 0
  };
  try {
    return await solveWithBackend(enrichedPayload, settings);
  } catch (backendErr) {
    if (activeKey && activeKey.trim().length > 0) {
      try {
        return await solveDirectly(enrichedPayload, settings);
      } catch (directErr) {
        throw directErr;
      }
    }
    throw backendErr;
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
          const targetUrl = "https://quizlens-ai-omega.vercel.app/api/v1/health";
          try {
            const healthRes = await fetch(targetUrl, { signal: AbortSignal.timeout(4e3) });
            const backendOnline = healthRes.ok;
            if (message.payload?.isExplicitTest) {
              const provider = message.payload?.provider || settings.activeProvider;
              const model = message.payload?.model || (provider === "gemini" ? settings.geminiModel : provider === "groq" ? settings.groqModel : provider === "openai" ? settings.openaiModel : provider === "deepseek" ? settings.deepseekModel : settings.openrouterModel);
              const apiKey = (message.payload?.apiKey || (provider === "gemini" ? settings.geminiApiKey : provider === "groq" ? settings.groqApiKey : provider === "openai" ? settings.openaiApiKey : provider === "deepseek" ? settings.deepseekApiKey : settings.openrouterApiKey) || "").trim();
              if (!apiKey || apiKey.length < 5) {
                sendResponse({
                  success: false,
                  error: "Vui l\xF2ng nh\u1EADp API Key tr\u01B0\u1EDBc khi ki\u1EC3m tra!"
                });
                break;
              }
              try {
                if (provider === "gemini") {
                  await solveWithGeminiDirect("1+1=?", { A: "1", B: "2" }, apiKey, model);
                } else if (provider === "groq") {
                  await solveWithGroqDirect("1+1=?", { A: "1", B: "2" }, apiKey, model);
                } else if (provider === "openai") {
                  await solveWithOpenAIDirect("1+1=?", { A: "1", B: "2" }, apiKey, model);
                } else if (provider === "deepseek") {
                  await solveWithDeepSeekDirect("1+1=?", { A: "1", B: "2" }, apiKey, model);
                } else {
                  await solveWithOpenRouterDirect("1+1=?", { A: "1", B: "2" }, apiKey, model);
                }
                sendResponse({
                  success: true,
                  data: {
                    connected: true,
                    message: `K\u1EBFt n\u1ED1i th\xE0nh c\xF4ng t\u1EDBi ${provider.toUpperCase()} (${model})!`
                  }
                });
              } catch (aiErr) {
                sendResponse({
                  success: false,
                  error: aiErr.message || `L\u1ED7i x\xE1c th\u1EF1c ${provider.toUpperCase()}`
                });
              }
              break;
            }
            if (backendOnline) {
              sendResponse({
                success: true,
                data: { connected: true, message: "Backend Vercel Online" }
              });
            } else {
              sendResponse({
                success: false,
                error: "Backend Vercel \u0111ang b\u1EADn ho\u1EB7c ngo\u1EA1i tuy\u1EBFn."
              });
            }
          } catch (e) {
            sendResponse({
              success: false,
              error: "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i t\u1EDBi Backend Vercel (https://quizlens-ai-omega.vercel.app)"
            });
          }
          break;
        }
        case "TEST_AI_KEY": {
          const { provider, model, apiKey } = message.payload;
          try {
            const answerRes = await fetch("https://quizlens-ai-omega.vercel.app/api/v1/answer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: "Th\u1EE7 \u0111\xF4 c\u1EE7a Vi\u1EC7t Nam l\xE0 g\xEC?",
                options: { A: "H\xE0 N\u1ED9i", B: "TP.HCM" },
                provider,
                model,
                apiKey
              }),
              signal: AbortSignal.timeout(1e4)
            });
            const answerJson = await answerRes.json();
            if (answerRes.ok && answerJson.success) {
              sendResponse({ success: true, data: answerJson.data });
            } else {
              sendResponse({ success: false, error: answerJson.error?.message || "L\u1ED7i t\u1EEB AI Provider" });
            }
          } catch (e) {
            try {
              let res;
              if (provider === "gemini") res = await solveWithGeminiDirect("Th\u1EE7 \u0111\xF4?", { A: "HN", B: "SG" }, apiKey, model);
              else if (provider === "groq") res = await solveWithGroqDirect("Th\u1EE7 \u0111\xF4?", { A: "HN", B: "SG" }, apiKey, model);
              else if (provider === "openai") res = await solveWithOpenAIDirect("Th\u1EE7 \u0111\xF4?", { A: "HN", B: "SG" }, apiKey, model);
              else if (provider === "deepseek") res = await solveWithDeepSeekDirect("Th\u1EE7 \u0111\xF4?", { A: "HN", B: "SG" }, apiKey, model);
              else res = await solveWithOpenRouterDirect("Th\u1EE7 \u0111\xF4?", { A: "HN", B: "SG" }, apiKey, model);
              sendResponse({ success: true, data: res });
            } catch (err) {
              sendResponse({ success: false, error: err.message });
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
