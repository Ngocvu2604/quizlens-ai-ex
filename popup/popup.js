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
var PROVIDER_MODELS = {
  gemini: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openrouter: [
    "deepseek/deepseek-r1:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "qwen/qwen-2.5-72b-instruct:free"
  ]
};

// src/popup/popup.ts
document.addEventListener("DOMContentLoaded", () => {
  const enabledToggle = document.getElementById("enabledToggle");
  const providerSelect = document.getElementById("providerSelect");
  const modelSelect = document.getElementById("modelSelect");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const toggleApiKeyVisBtn = document.getElementById("toggleApiKeyVis");
  const autoCopyToggle = document.getElementById("autoCopyToggle");
  const testBtn = document.getElementById("testBtn");
  const saveBtn = document.getElementById("saveBtn");
  const statusBadge = document.getElementById("statusBadge");
  const feedbackMsg = document.getElementById("feedbackMsg");
  const keyHint = document.getElementById("keyHint");
  let currentSettings = { ...DEFAULT_SETTINGS };
  let currentActiveProvider = "gemini";
  function updateModelOptions(provider, selectedModel) {
    const models = PROVIDER_MODELS[provider] || [];
    modelSelect.innerHTML = "";
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      if (m === selectedModel) {
        opt.selected = true;
      }
      modelSelect.appendChild(opt);
    });
  }
  function syncApiKeyField(provider) {
    if (provider === "gemini") {
      apiKeyInput.value = currentSettings.geminiApiKey || "";
      apiKeyInput.placeholder = "AIzaSy...";
      keyHint.innerHTML = 'L\u1EA5y API Key mi\u1EC5n ph\xED t\u1EA1i: <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #2563EB; font-weight: 600;">Google AI Studio</a>';
    } else if (provider === "groq") {
      apiKeyInput.value = currentSettings.groqApiKey || "";
      apiKeyInput.placeholder = "gsk_...";
      keyHint.innerHTML = 'L\u1EA5y API Key mi\u1EC5n ph\xED t\u1EA1i: <a href="https://console.groq.com/keys" target="_blank" style="color: #2563EB; font-weight: 600;">Groq Console</a>';
    } else if (provider === "openai") {
      apiKeyInput.value = currentSettings.openaiApiKey || "";
      apiKeyInput.placeholder = "sk-proj-... ho\u1EB7c sk-...";
      keyHint.innerHTML = 'L\u1EA5y API Key t\u1EA1i: <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #2563EB; font-weight: 600;">OpenAI Platform</a>';
    } else if (provider === "deepseek") {
      apiKeyInput.value = currentSettings.deepseekApiKey || "";
      apiKeyInput.placeholder = "sk-...";
      keyHint.innerHTML = 'L\u1EA5y API Key t\u1EA1i: <a href="https://platform.deepseek.com/api_keys" target="_blank" style="color: #2563EB; font-weight: 600;">DeepSeek Platform</a>';
    } else if (provider === "openrouter") {
      apiKeyInput.value = currentSettings.openrouterApiKey || "";
      apiKeyInput.placeholder = "sk-or-...";
      keyHint.innerHTML = 'L\u1EA5y API Key mi\u1EC5n ph\xED t\u1EA1i: <a href="https://openrouter.ai/keys" target="_blank" style="color: #2563EB; font-weight: 600;">OpenRouter Keys</a>';
    }
    updateStatusBadge();
  }
  function updateStatusBadge() {
    const key = apiKeyInput.value.trim();
    if (key.length > 5) {
      statusBadge.textContent = "Key s\u1EB5n s\xE0ng";
      statusBadge.className = "status-badge connected";
    } else {
      statusBadge.textContent = "Backend Online";
      statusBadge.className = "status-badge connected";
    }
  }
  chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
    if (res?.success) {
      statusBadge.textContent = apiKeyInput.value.trim().length > 5 ? "Key s\u1EB5n s\xE0ng" : "Backend Online";
      statusBadge.className = "status-badge connected";
    } else {
      statusBadge.textContent = "Backend Offline";
      statusBadge.className = "status-badge error";
    }
  });
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
    if (response?.success && response.data) {
      currentSettings = { ...DEFAULT_SETTINGS, ...response.data };
      currentActiveProvider = currentSettings.activeProvider || "gemini";
      enabledToggle.checked = currentSettings.enabled;
      providerSelect.value = currentActiveProvider;
      autoCopyToggle.checked = currentSettings.autoCopy;
      if (currentSettings.groqModel && currentSettings.groqModel.includes("mixtral")) {
        currentSettings.groqModel = "llama-3.3-70b-versatile";
      }
      const activeModel = currentActiveProvider === "gemini" ? currentSettings.geminiModel : currentActiveProvider === "groq" ? currentSettings.groqModel : currentActiveProvider === "openai" ? currentSettings.openaiModel : currentActiveProvider === "deepseek" ? currentSettings.deepseekModel : currentSettings.openrouterModel;
      updateModelOptions(currentActiveProvider, activeModel);
      syncApiKeyField(currentActiveProvider);
    }
  });
  providerSelect.addEventListener("change", () => {
    const currentVal = apiKeyInput.value.trim();
    if (currentActiveProvider === "gemini") currentSettings.geminiApiKey = currentVal;
    else if (currentActiveProvider === "groq") currentSettings.groqApiKey = currentVal;
    else if (currentActiveProvider === "openai") currentSettings.openaiApiKey = currentVal;
    else if (currentActiveProvider === "deepseek") currentSettings.deepseekApiKey = currentVal;
    else if (currentActiveProvider === "openrouter") currentSettings.openrouterApiKey = currentVal;
    const newProvider = providerSelect.value;
    currentActiveProvider = newProvider;
    currentSettings.activeProvider = newProvider;
    const targetModel = newProvider === "gemini" ? currentSettings.geminiModel : newProvider === "groq" ? currentSettings.groqModel : newProvider === "openai" ? currentSettings.openaiModel : newProvider === "deepseek" ? currentSettings.deepseekModel : currentSettings.openrouterModel;
    updateModelOptions(newProvider, targetModel);
    syncApiKeyField(newProvider);
  });
  apiKeyInput.addEventListener("input", () => {
    const val = apiKeyInput.value.trim();
    if (currentActiveProvider === "gemini") currentSettings.geminiApiKey = val;
    else if (currentActiveProvider === "groq") currentSettings.groqApiKey = val;
    else if (currentActiveProvider === "openai") currentSettings.openaiApiKey = val;
    else if (currentActiveProvider === "deepseek") currentSettings.deepseekApiKey = val;
    else if (currentActiveProvider === "openrouter") currentSettings.openrouterApiKey = val;
    updateStatusBadge();
  });
  let isKeyVisible = false;
  toggleApiKeyVisBtn.addEventListener("click", () => {
    isKeyVisible = !isKeyVisible;
    apiKeyInput.type = isKeyVisible ? "text" : "password";
    toggleApiKeyVisBtn.textContent = isKeyVisible ? "\u1EA8n" : "Hi\u1EC7n";
  });
  testBtn.addEventListener("click", () => {
    testBtn.disabled = true;
    testBtn.textContent = "\u0110ang ki\u1EC3m tra...";
    statusBadge.textContent = "\u0110ang k\u1EBFt n\u1ED1i...";
    statusBadge.className = "status-badge";
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const key = apiKeyInput.value.trim();
    chrome.runtime.sendMessage(
      {
        type: "TEST_CONNECTION",
        payload: { provider, model, apiKey: key, isExplicitTest: true }
      },
      (res) => {
        testBtn.disabled = false;
        testBtn.textContent = "Ki\u1EC3m tra k\u1EBFt n\u1ED1i";
        if (res?.success) {
          statusBadge.textContent = "\u0110\xE3 k\u1EBFt n\u1ED1i AI";
          statusBadge.className = "status-badge connected";
          showFeedback(res.data?.message || "K\u1EBFt n\u1ED1i th\xE0nh c\xF4ng!", "success");
        } else {
          statusBadge.textContent = "L\u1ED7i k\u1EBFt n\u1ED1i";
          statusBadge.className = "status-badge error";
          showFeedback(`L\u1ED7i: ${res?.error || "Kh\xF4ng k\u1EBFt n\u1ED1i \u0111\u01B0\u1EE3c"}`, "error");
        }
      }
    );
  });
  saveBtn.addEventListener("click", () => {
    const activeProvider = providerSelect.value;
    const selectedModel = modelSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const updated = {
      enabled: enabledToggle.checked,
      activeProvider,
      autoCopy: autoCopyToggle.checked
    };
    if (activeProvider === "gemini") {
      updated.geminiModel = selectedModel;
      updated.geminiApiKey = apiKey;
      currentSettings.geminiApiKey = apiKey;
      currentSettings.geminiModel = selectedModel;
    } else if (activeProvider === "groq") {
      updated.groqModel = selectedModel;
      updated.groqApiKey = apiKey;
      currentSettings.groqApiKey = apiKey;
      currentSettings.groqModel = selectedModel;
    } else if (activeProvider === "openai") {
      updated.openaiModel = selectedModel;
      updated.openaiApiKey = apiKey;
      currentSettings.openaiApiKey = apiKey;
      currentSettings.openaiModel = selectedModel;
    } else if (activeProvider === "deepseek") {
      updated.deepseekModel = selectedModel;
      updated.deepseekApiKey = apiKey;
      currentSettings.deepseekApiKey = apiKey;
      currentSettings.deepseekModel = selectedModel;
    } else if (activeProvider === "openrouter") {
      updated.openrouterModel = selectedModel;
      updated.openrouterApiKey = apiKey;
      currentSettings.openrouterApiKey = apiKey;
      currentSettings.openrouterModel = selectedModel;
    }
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: updated }, (res) => {
      if (res?.success) {
        currentSettings = { ...currentSettings, ...updated };
        updateStatusBadge();
        const providerNames = {
          gemini: "Google Gemini",
          groq: "Groq Cloud",
          openai: "OpenAI (ChatGPT)",
          deepseek: "DeepSeek AI",
          openrouter: "OpenRouter"
        };
        const providerName = providerNames[activeProvider] || activeProvider;
        showFeedback(`\u0110\xE3 l\u01B0u c\u1EA5u h\xECnh: ${providerName} (${selectedModel})!`, "success");
      } else {
        showFeedback("L\u1ED7i khi l\u01B0u c\u1EA5u h\xECnh.", "error");
      }
    });
  });
  function showFeedback(text, type) {
    feedbackMsg.textContent = text;
    feedbackMsg.className = `feedback-msg ${type}`;
    if (type === "success") {
      setTimeout(() => {
        if (feedbackMsg.textContent === text) {
          feedbackMsg.textContent = "";
        }
      }, 3500);
    }
  }
});
//# sourceMappingURL=popup.js.map
