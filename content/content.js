// src/content/dom-extractor.ts
var OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
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
            questionType: parsed.questionType,
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
  const candidateSelectors = [
    "li",
    ".option",
    ".choice",
    ".answer",
    ".answer-item",
    ".quiz-option",
    ".cau-tra-loi",
    ".dapan",
    ".form-check",
    "label",
    'div[role="radio"]',
    'div[role="checkbox"]'
  ];
  const hasCheckboxes = container.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length >= 2;
  for (const selector of candidateSelectors) {
    const elements = Array.from(container.querySelectorAll(selector));
    if (elements.length >= 2 && elements.length <= 12) {
      const foundOptions = {};
      for (const el of elements) {
        const text = normalizeText(el.innerText || el.textContent || "");
        const match = text.match(/^[\(\[]?([A-Ha-h])[\)\].:\-\s]\s*(.*)$/s);
        if (match) {
          const letter = match[1].toUpperCase();
          const content = match[2].trim();
          if (content && OPTION_LETTERS.includes(letter)) {
            foundOptions[letter] = content;
          }
        }
      }
      if (foundOptions.A && foundOptions.B) {
        const count = Object.keys(foundOptions).length;
        const qType = hasCheckboxes ? "MULTI_SELECT" : detectQuestionType(questionText, count);
        return {
          question: questionText.trim(),
          options: foundOptions,
          questionType: qType
        };
      }
    }
  }
  const inputLabels = Array.from(container.querySelectorAll("label, .form-check-label, .custom-control-label"));
  if (inputLabels.length >= 2 && inputLabels.length <= 8) {
    const autoMapped = {};
    let allValid = true;
    for (let i = 0; i < inputLabels.length && i < OPTION_LETTERS.length; i++) {
      const text = normalizeText(inputLabels[i].innerText || inputLabels[i].textContent || "").replace(/^[\(\[]?[A-Ha-h1-8][\)\].:\-\s]\s*/, "").trim();
      if (!text) {
        allValid = false;
        break;
      }
      autoMapped[OPTION_LETTERS[i]] = text;
    }
    if (allValid && autoMapped.A && autoMapped.B) {
      const count = Object.keys(autoMapped).length;
      const qType = hasCheckboxes ? "MULTI_SELECT" : detectQuestionType(questionText, count);
      return {
        question: questionText.trim(),
        options: autoMapped,
        questionType: qType
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
        questionType: parsed.questionType,
        rawText: fullText
      };
    }
  }
  return null;
}

// src/content/question-detector.ts
var OPTION_LETTERS2 = ["A", "B", "C", "D", "E", "F", "G", "H"];
var OPTION_PREFIX_REGEX = /(?:^|[\r\n]+|[•\*\-\–\—\+·▪▫]\s*|\s{2,}|\t)(?:[\(\[]?([A-Ha-h])[\)\].:\-\/]\s*)|(?:\s+)([A-Ha-h])[\.:\-\/]\s*/g;
function normalizeText(text) {
  if (!text) return "";
  return text.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}
function isDisqualifiedNonQuestion(text) {
  const trimmed = text.trim();
  if (trimmed.length < 5) return true;
  const noisePatterns = [
    /^(menu|navigation|trang chủ|home|contact|giới thiệu|about us|footer|bản quyền|copyright)/i,
    /^(điều khoản|chính sách bảo mật|terms of service|privacy policy)/i,
    /^(đăng nhập|đăng ký|sign in|sign up|log in|register)$/i
  ];
  return noisePatterns.some((pattern) => pattern.test(trimmed));
}
function detectQuestionType(text, optionsCount = 0) {
  const lower = text.toLowerCase();
  const multiSelectRegex = /(?:chọn\s+(?:các|những|nhiều|tất\s+cả|hai|ba|bốn|\d+)\s+(?:đáp\s+án|phương\s+án|câu|khẳng\s+định|ý)|các\s+(?:đáp\s+án|khẳng\s+định|phương\s+án)\s+(?:nào\s+)?đúng|select\s+all(?:\s+that\s+apply)?|choose\s+all|which\s+of\s+the\s+following\s+are\s+correct|những\s+câu\s+nào\s+sau\s+đây\s+đúng|tick\s+vào|chọn\s+các|đánh\s+dấu\s+vào)/i;
  if (multiSelectRegex.test(lower) || /[☑☐]|\bcheckbox\b/i.test(text)) {
    return "MULTI_SELECT";
  }
  const blankRegex = /(?:\.{3,}|_{2,}|…|\[\s*(?:\.{2,}|_{2,}|…|\s*)\s*\]|\(\s*(?:\.{2,}|_{2,}|…|\s*)\s*\)|điền\s+(?:từ|vào\s+chỗ\s+trống|vào\s+ô\s+trống|khuyết)|chọn\s+từ\s+thích\s+hợp|fill\s+in\s+the\s+blank|complete\s+the\s+sentence|missing\s+word)/i;
  if (blankRegex.test(text)) {
    return "FILL_IN_BLANK";
  }
  if (optionsCount === 2) {
    if (/(?:đúng|sai|true|false|yes|no|có|không)/i.test(lower)) {
      return "BINARY";
    }
  }
  return "MULTIPLE_CHOICE";
}
function tryParseLetterOptions(text) {
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
  if (matches.length < 2) return null;
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
  if (questionPart.length < 3) return null;
  const optionsMap = {};
  for (let i = 0; i < validMatches.length; i++) {
    const current = validMatches[i];
    const next = validMatches[i + 1];
    const startIndex = current.index + current.fullMatchLength;
    const endIndex = next ? next.index : text.length;
    const content = text.slice(startIndex, endIndex).trim();
    if (!content) return null;
    optionsMap[current.letter] = content;
  }
  if (!optionsMap.A || !optionsMap.B) return null;
  const optionsCount = Object.keys(optionsMap).length;
  const questionType = detectQuestionType(text, optionsCount);
  return {
    question: questionPart,
    options: optionsMap,
    questionType,
    rawText: text
  };
}
function tryParseBinaryOptions(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length >= 2) {
    const last1 = lines[lines.length - 1];
    const last2 = lines[lines.length - 2];
    const isBinaryPair = (a, b) => {
      const cleanA = a.replace(/^[\(\[\-•\*\d+\.\]\s]+/, "").trim().toLowerCase();
      const cleanB = b.replace(/^[\(\[\-•\*\d+\.\]\s]+/, "").trim().toLowerCase();
      if (cleanA === "\u0111\xFAng" && cleanB === "sai" || cleanA === "sai" && cleanB === "\u0111\xFAng") return ["\u0110\xFAng", "Sai"];
      if (cleanA === "true" && cleanB === "false" || cleanA === "false" && cleanB === "true") return ["True", "False"];
      if (cleanA === "yes" && cleanB === "no" || cleanA === "no" && cleanB === "yes") return ["Yes", "No"];
      if (cleanA === "c\xF3" && cleanB === "kh\xF4ng" || cleanA === "kh\xF4ng" && cleanB === "c\xF3") return ["C\xF3", "Kh\xF4ng"];
      return null;
    };
    const pair = isBinaryPair(last2, last1);
    if (pair) {
      const questionPart = lines.slice(0, lines.length - 2).join("\n").trim();
      if (questionPart.length >= 3) {
        return {
          question: questionPart,
          options: { A: pair[0], B: pair[1] },
          questionType: "BINARY",
          rawText: text
        };
      }
    }
  }
  const inlineBinaryRegex = /(.*?)(?:[\:\?\-—\n]\s*)?(?:\[\s*\]|\(s*\)|\🔘|\⚪)?\s*(đúng|true|yes|có)\s*(?:\/|\||\\|\s{2,}|\svà\s|\shoặc\s)\s*(?:\[\s*\]|\(s*\)|\🔘|\⚪)?\s*(sai|false|no|không)\s*$/i;
  const inlineMatch = text.match(inlineBinaryRegex);
  if (inlineMatch && inlineMatch[1]?.trim().length >= 3) {
    const questionPart = inlineMatch[1].trim();
    const optA = inlineMatch[2].trim();
    const optB = inlineMatch[3].trim();
    return {
      question: questionPart,
      options: {
        A: optA.charAt(0).toUpperCase() + optA.slice(1).toLowerCase(),
        B: optB.charAt(0).toUpperCase() + optB.slice(1).toLowerCase()
      },
      questionType: "BINARY",
      rawText: text
    };
  }
  return null;
}
function tryParseNumberedOptions(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 3) return null;
  const numberedRegex = /^[\(\[]?([1-8])[\)\].:\-\s]\s*(.+)$/;
  let firstNumberedIdx = -1;
  const numbersFound = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(numberedRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (firstNumberedIdx === -1 && num === 1 && i > 0) {
        firstNumberedIdx = i;
      }
      if (firstNumberedIdx !== -1) {
        numbersFound.push({ num, content: match[2].trim() });
      }
    } else if (firstNumberedIdx !== -1) {
      if (numbersFound.length > 0) {
        numbersFound[numbersFound.length - 1].content += `
${lines[i]}`;
      }
    }
  }
  if (numbersFound.length >= 2 && numbersFound[0].num === 1 && numbersFound[1].num === 2) {
    const questionPart = lines.slice(0, firstNumberedIdx).join("\n").trim();
    if (questionPart.length >= 3) {
      const optionsMap = {};
      for (let i = 0; i < numbersFound.length && i < OPTION_LETTERS2.length; i++) {
        optionsMap[OPTION_LETTERS2[i]] = numbersFound[i].content;
      }
      return {
        question: questionPart,
        options: optionsMap,
        questionType: detectQuestionType(text, numbersFound.length),
        rawText: text
      };
    }
  }
  return null;
}
function tryParseRomanOptions(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 3) return null;
  const romanRegex = /^[\(\[]?(I|II|III|IV|V|VI)[\)\].:\-\s]\s*(.+)$/i;
  const romanMap = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
  let firstRomanIdx = -1;
  const romansFound = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(romanRegex);
    if (match) {
      const val = romanMap[match[1].toLowerCase()];
      if (val) {
        if (firstRomanIdx === -1 && val === 1 && i > 0) {
          firstRomanIdx = i;
        }
        if (firstRomanIdx !== -1) {
          romansFound.push({ val, content: match[2].trim() });
        }
      }
    }
  }
  if (romansFound.length >= 2 && romansFound[0].val === 1 && romansFound[1].val === 2) {
    const questionPart = lines.slice(0, firstRomanIdx).join("\n").trim();
    if (questionPart.length >= 3) {
      const optionsMap = {};
      for (let i = 0; i < romansFound.length && i < OPTION_LETTERS2.length; i++) {
        optionsMap[OPTION_LETTERS2[i]] = romansFound[i].content;
      }
      return {
        question: questionPart,
        options: optionsMap,
        questionType: detectQuestionType(text, romansFound.length),
        rawText: text
      };
    }
  }
  return null;
}
function tryParseBulletOptions(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 3) return null;
  const bulletRegex = /^([•\*\-\–\—\+▪▫☑☐🔘⚪]|\[[\sxX]?\])\s+(.+)$/;
  let firstBulletIdx = -1;
  const bulletsFound = [];
  let isCheckbox = false;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(bulletRegex);
    if (match) {
      if (firstBulletIdx === -1 && i > 0) {
        firstBulletIdx = i;
      }
      if (firstBulletIdx !== -1) {
        if (/[☑☐]|\s*\[[\sxX]?\]/.test(match[1])) {
          isCheckbox = true;
        }
        bulletsFound.push(match[2].trim());
      }
    } else if (firstBulletIdx !== -1) {
      if (bulletsFound.length > 0) {
        bulletsFound[bulletsFound.length - 1] += `
${lines[i]}`;
      }
    }
  }
  if (bulletsFound.length >= 2 && firstBulletIdx > 0) {
    const questionPart = lines.slice(0, firstBulletIdx).join("\n").trim();
    if (questionPart.length >= 3) {
      const optionsMap = {};
      for (let i = 0; i < bulletsFound.length && i < OPTION_LETTERS2.length; i++) {
        optionsMap[OPTION_LETTERS2[i]] = bulletsFound[i];
      }
      const inferredType = isCheckbox ? "MULTI_SELECT" : detectQuestionType(text, bulletsFound.length);
      return {
        question: questionPart,
        options: optionsMap,
        questionType: inferredType,
        rawText: text
      };
    }
  }
  return null;
}
function tryParsePlainLineOptions(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 3 || lines.length > 8) return null;
  const firstLine = lines[0];
  const candidateOptions = lines.slice(1);
  const isQuestionLike = /[?:]$/.test(firstLine) || /^(câu\s+\d+|bài\s+\d+|question\s+\d+|đâu\s+là|ai\s+là|khi\s+nào|tại\s+sao|như\s+thế\s+nào|cái\s+gì|hãy\s+cho\s+biết|chọn|tìm|hãy|cho|tính|xác\s+định|trong\s+các|which|what|where|when|why|how|who)/i.test(firstLine);
  if (!isQuestionLike) return null;
  const optionsValid = candidateOptions.every((opt) => opt.length > 0 && opt.length < 250 && !opt.endsWith("?"));
  if (!optionsValid) return null;
  const optionsMap = {};
  for (let i = 0; i < candidateOptions.length && i < OPTION_LETTERS2.length; i++) {
    optionsMap[OPTION_LETTERS2[i]] = candidateOptions[i];
  }
  return {
    question: firstLine,
    options: optionsMap,
    questionType: detectQuestionType(text, candidateOptions.length),
    rawText: text
  };
}
function tryParseFillInTheBlankWithoutOptions(text) {
  const hasBlank = /(?:\.{3,}|_{2,}|…|\[\s*(?:\.{2,}|_{2,}|…|\s*)\s*\]|\(\s*(?:\.{2,}|_{2,}|…|\s*)\s*\))/i.test(text);
  const hasKeyword = /(?:điền\s+(?:vào\s+chỗ\s+trống|vào\s+ô\s+trống|từ|khuyết)|chọn\s+từ\s+thích\s+hợp|fill\s+in\s+the\s+blank|complete\s+the\s+sentence)/i.test(text);
  if ((hasBlank || hasKeyword) && text.trim().length >= 10) {
    return {
      question: text.trim(),
      options: {},
      questionType: "FILL_IN_BLANK",
      rawText: text
    };
  }
  return null;
}
function isDirectQuestion(text) {
  const trimmed = text.trim();
  if (trimmed.length < 6 || trimmed.length > 800) return false;
  if (isDisqualifiedNonQuestion(trimmed)) return false;
  const prefixRegex = /^(?:câu|bài|question|task|câu\s+hỏi)\s*\d*[\.:\-]/i;
  if (prefixRegex.test(trimmed)) return true;
  if (/[?？]$/.test(trimmed)) return true;
  const viQuestionEndings = /(?:là\s+gì|như\s+thế\s+nào|bao\s+nhiêu|ở\s+đâu|khi\s+nào|mấy|nào|sao|đúng\s+không|phải\s+không)\s*[?\.:!]*$/i;
  if (viQuestionEndings.test(trimmed)) return true;
  const viStarters = /^(?:đâu\s+là|ai\s+là|khi\s+nào|tại\s+sao|như\s+thế\s+nào|cái\s+gì|hãy\s+cho\s+biết|hãy\s+tính|hãy\s+tìm|tính\s+|tìm\s+|giải\s+|xác\s+định\s+|cho\s+biết\s+|thủ\s+đô\s+|năm\s+nào|tác\s+giả\s+|nguyên\s+nhân\s+|kết\s+quả\s+|đoạn\s+mã|ý\s+nghĩa\s+của|cho\s+tam\s+giác|phương\s+trình)/i;
  if (viStarters.test(trimmed)) return true;
  const enStarters = /^(?:what|which|where|when|why|how|who|whom|whose|can|could|would|should|is|are|do|does|did|calculate|find|determine|explain|evaluate|define)\b/i;
  if (enStarters.test(trimmed)) return true;
  if (/[\d\w\)]\s*=\s*[?\.\s]*$/.test(trimmed)) return true;
  return false;
}
function parseQuestionFromText(rawText) {
  const text = normalizeText(rawText);
  if (!text || isDisqualifiedNonQuestion(text)) {
    return null;
  }
  const letterResult = tryParseLetterOptions(text);
  if (letterResult) return letterResult;
  const binaryResult = tryParseBinaryOptions(text);
  if (binaryResult) return binaryResult;
  const numberedResult = tryParseNumberedOptions(text);
  if (numberedResult) return numberedResult;
  const romanResult = tryParseRomanOptions(text);
  if (romanResult) return romanResult;
  const bulletResult = tryParseBulletOptions(text);
  if (bulletResult) return bulletResult;
  const plainResult = tryParsePlainLineOptions(text);
  if (plainResult) return plainResult;
  const fillBlankResult = tryParseFillInTheBlankWithoutOptions(text);
  if (fillBlankResult) return fillBlankResult;
  return null;
}
function detectQuestion(selectionText, selectionRange) {
  const normalized = normalizeText(selectionText);
  if (!normalized || normalized.length < 4) {
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
  if (isDirectQuestion(normalized)) {
    return {
      isValid: true,
      data: {
        question: normalized,
        options: {},
        questionType: "SHORT_ANSWER",
        rawText: normalized
      }
    };
  }
  return {
    isValid: false,
    data: null,
    reason: "Kh\xF4ng t\xECm th\u1EA5y c\xE1c ph\u01B0\u01A1ng \xE1n ho\u1EB7c m\u1EABu c\xE2u h\u1ECFi h\u1EE3p l\u1EC7"
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
    const qType = result.questionType;
    let sectionLabel = "\u0110\xC1P \xC1N CH\xCDNH X\xC1C";
    let typeBadgeHtml = "";
    if (qType === "MULTI_SELECT") {
      sectionLabel = "CH\u1ECCN NHI\u1EC0U \u0110\xC1P \xC1N";
      typeBadgeHtml = '<span class="quizlens-type-tag">Ch\u1ECDn nhi\u1EC1u</span>';
    } else if (qType === "BINARY") {
      sectionLabel = "C\xC2U H\u1ECEI \u0110\xDANG / SAI";
      typeBadgeHtml = '<span class="quizlens-type-tag">\u0110\xFAng/Sai</span>';
    } else if (qType === "FILL_IN_BLANK") {
      sectionLabel = "T\u1EEA C\u1EA6N \u0110I\u1EC0N V\xC0O CH\u1ED6 TR\u1ED0NG";
      typeBadgeHtml = '<span class="quizlens-type-tag">\u0110i\u1EC1n khuy\u1EBFt</span>';
    } else if (qType === "SHORT_ANSWER") {
      sectionLabel = "\u0110\xC1P \xC1N NG\u1EAEN G\u1ECCN";
      typeBadgeHtml = '<span class="quizlens-type-tag">Tr\u1EA3 l\u1EDDi nhanh</span>';
    }
    const answerStr = (result.answer || "").trim();
    const isShortBadge = answerStr.length > 0 && answerStr.length <= 6;
    const badgeText = isShortBadge ? answerStr : "\u2713";
    if (autoCopy && answerStr) {
      const copyVal = isShortBadge && result.answerText ? `${answerStr}. ${result.answerText}` : answerStr || result.answerText || "";
      navigator.clipboard?.writeText(copyVal).catch(() => {
      });
    }
    this.currentAnswerText = isShortBadge && result.answerText ? `${answerStr}. ${result.answerText}` : answerStr || result.answerText || "";
    const confidencePercent = Math.round((result.confidence || 0.95) * 100);
    const showExplanation = Boolean(result.answerText && result.answerText.trim() !== answerStr);
    this.popupEl.innerHTML = `
      <div class="quizlens-header">
        <div class="quizlens-brand">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          QuizLens AI
          ${typeBadgeHtml}
        </div>
        <button class="quizlens-close-btn" title="\u0110\xF3ng">&times;</button>
      </div>
      <div class="quizlens-body">
        <div class="quizlens-result">
          <div class="quizlens-section-label">${sectionLabel}</div>
          <div class="quizlens-answer-row">
            <div class="quizlens-letter-badge ${isShortBadge ? "" : "quizlens-badge-icon"}">${badgeText}</div>
            <div class="quizlens-answer-content">
              ${!isShortBadge && answerStr ? `<div class="quizlens-prominent-word">${this.escapeHtml(answerStr)}</div>` : ""}
              ${showExplanation ? `<div class="quizlens-answer-text">${this.escapeHtml(result.answerText)}</div>` : isShortBadge && result.answerText ? `<div class="quizlens-answer-text">${this.escapeHtml(result.answerText)}</div>` : ""}
            </div>
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
      if (answerResult.status === "SUCCESS" && (answerResult.answer || answerResult.answerText)) {
        if (!answerResult.questionType && detection.data.questionType) {
          answerResult.questionType = detection.data.questionType;
        }
        this.popup.showResult(answerResult, rect, this.settings.autoCopy);
      } else {
        this.popup.showUnknown(rect, "AI kh\xF4ng t\xECm \u0111\u01B0\u1EE3c \u0111\xE1p \xE1n ch\u1EAFc ch\u1EAFn cho c\xE2u h\u1ECFi n\xE0y.");
      }
    } catch (error) {
      this.isProcessing = false;
      let message = error?.message || "L\u1ED7i k\u1EBFt n\u1ED1i \u0111\u1EBFn Backend ho\u1EB7c AI Provider.";
      if (message.includes("Extension context invalidated") || typeof chrome !== "undefined" && !chrome.runtime?.id) {
        message = "Ti\u1EC7n \xEDch v\u1EEBa \u0111\u01B0\u1EE3c n\u1EA1p l\u1EA1i phi\xEAn b\u1EA3n m\u1EDBi. Vui l\xF2ng b\u1EA5m F5 (T\u1EA3i l\u1EA1i trang web n\xE0y) \u0111\u1EC3 ti\u1EBFp t\u1EE5c gi\u1EA3i \u0111\u1EC1!";
      }
      this.popup.showError(message, rect);
    }
  }
  requestAnswer(questionData) {
    return new Promise((resolve, reject) => {
      try {
        if (typeof chrome === "undefined" || !chrome.runtime?.id || !chrome.runtime?.sendMessage) {
          reject(new Error("Ti\u1EC7n \xEDch v\u1EEBa \u0111\u01B0\u1EE3c n\u1EA1p l\u1EA1i phi\xEAn b\u1EA3n m\u1EDBi. Vui l\xF2ng b\u1EA5m F5 (T\u1EA3i l\u1EA1i trang web n\xE0y) \u0111\u1EC3 ti\u1EBFp t\u1EE5c gi\u1EA3i \u0111\u1EC1!"));
          return;
        }
        chrome.runtime.sendMessage(
          {
            type: "ANALYZE_QUESTION",
            payload: {
              question: questionData.question,
              options: questionData.options,
              questionType: questionData.questionType
            }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError.message || "";
              if (errMsg.includes("Extension context invalidated")) {
                reject(new Error("Ti\u1EC7n \xEDch v\u1EEBa \u0111\u01B0\u1EE3c n\u1EA1p l\u1EA1i phi\xEAn b\u1EA3n m\u1EDBi. Vui l\xF2ng b\u1EA5m F5 (T\u1EA3i l\u1EA1i trang web n\xE0y) \u0111\u1EC3 ti\u1EBFp t\u1EE5c gi\u1EA3i \u0111\u1EC1!"));
              } else {
                reject(new Error(errMsg || "L\u1ED7i g\u1EEDi tin nh\u1EAFn n\u1ED9i b\u1ED9"));
              }
              return;
            }
            if (!response || !response.success) {
              reject(new Error(response?.error || "L\u1ED7i t\u1EEB m\xE1y ch\u1EE7 QuizLens AI"));
              return;
            }
            resolve(response.data);
          }
        );
      } catch (err) {
        if (err?.message?.includes("Extension context invalidated")) {
          reject(new Error("Ti\u1EC7n \xEDch v\u1EEBa \u0111\u01B0\u1EE3c n\u1EA1p l\u1EA1i phi\xEAn b\u1EA3n m\u1EDBi. Vui l\xF2ng b\u1EA5m F5 (T\u1EA3i l\u1EA1i trang web n\xE0y) \u0111\u1EC3 ti\u1EBFp t\u1EE5c gi\u1EA3i \u0111\u1EC1!"));
        } else {
          reject(err);
        }
      }
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
