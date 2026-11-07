// src/content/dom-extractor.ts
var EXPECTED_OPTIONS = ["A", "B", "C", "D", "E"];
function extractOptionsFromDOM(selectedQuestionText, range) {
  try {
    let startNode = range.commonAncestorContainer;
    if (startNode.nodeType === Node.TEXT_NODE) {
      startNode = startNode.parentElement;
    }
    if (!startNode || !(startNode instanceof HTMLElement)) {
      return null;
    }
    let currentContainer = startNode;
    let depth = 0;
    const maxDepth = 6;
    while (currentContainer && currentContainer !== document.body && depth < maxDepth) {
      const containerText = normalizeText(currentContainer.innerText || currentContainer.textContent || "");
      if (containerText && containerText.includes(selectedQuestionText.trim())) {
        const parsed = parseQuestionFromText(containerText);
        if (parsed) {
          return {
            question: selectedQuestionText.trim().length > 5 ? selectedQuestionText.trim() : parsed.question,
            options: parsed.options,
            rawText: containerText
          };
        }
        const structured = extractFromStructuredElements(currentContainer, selectedQuestionText);
        if (structured) {
          return structured;
        }
      }
      currentContainer = currentContainer.parentElement;
      depth++;
    }
    const siblingResult = extractFromNextSiblings(startNode, selectedQuestionText);
    if (siblingResult) {
      return siblingResult;
    }
    return null;
  } catch (error) {
    return null;
  }
}
function extractFromStructuredElements(container, questionText) {
  const optionsMap = {};
  const candidateSelectors = [
    "li",
    ".option",
    ".choice",
    ".answer",
    ".answer-item",
    ".quiz-option",
    "label",
    ".form-check",
    'div[role="radio"]'
  ];
  for (const selector of candidateSelectors) {
    const elements = Array.from(container.querySelectorAll(selector));
    if (elements.length >= 4) {
      const foundOptions = {};
      for (const el of elements) {
        const text = normalizeText(el.innerText || el.textContent || "");
        const match = text.match(/^[\(\[]?([A-Da-d])[\)\].:\-\s]\s*(.*)$/s);
        if (match) {
          const letter = match[1].toUpperCase();
          const content = match[2].trim();
          if (content && EXPECTED_OPTIONS.includes(letter)) {
            foundOptions[letter] = content;
          }
        }
      }
      if (foundOptions.A && foundOptions.B) {
        return {
          question: questionText.trim(),
          options: {
            A: foundOptions.A,
            B: foundOptions.B,
            ...foundOptions.C ? { C: foundOptions.C } : {},
            ...foundOptions.D ? { D: foundOptions.D } : {},
            ...foundOptions.E ? { E: foundOptions.E } : {}
          }
        };
      }
    }
  }
  const radioLabels = Array.from(container.querySelectorAll("label"));
  if (radioLabels.length >= 2 && radioLabels.length <= 5) {
    const letters = ["A", "B", "C", "D", "E"];
    const autoMapped = {};
    let allValid = true;
    for (let i = 0; i < radioLabels.length; i++) {
      const text = normalizeText(radioLabels[i].innerText || radioLabels[i].textContent || "").replace(/^[A-Ea-e][\)\].:\-]\s*/, "").trim();
      if (!text) {
        allValid = false;
        break;
      }
      autoMapped[letters[i]] = text;
    }
    if (allValid && autoMapped.A && autoMapped.B) {
      return {
        question: questionText.trim(),
        options: {
          A: autoMapped.A,
          B: autoMapped.B,
          ...autoMapped.C ? { C: autoMapped.C } : {},
          ...autoMapped.D ? { D: autoMapped.D } : {},
          ...autoMapped.E ? { E: autoMapped.E } : {}
        }
      };
    }
  }
  return null;
}
function extractFromNextSiblings(questionElement, questionText) {
  let sibling = questionElement.nextElementSibling;
  const collectedTextLines = [];
  let steps = 0;
  while (sibling && steps < 10) {
    const text = normalizeText(sibling.innerText || sibling.textContent || "");
    if (text) {
      collectedTextLines.push(text);
    }
    sibling = sibling.nextElementSibling;
    steps++;
  }
  if (collectedTextLines.length > 0) {
    const fullText = `${questionText}
${collectedTextLines.join("\n")}`;
    const parsed = parseQuestionFromText(fullText);
    if (parsed) {
      return {
        question: questionText.trim(),
        options: parsed.options,
        rawText: fullText
      };
    }
  }
  return null;
}

// src/content/question-detector.ts
var EXPECTED_OPTIONS2 = ["A", "B", "C", "D", "E"];
var OPTION_PREFIX_REGEX = /(?:^|[\r\n]+|[•\*\-\–\—\+·]\s*|\s{2,}|\t)(?:[\(\[]?([A-Ea-e])[\)\].:\-]\s*)|(?:\s+)([A-Ea-e])[\.:\-]\s*/g;
function normalizeText(text) {
  if (!text) return "";
  return text.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}
function isDisqualifiedNonQuestion(text) {
  const trimmed = text.trim();
  if (trimmed.length < 15) return true;
  const noisePatterns = [
    /^(menu|navigation|trang chủ|home|contact|giới thiệu|about us|footer|bản quyền|copyright)/i,
    /^(điều khoản|chính sách bảo mật|terms of service|privacy policy)/i,
    /^(đăng nhập|đăng ký|sign in|sign up|log in|register)$/i
  ];
  return noisePatterns.some((pattern) => pattern.test(trimmed));
}
function parseQuestionFromText(rawText) {
  const text = normalizeText(rawText);
  if (!text || isDisqualifiedNonQuestion(text)) {
    return null;
  }
  const matches = [];
  const regex = new RegExp(OPTION_PREFIX_REGEX);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawLetter = match[1] || match[2];
    if (!rawLetter) continue;
    const letter = rawLetter.toUpperCase();
    const matchStart = match.index + (match[0].length - match[0].trimStart().length);
    matches.push({
      letter,
      index: matchStart,
      fullMatchLength: match[0].trimStart().length
    });
  }
  if (matches.length < 2) {
    return null;
  }
  const lastSeenIndexByLetter = /* @__PURE__ */ new Map();
  for (let i = 0; i < matches.length; i++) {
    lastSeenIndexByLetter.set(matches[i].letter, i);
  }
  const filteredIndices = new Set(lastSeenIndexByLetter.values());
  const validMatches = matches.filter((_, idx) => filteredIndices.has(idx));
  const uniqueLetters = new Set(validMatches.map((m) => m.letter));
  if (!uniqueLetters.has("A") || !uniqueLetters.has("B")) {
    return null;
  }
  const firstOptionIndex = validMatches[0].index;
  const questionPart = text.slice(0, firstOptionIndex).trim();
  if (questionPart.length < 5) {
    return null;
  }
  const optionsMap = {};
  for (let i = 0; i < validMatches.length; i++) {
    const current = validMatches[i];
    const next = validMatches[i + 1];
    const startIndex = current.index + current.fullMatchLength;
    const endIndex = next ? next.index : text.length;
    const content = text.slice(startIndex, endIndex).trim();
    if (!content) {
      return null;
    }
    if (EXPECTED_OPTIONS2.includes(current.letter)) {
      optionsMap[current.letter] = content;
    }
  }
  if (!optionsMap.A || !optionsMap.B) {
    return null;
  }
  return {
    question: questionPart,
    options: {
      A: optionsMap.A,
      B: optionsMap.B,
      ...optionsMap.C ? { C: optionsMap.C } : {},
      ...optionsMap.D ? { D: optionsMap.D } : {},
      ...optionsMap.E ? { E: optionsMap.E } : {}
    },
    rawText: text
  };
}
function detectQuestion(selectionText, selectionRange) {
  const normalized = normalizeText(selectionText);
  if (!normalized || normalized.length < 5) {
    return { isValid: false, data: null, reason: "Selection text too short" };
  }
  const directResult = parseQuestionFromText(normalized);
  if (directResult) {
    return {
      isValid: true,
      data: directResult
    };
  }
  if (selectionRange) {
    const domExtracted = extractOptionsFromDOM(normalized, selectionRange);
    if (domExtracted) {
      return {
        isValid: true,
        data: domExtracted
      };
    }
  }
  return {
    isValid: false,
    data: null,
    reason: "Could not extract 4 valid options (A, B, C, D)"
  };
}

// src/content/result-popup.ts
var ResultPopup = class {
  container = null;
  popupEl = null;
  isVisible = false;
  currentAnswerText = "";
  constructor() {
    this.initContainer();
    this.attachGlobalListeners();
  }
  initContainer() {
    let existing = document.getElementById("quizlens-root-container");
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "quizlens-root-container";
      document.body.appendChild(existing);
    }
    this.container = existing;
  }
  attachGlobalListeners() {
    document.addEventListener("mousedown", (event) => {
      if (!this.isVisible || !this.popupEl) return;
      const target = event.target;
      if (!this.popupEl.contains(target)) {
        this.hide();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (this.isVisible && event.key === "Escape") {
        this.hide();
      }
    });
  }
  /**
   * Position the popup relative to the selection rect
   */
  positionAtRect(rect) {
    if (!this.popupEl) return;
    const popupWidth = 320;
    const popupEstimatedHeight = 180;
    const margin = 10;
    const pageX = window.scrollX;
    const pageY = window.scrollY;
    let top = rect.bottom + pageY + margin;
    let left = rect.left + pageX;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (rect.left + popupWidth > viewportWidth - 20) {
      left = Math.max(20, viewportWidth - popupWidth - 20) + pageX;
    }
    if (rect.bottom + popupEstimatedHeight > viewportHeight - 20 && rect.top > popupEstimatedHeight + margin) {
      top = rect.top + pageY - popupEstimatedHeight - margin;
    }
    this.popupEl.style.top = `${Math.round(top)}px`;
    this.popupEl.style.left = `${Math.round(left)}px`;
  }
  /**
   * Ensure popup element exists and is empty
   */
  preparePopup(rect) {
    this.initContainer();
    if (!this.popupEl) {
      this.popupEl = document.createElement("div");
      this.popupEl.className = "quizlens-popup";
      this.container?.appendChild(this.popupEl);
    }
    this.positionAtRect(rect);
    this.popupEl.innerHTML = "";
    this.isVisible = true;
  }
  /**
   * Render Loading State
   */
  showLoading(rect) {
    this.preparePopup(rect);
    if (!this.popupEl) return;
    this.popupEl.innerHTML = `
      <div class="quizlens-header">
        <div class="quizlens-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          QuizLens AI
        </div>
        <button class="quizlens-close-btn" title="\u0110\xF3ng">&times;</button>
      </div>
      <div class="quizlens-body">
        <div class="quizlens-loading">
          <div class="quizlens-spinner"></div>
          <div class="quizlens-loading-text">AI \u0111ang ph\xE2n t\xEDch c\xE2u h\u1ECFi...</div>
        </div>
      </div>
    `;
    this.bindCloseButton();
  }
  /**
   * Render Success Result State
   */
  showResult(result, rect, autoCopy = false) {
    this.preparePopup(rect);
    if (!this.popupEl) return;
    this.currentAnswerText = `${result.answer ? result.answer + ". " : ""}${result.answerText || ""}`.trim();
    if (autoCopy && this.currentAnswerText) {
      navigator.clipboard?.writeText(this.currentAnswerText).catch(() => {
      });
    }
    const confidencePercent = Math.round((result.confidence || 0.95) * 100);
    this.popupEl.innerHTML = `
      <div class="quizlens-header">
        <div class="quizlens-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          QuizLens AI
        </div>
        <button class="quizlens-close-btn" title="\u0110\xF3ng">&times;</button>
      </div>
      <div class="quizlens-body">
        <div class="quizlens-result">
          <div class="quizlens-section-label">\u0110\xC1P \xC1N CH\xCDNH X\xC1C</div>
          <div class="quizlens-answer-row">
            <div class="quizlens-letter-badge">${result.answer || "?"}</div>
            <div class="quizlens-answer-text">${this.escapeHtml(result.answerText || "Kh\xF4ng c\xF3 m\xF4 t\u1EA3")}</div>
          </div>
          <div class="quizlens-meta-bar">
            <span class="quizlens-confidence">\u0110\u1ED9 tin c\u1EADy: ${confidencePercent}%</span>
            <button class="quizlens-copy-btn" id="ql-copy-btn">
              ${autoCopy ? "\u0110\xE3 sao ch\xE9p" : "Sao ch\xE9p"}
            </button>
          </div>
        </div>
      </div>
    `;
    this.bindCloseButton();
    this.bindCopyButton();
  }
  /**
   * Render UNKNOWN Result State
   */
  showUnknown(rect, reason) {
    this.preparePopup(rect);
    if (!this.popupEl) return;
    this.popupEl.innerHTML = `
      <div class="quizlens-header">
        <div class="quizlens-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          QuizLens AI
        </div>
        <button class="quizlens-close-btn" title="\u0110\xF3ng">&times;</button>
      </div>
      <div class="quizlens-body">
        <div class="quizlens-unknown">
          <div class="quizlens-unknown-title">Kh\xF4ng x\xE1c \u0111\u1ECBnh \u0111\u01B0\u1EE3c c\xE2u h\u1ECFi</div>
          <div class="quizlens-unknown-desc">
            ${this.escapeHtml(reason || "Kh\xF4ng t\xECm th\u1EA5y c\xE1c ph\u01B0\u01A1ng \xE1n l\u1EF1a ch\u1ECDn (A, B...) xung quanh v\xF9ng ch\u1ECDn.")}
          </div>
        </div>
      </div>
    `;
    this.bindCloseButton();
  }
  /**
   * Render Error State
   */
  showError(message, rect) {
    this.preparePopup(rect);
    if (!this.popupEl) return;
    this.popupEl.innerHTML = `
      <div class="quizlens-header">
        <div class="quizlens-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          QuizLens AI
        </div>
        <button class="quizlens-close-btn" title="\u0110\xF3ng">&times;</button>
      </div>
      <div class="quizlens-body">
        <div class="quizlens-error">
          <div class="quizlens-unknown-title" style="color: var(--ql-error)">L\u1ED7i x\u1EED l\xFD</div>
          <div class="quizlens-error-desc">${this.escapeHtml(message)}</div>
        </div>
      </div>
    `;
    this.bindCloseButton();
  }
  hide() {
    if (this.popupEl && this.container) {
      this.popupEl.remove();
      this.popupEl = null;
    }
    this.isVisible = false;
  }
  bindCloseButton() {
    const btn = this.popupEl?.querySelector(".quizlens-close-btn");
    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });
  }
  bindCopyButton() {
    const btn = this.popupEl?.querySelector("#ql-copy-btn");
    if (!btn) return;
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(this.currentAnswerText);
        btn.textContent = "\u0110\xE3 sao ch\xE9p!";
        btn.classList.add("copied");
        setTimeout(() => {
          if (btn) {
            btn.textContent = "Sao ch\xE9p";
            btn.classList.remove("copied");
          }
        }, 2e3);
      } catch (err) {
        btn.textContent = "L\u1ED7i copy";
      }
    });
  }
  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
};

// src/shared/constants.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  mode: "direct",
  backendUrl: "https://quizlens-ai-omega.vercel.app",
  activeProvider: "gemini",
  geminiModel: "gemini-2.0-flash",
  groqModel: "llama-3.3-70b-versatile",
  openrouterModel: "meta-llama/llama-3.3-70b-instruct:free",
  autoCopy: false,
  debounceMs: 400
};

// src/content/selection.ts
var SelectionController = class {
  popup;
  debounceTimer = null;
  lastProcessedHash = "";
  isProcessing = false;
  settings = DEFAULT_SETTINGS;
  constructor() {
    this.popup = new ResultPopup();
    this.loadSettings();
    this.attachEventListeners();
    this.listenToSettingsChanges();
  }
  loadSettings() {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.success && response.data) {
          this.settings = { ...DEFAULT_SETTINGS, ...response.data };
        }
      });
    }
  }
  listenToSettingsChanges() {
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" || area === "local") {
          if (changes.settings && changes.settings.newValue) {
            this.settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
          }
        }
      });
    }
  }
  attachEventListeners() {
    document.addEventListener("mouseup", (event) => {
      const target = event.target;
      if (target?.closest && target.closest("#quizlens-root-container")) {
        return;
      }
      this.handleSelectionChange();
    });
    document.addEventListener("keyup", (event) => {
      if (event.shiftKey || event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        this.handleSelectionChange();
      }
    });
  }
  handleSelectionChange() {
    if (!this.settings.enabled) return;
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.processCurrentSelection();
    }, this.settings.debounceMs || 400);
  }
  computeHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString();
  }
  async processCurrentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }
    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText.length < 5) {
      return;
    }
    const currentHash = this.computeHash(selectedText);
    if (currentHash === this.lastProcessedHash && !this.isProcessing) {
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return;
    }
    const detection = detectQuestion(selectedText, range);
    if (!detection.isValid || !detection.data) {
      return;
    }
    this.lastProcessedHash = currentHash;
    this.isProcessing = true;
    this.popup.showLoading(rect);
    try {
      const answerResult = await this.requestAnswer(detection.data);
      this.isProcessing = false;
      if (!answerResult) {
        this.popup.showError("Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c ph\u1EA3n h\u1ED3i t\u1EEB AI", rect);
        return;
      }
      if (answerResult.status === "SUCCESS" && answerResult.answer) {
        this.popup.showResult(answerResult, rect, this.settings.autoCopy);
      } else {
        this.popup.showUnknown(rect, "AI kh\xF4ng t\xECm \u0111\u01B0\u1EE3c \u0111\xE1p \xE1n ch\u1EAFc ch\u1EAFn cho c\xE2u h\u1ECFi n\xE0y.");
      }
    } catch (error) {
      this.isProcessing = false;
      const message = error?.message || "L\u1ED7i k\u1EBFt n\u1ED1i \u0111\u1EBFn Backend ho\u1EB7c AI Provider.";
      this.popup.showError(message, rect);
    }
  }
  requestAnswer(questionData) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        reject(new Error("Chrome Extension API kh\xF4ng kh\u1EA3 d\u1EE5ng"));
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "ANALYZE_QUESTION",
          payload: {
            question: questionData.question,
            options: questionData.options
          }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "L\u1ED7i g\u1EEDi tin nh\u1EAFn n\u1ED9i b\u1ED9"));
            return;
          }
          if (!response || !response.success) {
            reject(new Error(response?.error || "L\u1ED7i t\u1EEB m\xE1y ch\u1EE7 QuizLens AI"));
            return;
          }
          resolve(response.data);
        }
      );
    });
  }
};

// src/content/content.ts
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new SelectionController();
  });
} else {
  new SelectionController();
}
//# sourceMappingURL=content.js.map
