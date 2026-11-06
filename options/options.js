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

// src/options/options.ts
document.addEventListener("DOMContentLoaded", () => {
  const backendUrlInput = document.getElementById("backendUrl");
  const debounceMsInput = document.getElementById("debounceMs");
  const autoCopyInput = document.getElementById("autoCopy");
  const geminiModelSelect = document.getElementById("geminiModel");
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const groqModelSelect = document.getElementById("groqModel");
  const groqApiKeyInput = document.getElementById("groqApiKey");
  const openrouterModelSelect = document.getElementById("openrouterModel");
  const openrouterApiKeyInput = document.getElementById("openrouterApiKey");
  const saveBtn = document.getElementById("saveOptionsBtn");
  const resetBtn = document.getElementById("resetBtn");
  const saveStatus = document.getElementById("saveStatus");
  function populateUI(settings) {
    backendUrlInput.value = settings.backendUrl;
    debounceMsInput.value = String(settings.debounceMs || 400);
    autoCopyInput.checked = settings.autoCopy;
    geminiModelSelect.value = settings.geminiModel || "gemini-1.5-flash";
    geminiApiKeyInput.value = settings.geminiApiKey || "";
    groqModelSelect.value = settings.groqModel || "llama-3.3-70b-versatile";
    groqApiKeyInput.value = settings.groqApiKey || "";
    openrouterModelSelect.value = settings.openrouterModel || "meta-llama/llama-3.3-70b-instruct:free";
    openrouterApiKeyInput.value = settings.openrouterApiKey || "";
  }
  chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
    if (res?.success && res.data) {
      populateUI(res.data);
    }
  });
  saveBtn.addEventListener("click", () => {
    const updated = {
      backendUrl: backendUrlInput.value.trim() || DEFAULT_SETTINGS.backendUrl,
      debounceMs: Math.max(100, Math.min(3e3, parseInt(debounceMsInput.value, 10) || 400)),
      autoCopy: autoCopyInput.checked,
      geminiModel: geminiModelSelect.value,
      geminiApiKey: geminiApiKeyInput.value.trim(),
      groqModel: groqModelSelect.value,
      groqApiKey: groqApiKeyInput.value.trim(),
      openrouterModel: openrouterModelSelect.value,
      openrouterApiKey: openrouterApiKeyInput.value.trim()
    };
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: updated }, (res) => {
      if (res?.success) {
        saveStatus.textContent = "\u0110\xE3 l\u01B0u th\xE0nh c\xF4ng!";
        setTimeout(() => {
          saveStatus.textContent = "";
        }, 2500);
      }
    });
  });
  resetBtn.addEventListener("click", () => {
    if (confirm("B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n kh\xF4i ph\u1EE5c to\xE0n b\u1ED9 c\xE0i \u0111\u1EB7t v\u1EC1 m\u1EB7c \u0111\u1ECBnh?")) {
      chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload: DEFAULT_SETTINGS }, (res) => {
        if (res?.success) {
          populateUI(DEFAULT_SETTINGS);
          saveStatus.textContent = "\u0110\xE3 \u0111\u1EB7t l\u1EA1i v\u1EC1 m\u1EB7c \u0111\u1ECBnh!";
          setTimeout(() => {
            saveStatus.textContent = "";
          }, 2500);
        }
      });
    }
  });
});
//# sourceMappingURL=options.js.map
