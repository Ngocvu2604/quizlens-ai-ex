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
var PROVIDER_MODELS = {
  gemini: ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-2.5-flash", "gemini-1.5-pro"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  openrouter: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "qwen/qwen-2.5-72b-instruct:free"
  ]
};

// src/popup/popup.ts
document.addEventListener("DOMContentLoaded", () => {
  const enabledToggle = document.getElementById("enabledToggle");
  const backendUrlInput = document.getElementById("backendUrl");
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
      statusBadge.textContent = "Ch\u01B0a c\xF3 Key";
      statusBadge.className = "status-badge error";
    }
  }
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
    if (response?.success && response.data) {
      currentSettings = { ...DEFAULT_SETTINGS, ...response.data };
      enabledToggle.checked = currentSettings.enabled;
      backendUrlInput.value = currentSettings.backendUrl;
      providerSelect.value = currentSettings.activeProvider;
      autoCopyToggle.checked = currentSettings.autoCopy;
      const activeModel = currentSettings.activeProvider === "gemini" ? currentSettings.geminiModel : currentSettings.activeProvider === "groq" ? currentSettings.groqModel : currentSettings.openrouterModel;
      updateModelOptions(currentSettings.activeProvider, activeModel);
      syncApiKeyField(currentSettings.activeProvider);
    }
  });
  providerSelect.addEventListener("change", () => {
    const provider = providerSelect.value;
    currentSettings.activeProvider = provider;
    updateModelOptions(provider);
    syncApiKeyField(provider);
  });
  apiKeyInput.addEventListener("input", () => {
    updateStatusBadge();
  });
  let isKeyVisible = false;
  toggleApiKeyVisBtn.addEventListener("click", () => {
    isKeyVisible = !isKeyVisible;
    apiKeyInput.type = isKeyVisible ? "text" : "password";
    toggleApiKeyVisBtn.textContent = isKeyVisible ? "\u1EA8n" : "Hi\u1EC7n";
  });
  testBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (key.length > 5) {
      statusBadge.textContent = "S\u1EB5n s\xE0ng";
      statusBadge.className = "status-badge connected";
      showFeedback("API Key \u0111\xE3 \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh v\xE0 s\u1EB5n s\xE0ng ho\u1EA1t \u0111\u1ED9ng tr\u1EF1c ti\u1EBFp!", "success");
      return;
    }
    statusBadge.textContent = "\u0110ang ki\u1EC3m tra...";
    statusBadge.className = "status-badge";
    feedbackMsg.textContent = "";
    const targetUrl = backendUrlInput.value.trim() || DEFAULT_SETTINGS.backendUrl;
    chrome.runtime.sendMessage(
      { type: "TEST_CONNECTION", payload: { backendUrl: targetUrl } },
      (res) => {
        if (res?.success) {
          statusBadge.textContent = "K\u1EBFt n\u1ED1i OK";
          statusBadge.className = "status-badge connected";
          showFeedback("\u0110\xE3 k\u1EBFt n\u1ED1i v\u1EDBi m\xE1y ch\u1EE7!", "success");
        } else {
          statusBadge.textContent = "Ch\u01B0a c\xF3 Key";
          statusBadge.className = "status-badge error";
          showFeedback("Vui l\xF2ng d\xE1n API Key \u0111\u1EC3 s\u1EED d\u1EE5ng tr\u1EF1c ti\u1EBFp!", "error");
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
      backendUrl: backendUrlInput.value.trim() || DEFAULT_SETTINGS.backendUrl,
      activeProvider,
      autoCopy: autoCopyToggle.checked
    };
    if (activeProvider === "gemini") {
      updated.geminiModel = selectedModel;
      updated.geminiApiKey = apiKey;
    } else if (activeProvider === "groq") {
      updated.groqModel = selectedModel;
      updated.groqApiKey = apiKey;
    } else if (activeProvider === "openrouter") {
      updated.openrouterModel = selectedModel;
      updated.openrouterApiKey = apiKey;
    }
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: updated }, (res) => {
      if (res?.success) {
        currentSettings = { ...currentSettings, ...updated };
        updateStatusBadge();
        showFeedback("\u0110\xE3 l\u01B0u c\u1EA5u h\xECnh th\xE0nh c\xF4ng!", "success");
      } else {
        showFeedback("L\u1ED7i khi l\u01B0u c\u1EA5u h\xECnh.", "error");
      }
    });
  });
  function showFeedback(text, type) {
    feedbackMsg.textContent = text;
    feedbackMsg.className = `feedback-msg ${type}`;
    setTimeout(() => {
      if (feedbackMsg.textContent === text) {
        feedbackMsg.textContent = "";
      }
    }, 3e3);
  }
});
//# sourceMappingURL=popup.js.map
