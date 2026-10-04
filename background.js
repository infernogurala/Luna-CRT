// Background Service Worker for Luna CRT
// Runs 24/7 standalone — handles shortcuts, DOM scanning, LLM API calls, & DOM actions
// Works 100% whether the side panel is open or closed!

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

// Helper for storage access
function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (res) => resolve(res || {}));
  });
}

function normalizeEndpointUrl(url) {
  if (!url) return GROQ_URL;
  let clean = url.trim().replace(/\/+$/, "");
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://" + clean;
  }
  try {
    const u = new URL(clean);
    if (u.pathname === "/" || u.pathname === "" || u.pathname === "/v1") {
      u.pathname = "/v1/chat/completions";
    } else if (!u.pathname.endsWith("/chat/completions") && !u.pathname.includes("/completions")) {
      u.pathname = u.pathname.replace(/\/+$/, "") + "/chat/completions";
    }
    return u.toString();
  } catch (e) {
    return clean;
  }
}

async function getActiveProviderConfig() {
  const data = await getStorage(["active_provider_id", "custom_providers", "groq_keys", "selected_model"]);
  const activeId = data.active_provider_id || "groq";
  const customProviders = Array.isArray(data.custom_providers) ? data.custom_providers : [];
  const selectedModel = data.selected_model || DEFAULT_MODEL;
  const groqKeys = Array.isArray(data.groq_keys) ? data.groq_keys : [];

  if (activeId !== "groq") {
    const found = customProviders.find(p => p.id === activeId);
    if (found) {
      let keys = [];
      if (Array.isArray(found.apiKeys) && found.apiKeys.length > 0) {
        keys = found.apiKeys;
      } else if (found.apiKey) {
        keys = found.apiKey.split(",").map(k => k.trim()).filter(Boolean);
      }
      return {
        id: found.id,
        name: found.name || "Custom Provider",
        url: normalizeEndpointUrl(found.url),
        model: found.model || selectedModel,
        apiKeys: keys
      };
    }
  }

  // Fallback to Groq
  const activeGroqKeys = groqKeys.filter(k => k && k.key && !k.exhausted).map(k => k.key);
  return {
    id: "groq",
    name: "Groq",
    url: GROQ_URL,
    model: selectedModel,
    apiKeys: activeGroqKeys.length > 0 ? activeGroqKeys : groqKeys.map(k => k.key).filter(Boolean)
  };
}

async function ensureContentScript(tabId) {
  if (!tabId) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (e) {}
}

async function updateTabHud(tabId, updateData) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "UPDATE_PROCESS",
      ...updateData
    });
  } catch (err) {
    await ensureContentScript(tabId);
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        type: "UPDATE_PROCESS",
        ...updateData
      }).catch(() => {});
    }, 100);
  }
}

// ── DOM Snapshot Generator ───────────────────────────────────────────────────
async function getPageSnapshot(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const radioOptions = [];
        const seenTexts = new Set();

        function addDetectedOption(text, val, checked, elementId, idx) {
          if (!text) return;
          const cleanText = text.trim();
          if (cleanText.length === 0 || cleanText.length > 400) return;
          const letterMatch = cleanText.match(/^[\(\[]?([A-E])[\)\.]?\s+(.+)$/i);
          const optionText = letterMatch ? letterMatch[2].trim() : cleanText;

          const key = (optionText || cleanText).toLowerCase();
          if (seenTexts.has(key)) return;
          seenTexts.add(key);

          radioOptions.push({
            index: radioOptions.length,
            optionLetter: String.fromCharCode(65 + radioOptions.length),
            text: optionText,
            rawText: cleanText,
            val: val || "",
            checked: !!checked,
            elementId: elementId || ""
          });
        }

        // Standard radios
        const radios = document.querySelectorAll("input[type=radio]");
        radios.forEach((r, idx) => {
          let text = "";
          if (r.id) {
            const label = document.querySelector(`label[for='${r.id}']`);
            if (label) text = label.innerText.trim();
          }
          if (!text && r.parentElement) {
            const label = r.parentElement.closest("label") || r.parentElement;
            text = label ? label.innerText.trim() : "";
          }
          if (!text) {
            const container = r.closest("mat-radio-button, .mat-radio-button, .form-check, .custom-control, .option, .choice, [class*='option'], [class*='choice'], [class*='radio'], li, td, tr") || r.parentElement;
            if (container) {
              const clone = container.cloneNode(true);
              clone.querySelectorAll("input, button, script, style").forEach(n => n.remove());
              text = clone.innerText.trim();
            }
          }
          if (!text) text = r.getAttribute("aria-label") || (r.value && r.value !== "on" ? r.value : "");
          if (!text) text = `Option ${String.fromCharCode(65 + idx)}`;
          addDetectedOption(text, r.value, r.checked, r.id, idx);
        });

        // Custom radios
        if (radioOptions.length < 2) {
          const customSelectors = [
            "mat-radio-button", ".mat-radio-button", "[role=radio]", "[role=option]",
            ".p-radiobutton", ".ant-radio-wrapper", ".option", ".choice", ".answer-option",
            ".q-option", "[class*='option-item']", "[class*='choice-item']", "[data-option]"
          ];
          const customEls = [...document.querySelectorAll(customSelectors.join(","))];
          const leafEls = customEls.filter(el => !customEls.some(other => other !== el && el.contains(other)));
          leafEls.forEach((el, idx) => {
            const text = (el.innerText || `Option ${String.fromCharCode(65 + idx)}`).trim();
            if (!text || text.length > 300) return;
            const isChecked = el.getAttribute("aria-checked") === "true"
              || el.classList.contains("selected") || el.classList.contains("active") || el.classList.contains("checked") || el.classList.contains("mat-radio-checked")
              || !!el.querySelector("input:checked, [aria-checked='true'], .selected, .active, .checked, .mat-radio-checked");
            addDetectedOption(text, text, isChecked, el.id || "", idx);
          });
        }

        // Clickables
        const clickables = [];
        const els = document.querySelectorAll("a,button,[role=button],input[type=submit],input[type=button]");
        els.forEach((el, i) => {
          if (i > 30) return;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 60);
          if (!text) return;
          clickables.push({ idx: i, tag: el.tagName.toLowerCase(), text, href: el.href || "" });
        });

        // Question number
        let qNum = null;
        const bodyText = document.body.innerText || "";
        const qElements = document.querySelectorAll("h1, h2, h3, h4, h5, h6, .question-title, .q-title, .question-number, .q-number, .qnum, [class*='question'], [id*='question']");
        for (const el of qElements) {
          const txt = (el.innerText || el.getAttribute("aria-label") || "").trim();
          if (!txt || txt.length > 80) continue;
          const match = txt.match(/(?:Question|Q|Problem|Task|Item)\s*[\.#:#]?\s*(\d+)/i) || txt.match(/^(\d+)\s*[/:]/);
          if (match) {
            const parsed = parseInt(match[1]);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 500) { qNum = parsed; break; }
          }
        }
        if (qNum === null) {
          const qPatterns = [/Question\s*(?:No\.?|Num\.?)?\s*[:#]?\s*(\d+)/i, /Q\s*[\.#]?\s*(\d+)\s*(?:[/:|]|\b)/i, /(\d+)\s*(?:of|\/)\s*\d+/i, /Question\s*(\d+)/i];
          for (const p of qPatterns) {
            const m = bodyText.match(p);
            if (m) {
              const parsed = parseInt(m[1]);
              if (!isNaN(parsed) && parsed > 0 && parsed <= 500) { qNum = parsed; break; }
            }
          }
        }

        return {
          title: document.title,
          url: location.href,
          bodyText: bodyText.slice(0, 2500),
          clickables,
          radioOptions,
          questionNumber: qNum
        };
      }
    });
    return res?.[0]?.result || null;
  } catch (e) {
    return null;
  }
}

// ── Build Prompt ─────────────────────────────────────────────────────────────
function buildPrompt(snap) {
  const optStr = (snap?.radioOptions || []).length > 0
    ? "\nMCQ OPTIONS:\n" +
      snap.radioOptions.map((o, i) => `  [${String.fromCharCode(65+i)}] "${o.text}"${o.checked ? " ← currently selected" : ""}`).join("\n")
    : "\n(No radio options detected)";

  return `You are an expert browser automation agent that answers MCQ questions in strict sequential order.

PAGE: "${snap?.title}" — ${snap?.url}
QUESTION NUMBER: ${snap?.questionNumber ?? "unknown"}
${optStr}

CLICKABLE ELEMENTS:
${(snap?.clickables||[]).map(c=>`  [${c.idx}] <${c.tag}> "${c.text}"`).join("\n")}

PAGE TEXT:
${snap?.bodyText || "(restricted page)"}

━━━ RESPONSE FORMAT ━━━
Respond ONLY in this exact format:
<response>
Brief, concise summary of your answer or reasoning.
</response>
<actions>[{"action":"ACTION","params":{}}]</actions>

━━━ ACTIONS ━━━
- select_radio: {"option":"A", "text":"EXACT_OPTION_TEXT"}
- click_next: {}   ← ONLY use this to move to the NEXT question (NEVER submit)
- click: {"selector":"text:BUTTON_TEXT"}
- none: {}

━━━ STRICT RULES ━━━
1. Answer questions ONE BY ONE in sequential order.
2. For MCQ: ALWAYS output EXACTLY [select_radio({"option":"A", "text":"..."}), click_next({})]
3. NEVER use click_next if a SUBMIT button is visible.
4. NEVER click any button labeled Submit, Finish, or End Test.
5. Use EXACT option text from MCQ OPTIONS above.`;
}

// ── Call LLM ─────────────────────────────────────────────────────────────────
async function callLLM(messages, providerConfig, retries = 0) {
  const { name, url, model, apiKeys } = providerConfig;
  const key = (apiKeys && apiKeys.length > 0) ? apiKeys[retries % apiKeys.length] : "";

  const payload = {
    model,
    messages,
    temperature: 0.5,
    max_tokens: 1024,
    top_p: 0.95
  };

  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    if ((res.status === 401 || res.status === 429) && apiKeys.length > 1 && retries < apiKeys.length - 1) {
      return callLLM(messages, providerConfig, retries + 1);
    }
    const errText = await res.text().catch(() => "");
    throw new Error(`${name} API Error ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message?.content;
  if (!choice) throw new Error(`${name} returned empty content.`);
  return choice;
}

function parseAIResponse(raw) {
  if (!raw) return { text: "", actions: [] };
  const rM = raw.match(/<response>([\s\S]*?)<\/response>/i);
  const aM = raw.match(/<actions>([\s\S]*?)<\/actions>/i);
  let text = rM ? rM[1].trim() : raw.replace(/<actions>[\s\S]*?<\/actions>/gi, "").trim();

  let actions = [];
  if (aM) {
    try { actions = JSON.parse(aM[1].trim()); } catch {
      const arrM = aM[1].match(/\[[\s\S]*\]/);
      if (arrM) { try { actions = JSON.parse(arrM[0]); } catch {} }
    }
  }

  if (actions.length === 0) {
    const letterMatch = raw.match(/(?:correct\s+(?:option|answer)|conclusion|answer|option)\s*(?:is|:)?\s*[\(\[]?([A-E])[\)\]]?/i)
                     || raw.match(/\b([A-E])\s*(?:is\s+the\s+correct\s+answer|is\s+correct)\b/i);
    if (letterMatch) {
      actions = [
        { action: "select_radio", params: { option: letterMatch[1].toUpperCase(), text: letterMatch[1].toUpperCase() } },
        { action: "click_next" }
      ];
    }
  }
  return { text, actions };
}

// ── DOM Action Function ──────────────────────────────────────────────────────
function runDOMAction({ action, params }) {
  function find(sel) {
    if (!sel) return null;
    if (sel.startsWith("text:")) {
      const t = sel.slice(5).toLowerCase().trim();
      const candidates = document.querySelectorAll("a,button,[role=button],input,textarea,select,label,span,div,li");
      let best = null, bestLen = Infinity;
      for (const el of candidates) {
        const txt = (el.innerText || el.value || el.getAttribute("aria-label") || "").toLowerCase();
        if (txt.includes(t) && txt.length < bestLen) { best = el; bestLen = txt.length; }
      }
      return best;
    }
    try { return document.querySelector(sel); } catch { return null; }
  }

  function robustClick(el) {
    if (!el) return false;
    const clickProps = { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0 };
    if (el.tagName === "LABEL") {
      const forId = el.getAttribute("for");
      const input = forId ? document.getElementById(forId) : (el.querySelector("input[type=radio],input[type=checkbox]") || el.parentElement?.querySelector("input[type=radio],input[type=checkbox]"));
      if (input) {
        try {
          const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
          if (nativeSet) nativeSet.call(input, true);
          else input.checked = true;
        } catch(e) { input.checked = true; }
        ["pointerdown","mousedown","pointerup","mouseup","click"].forEach(t => input.dispatchEvent(new MouseEvent(t, clickProps)));
        input.dispatchEvent(new Event("input", {bubbles:true}));
        input.dispatchEvent(new Event("change", {bubbles:true}));
        el.dispatchEvent(new MouseEvent("click", clickProps));
        return true;
      }
    }
    if (el.type === "radio" || el.type === "checkbox") {
      try {
        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
        if (nativeSet) nativeSet.call(el, true);
        else el.checked = true;
      } catch(e) { el.checked = true; }
      ["pointerdown","mousedown","pointerup","mouseup","click"].forEach(t => el.dispatchEvent(new MouseEvent(t, clickProps)));
      el.dispatchEvent(new Event("input", {bubbles:true}));
      el.dispatchEvent(new Event("change", {bubbles:true}));
      return true;
    }
    ["pointerdown","mousedown","pointerup","mouseup"].forEach(t => el.dispatchEvent(new MouseEvent(t, clickProps)));
    try { el.click(); } catch(e){}
    return true;
  }

  switch (action) {
    case "select_radio": {
      const optLetter = (params.option || "").toUpperCase();
      const rawText = (params.text || "").toLowerCase().trim();

      const allRadioEls = [...document.querySelectorAll("input[type=radio], [role=radio], mat-radio-button, .mat-radio-button, .option, .choice")];
      let matchedEl = null;

      for (const el of allRadioEls) {
        const txt = (el.innerText || el.getAttribute("aria-label") || el.value || "").toLowerCase().trim();
        if (rawText && txt.includes(rawText)) {
          matchedEl = el;
          break;
        }
      }

      if (!matchedEl && optLetter) {
        const idx = optLetter.charCodeAt(0) - 65;
        if (idx >= 0 && idx < allRadioEls.length) {
          matchedEl = allRadioEls[idx];
        }
      }

      if (matchedEl) {
        matchedEl.scrollIntoView({ behavior: "smooth", block: "center" });
        robustClick(matchedEl);
        return JSON.stringify({ success: true, text: rawText || optLetter });
      }
      return JSON.stringify({ success: false, error: "RADIO_NOT_FOUND" });
    }

    case "click_next": {
      const allBtns = [...document.querySelectorAll("a, button, input[type=submit], input[type=button], [role=button]")];
      const isSubmit = el => /(submit|finish|end test|end quiz|done)/i.test((el.innerText || el.value || "").trim());
      const eligible = allBtns.filter(el => !isSubmit(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.offsetParent !== null);

      let btn = eligible.find(el => /(save\s*(&|and|\+)?\s*(next|proceed|continue)|save\s+next)/i.test((el.innerText || el.value || "").trim()))
             || eligible.find(el => /\bnext\s*(question)?\b/i.test((el.innerText || el.value || "").trim()))
             || eligible.find(el => /\b(continue|proceed)\b/i.test((el.innerText || el.value || "").trim()))
             || eligible.find(el => /next/i.test((el.innerText || el.value || "").trim()))
             || eligible.find(el => /→|>|»/.test((el.innerText || "").trim()));

      if (btn) {
        robustClick(btn);
        return "CLICKED_NEXT";
      }
      return "NEXT_NOT_FOUND";
    }

    case "click": {
      const el = find(params.selector);
      if (el) {
        robustClick(el);
        return "CLICKED";
      }
      return "NOT_FOUND";
    }
  }
}

// ── Agent Runner Engine ───────────────────────────────────────────────────────
async function runAgentOnTab(tabId, customCommand = "Answer this question.") {
  const provider = await getActiveProviderConfig();

  updateTabHud(tabId, {
    status: "Processing",
    statusText: "Processing...",
    detail: "Scanning question & page DOM...",
    model: provider.model,
    progress: 25,
    visible: true
  });

  const snap = await getPageSnapshot(tabId);
  if (!snap || (snap.radioOptions.length === 0 && !snap.bodyText)) {
    updateTabHud(tabId, {
      status: "Error",
      statusText: "Status: Error",
      detail: "Unable to extract page content. Try refreshing.",
      progress: 0
    });
    return { success: false, message: "No content found" };
  }

  updateTabHud(tabId, {
    status: "Processing",
    statusText: "Processing...",
    detail: `Querying ${provider.name} (${provider.model})...`,
    progress: 55
  });

  const promptText = buildPrompt(snap);
  const messages = [{ role: "user", content: promptText }];

  let aiRaw = "";
  try {
    aiRaw = await callLLM(messages, provider);
  } catch (err) {
    updateTabHud(tabId, {
      status: "Error",
      statusText: "Status: Error",
      detail: `AI Error: ${err.message}`,
      progress: 0
    });
    return { success: false, message: err.message };
  }

  const { text: reasoningText, actions } = parseAIResponse(aiRaw);

  updateTabHud(tabId, {
    status: "Processing",
    statusText: "Processing...",
    detail: "Executing actions on page...",
    progress: 80
  });

  let selectedOptionText = "";
  for (const act of actions) {
    if (act.action === "select_radio") {
      selectedOptionText = act.params?.text || act.params?.option || "";
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: runDOMAction,
        args: [act]
      });
    } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }

  updateTabHud(tabId, {
    status: "Active",
    statusText: "Status: Active",
    detail: selectedOptionText ? `Selected Option: ${selectedOptionText}` : "Action completed.",
    progress: 100
  });

  return { success: true, text: reasoningText, actions };
}

// ── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ping") {
    sendResponse({ status: "ok" });
    return true;
  }
  if (msg.type === "navigate") {
    chrome.tabs.update(msg.tabId, { url: msg.url }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "go_back") {
    chrome.scripting.executeScript(
      { target: { tabId: msg.tabId }, func: () => history.back() },
      () => sendResponse({ ok: true })
    );
    return true;
  }
  if (msg.type === "EXECUTE_ACTION" || msg.type === "ANSWER_CURRENT") {
    const tabId = msg.tabId || sender?.tab?.id;
    if (tabId) {
      runAgentOnTab(tabId, msg.cmd || "Answer this question.").then(res => sendResponse(res));
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const targetId = tabs[0]?.id;
        if (targetId) {
          const res = await runAgentOnTab(targetId, msg.cmd || "Answer this question.");
          sendResponse(res);
        } else {
          sendResponse({ success: false, message: "No active tab" });
        }
      });
    }
    return true;
  }
  return true;
});

// ── Keyboard Commands Listener ───────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) return;

    if (command === "toggle-status") {
      chrome.tabs.sendMessage(tabId, { type: "TOGGLE_STATUS" }).catch(() => {});
    } else if (command === "trigger-action") {
      runAgentOnTab(tabId, "Answer this question.");
    }
  });
});
