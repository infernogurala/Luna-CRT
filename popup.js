const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "llama-3.3-70b-versatile";

// ── Elements ──────────────────────────────────────────────────────────────────
const logArea    = document.getElementById("logArea");
const logEmpty   = document.getElementById("logEmpty");
const cmdInput   = document.getElementById("cmdInput");
const sendBtn    = document.getElementById("sendBtn");
const thinking   = document.getElementById("thinking");
const clearBtn   = document.getElementById("clearBtn");
let currentFullUrl = "";

function updatePageUrlDisplay(url) {
  currentFullUrl = url || "";
  const pageBar = document.getElementById("pageBar");
  const pageDomain = document.getElementById("pageDomain");
  const pagePath = document.getElementById("pagePath");
  const pagePathSep = document.getElementById("pagePathSep");
  const pageSecBadge = document.getElementById("pageSecBadge");
  const pageSecIcon = document.getElementById("pageSecIcon");

  if (!url) {
    if (pageDomain) pageDomain.textContent = "No active page";
    if (pagePath) pagePath.style.display = "none";
    if (pagePathSep) pagePathSep.style.display = "none";
    if (pageBar) pageBar.title = "";
    return;
  }

  if (pageBar) pageBar.title = `${url}\n(Click to copy URL)`;

  try {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    
    if (pageSecBadge) {
      pageSecBadge.className = `page-sec-badge ${isHttps ? "secure" : "insecure"}`;
    }
    if (pageSecIcon) {
      pageSecIcon.textContent = isHttps ? "lock" : (urlObj.protocol.startsWith("chrome") ? "extension" : "public");
    }

    let domain = urlObj.hostname.replace(/^www\./, "");
    if (!domain) {
      domain = urlObj.protocol.replace(":", "");
    }

    const rawSegments = urlObj.pathname.split("/").filter(s => s.trim().length > 0);
    // Ignore long hex hashes / GUIDs (> 16 chars)
    const cleanSegments = rawSegments.filter(s => !/^[a-f0-9-]{16,}$/i.test(s));

    let pathText = "";
    if (cleanSegments.length > 0) {
      pathText = cleanSegments.slice(0, 2).join(" / ");
    } else if (rawSegments.length > 0) {
      const first = rawSegments[0];
      pathText = first.length > 12 ? first.slice(0, 6) + "..." : first;
    }

    if (pageDomain) pageDomain.textContent = domain;

    if (pathText) {
      if (pagePath) {
        pagePath.textContent = pathText;
        pagePath.style.display = "inline-block";
      }
      if (pagePathSep) pagePathSep.style.display = "inline-block";
    } else {
      if (pagePath) pagePath.style.display = "none";
      if (pagePathSep) pagePathSep.style.display = "none";
    }
  } catch (e) {
    if (pageDomain) pageDomain.textContent = url;
    if (pagePath) pagePath.style.display = "none";
    if (pagePathSep) pagePathSep.style.display = "none";
  }
}

// Keys Modal Elements
const keysToggleBtn        = document.getElementById("keysToggleBtn");
const keysBadge            = document.getElementById("keysBadge");
const keysModalOverlay     = document.getElementById("keysModalOverlay");
const closeKeysModalBtn    = document.getElementById("closeKeysModalBtn");
const modalKeysCountTag    = document.getElementById("modalKeysCountTag");
const newKeyInput          = document.getElementById("newKeyInput");
const addKeyBtn            = document.getElementById("addKeyBtn");
const addKeyFeedback       = document.getElementById("addKeyFeedback");
const resetExhaustedBtn    = document.getElementById("resetExhaustedBtn");
const clearAllKeysBtn      = document.getElementById("clearAllKeysBtn");
const keysListContainer    = document.getElementById("keysListContainer");
const importKeysBtn        = document.getElementById("importKeysBtn");
const importKeysBtnToolbar = document.getElementById("importKeysBtnToolbar");
const importKeysInput      = document.getElementById("importKeysInput");


// ── Key rotation & management state ──────────────────────────────────────────
let apiKeys = [];
let currentKeyIdx = 0;
const unmaskedKeyIndices = new Set();

async function loadKeys() {
  try {
    const res = await chrome.storage.local.get(["groq_api_keys"]);
    if (res && Array.isArray(res.groq_api_keys) && res.groq_api_keys.length > 0) {
      const validKeys = res.groq_api_keys
        .map(k => (typeof k === "string" ? k.trim() : ""))
        .filter(Boolean);
      apiKeys = validKeys.map(k => ({ key: k, exhausted: false }));
    } else {
      apiKeys = [];
    }
  } catch (e) {
    apiKeys = [];
  }
  updateKeysUI();
}

async function saveKeysToStorage() {
  const keyStrings = apiKeys.map(k => k.key);
  try {
    await chrome.storage.local.set({ groq_api_keys: keyStrings });
  } catch (e) {
    console.error("Failed to save keys to chrome.storage:", e);
  }
}

function updateKeysUI() {
  const total = apiKeys.length;
  const activeCount = apiKeys.filter(k => !k.exhausted).length;
  
  if (keysBadge) keysBadge.textContent = String(total);
  if (modalKeysCountTag) modalKeysCountTag.textContent = `${activeCount} / ${total} active`;
  
  renderKeysList();
}

function maskKey(keyStr) {
  if (!keyStr) return "";
  if (keyStr.length <= 12) return keyStr.slice(0, 4) + "...";
  return keyStr.slice(0, 8) + "..." + keyStr.slice(-6);
}

function renderKeysList() {
  if (!keysListContainer) return;
  keysListContainer.innerHTML = "";

  if (apiKeys.length === 0) {
    keysListContainer.innerHTML = `
      <div class="keys-empty">
        <span class="material-symbols-rounded" style="font-size: 32px; opacity:0.5; display:block; margin-bottom: 8px;">vpn_key_off</span>
        <div>No API keys present. Add a Groq API key manually or import from a .txt file.</div>
      </div>
    `;
    return;
  }

  apiKeys.forEach((item, idx) => {
    const isCurrent = (idx === currentKeyIdx && apiKeys.length > 0);
    const isUnmasked = unmaskedKeyIndices.has(idx);

    const div = document.createElement("div");
    div.className = `key-item ${isCurrent ? 'current-active' : ''}`;

    const statusBadge = item.exhausted
      ? `<span class="key-status-badge exhausted">Exhausted</span>`
      : isCurrent
      ? `<span class="key-status-badge current">Active</span>`
      : `<span class="key-status-badge active">Ready</span>`;

    const displayKey = isUnmasked ? item.key : maskKey(item.key);

    div.innerHTML = `
      <div class="key-info">
        <div class="key-header-line">
          <span class="key-index">Key #${idx + 1}</span>
          ${statusBadge}
        </div>
        <div class="key-value-row">
          <span class="key-value-text">${escapeHtml(displayKey)}</span>
        </div>
      </div>
      <div class="key-actions">
        <button class="icon-action-btn toggle-mask-btn" data-idx="${idx}" title="${isUnmasked ? 'Mask Key' : 'Show Key'}">
          <span class="material-symbols-rounded" style="font-size:18px;">${isUnmasked ? 'visibility_off' : 'visibility'}</span>
        </button>
        <button class="icon-action-btn delete-btn" data-idx="${idx}" title="Remove Key">
          <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
        </button>
      </div>
    `;

    const toggleBtn = div.querySelector(".toggle-mask-btn");
    toggleBtn.addEventListener("click", () => {
      if (unmaskedKeyIndices.has(idx)) {
        unmaskedKeyIndices.delete(idx);
      } else {
        unmaskedKeyIndices.add(idx);
      }
      renderKeysList();
    });

    const deleteBtn = div.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", async () => {
      await removeKey(idx);
    });

    keysListContainer.appendChild(div);
  });
}

async function addKey(rawInput) {
  if (addKeyFeedback) {
    addKeyFeedback.textContent = "";
    addKeyFeedback.className = "feedback-msg";
  }

  if (!rawInput || !rawInput.trim()) {
    if (addKeyFeedback) {
      addKeyFeedback.textContent = "Please enter or select valid API key(s).";
      addKeyFeedback.className = "feedback-msg error";
    }
    return;
  }

  const lines = rawInput
    .split(/[\r\n,;]+/)
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);

  let addedCount = 0;
  let dupCount = 0;

  for (const k of lines) {
    if (apiKeys.some(existing => existing.key === k)) {
      dupCount++;
      continue;
    }
    apiKeys.push({ key: k, exhausted: false });
    addedCount++;
  }

  if (addedCount > 0) {
    await saveKeysToStorage();
    updateKeysUI();
    if (newKeyInput) newKeyInput.value = "";
    if (addKeyFeedback) {
      addKeyFeedback.textContent = `Successfully added ${addedCount} key(s)${dupCount > 0 ? ` (${dupCount} duplicate skipped)` : ''}!`;
      addKeyFeedback.className = "feedback-msg success";
    }
    addLog("info", "keys", `Added ${addedCount} new API key(s). Total keys: ${apiKeys.length}`);
  } else if (dupCount > 0) {
    if (addKeyFeedback) {
      addKeyFeedback.textContent = "Key(s) already exist in your list.";
      addKeyFeedback.className = "feedback-msg error";
    }
  } else {
    if (addKeyFeedback) {
      addKeyFeedback.textContent = "No valid API keys found.";
      addKeyFeedback.className = "feedback-msg error";
    }
  }
}

function handleFileImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const text = event.target?.result;
    if (typeof text === "string") {
      await addKey(text);
    }
    e.target.value = "";
  };
  reader.onerror = () => {
    if (addKeyFeedback) {
      addKeyFeedback.textContent = "Error reading text file.";
      addKeyFeedback.className = "feedback-msg error";
    }
    e.target.value = "";
  };
  reader.readAsText(file);
}

async function removeKey(index) {
  if (index < 0 || index >= apiKeys.length) return;
  apiKeys.splice(index, 1);
  unmaskedKeyIndices.delete(index);
  
  if (currentKeyIdx >= apiKeys.length) {
    currentKeyIdx = Math.max(0, apiKeys.length - 1);
  }

  await saveKeysToStorage();
  updateKeysUI();
  addLog("info", "keys", `Removed key #${index + 1}. Total keys: ${apiKeys.length}`);
}

async function clearAllKeys() {
  if (apiKeys.length === 0) return;
  if (!confirm("Are you sure you want to remove all API keys?")) return;

  apiKeys = [];
  currentKeyIdx = 0;
  unmaskedKeyIndices.clear();
  await saveKeysToStorage();
  updateKeysUI();
  addLog("info", "keys", "All API keys removed.");
}

async function resetExhaustedKeys() {
  apiKeys.forEach(k => k.exhausted = false);
  currentKeyIdx = 0;
  updateKeysUI();
  addLog("info", "keys", "Reset exhaustion status for all keys.");
}

function getActiveKey() {
  if (apiKeys.length === 0) return null;
  for (let i = 0; i < apiKeys.length; i++) {
    const idx = (currentKeyIdx + i) % apiKeys.length;
    if (!apiKeys[idx].exhausted) { currentKeyIdx = idx; updateKeysUI(); return apiKeys[idx].key; }
  }
  addLog("info","keys","All keys exhausted — resetting...");
  apiKeys.forEach(k => k.exhausted = false);
  currentKeyIdx = 0;
  updateKeysUI();
  return apiKeys[0]?.key || null;
}

function markKeyExhausted() {
  if (apiKeys.length === 0) return;
  apiKeys[currentKeyIdx].exhausted = true;
  addLog("info","keys",`Key ${currentKeyIdx+1} exhausted → trying next key...`);
  for (let i = 1; i <= apiKeys.length; i++) {
    const next = (currentKeyIdx + i) % apiKeys.length;
    if (!apiKeys[next].exhausted) { currentKeyIdx = next; break; }
  }
  updateKeysUI();
}

// ── Logging ───────────────────────────────────────────────────────────────────
function addLog(type, label, message) {
  logEmpty.style.display = "none";
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<div class="log-dot"></div><div class="log-content"><div class="log-label">${label}</div>${escapeHtml(message)}</div>`;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function addAnswerCard(optionText, isSuccess = true) {
  if (!optionText) return;
  logEmpty.style.display = "none";

  const entry = document.createElement("div");
  entry.className = "log-entry answer-card";

  const statusHtml = isSuccess
    ? `<span class="answer-status-tag success"><span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> Auto-selected</span>`
    : `<span class="answer-status-tag warning"><span class="material-symbols-rounded" style="font-size:14px;">warning</span> Selection unconfirmed</span>`;

  entry.innerHTML = `
    <div class="answer-card-header">
      <span class="material-symbols-rounded answer-card-icon">task_alt</span>
      <span>Recommended Answer</span>
    </div>
    <div class="answer-option-text">${escapeHtml(optionText)}</div>
    <div class="answer-card-footer">
      ${statusHtml}
      <button class="manual-select-btn" data-text="${escapeHtml(optionText)}">
        <span class="material-symbols-rounded" style="font-size:15px;">touch_app</span> Select on Page
      </button>
    </div>
  `;

  const btn = entry.querySelector(".manual-select-btn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const tab = await getCurrentTab();
    if (tab?.id) {
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runAction,
        args: [{ action: "select_radio", params: { text: optionText } }]
      });
      const resultMsg = res?.[0]?.result || "";
      const statusTag = entry.querySelector(".answer-status-tag");
      if (statusTag) {
        if (resultMsg.includes("NOT_FOUND")) {
          statusTag.className = "answer-status-tag warning";
          statusTag.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">warning</span> Option not found`;
        } else {
          statusTag.className = "answer-status-tag success";
          statusTag.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> Selected ✓`;
        }
      }
    }
    btn.disabled = false;
  });

  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function setThinking(v) {
  thinking.classList.toggle("active", v);
  sendBtn.disabled = v;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Page context ──────────────────────────────────────────────────────────────
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
  return tab;
}

async function waitForTabLoad(tabId, maxWait = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function getPageSnapshot(tabId) {
  try {
    const r = await chrome.scripting.executeScript({
      target: {tabId},
      func: () => {
        const radioOptions = [];

        // Method 1: labels with for= attribute
        document.querySelectorAll("label").forEach(lbl => {
          const forId = lbl.getAttribute("for");
          const inp = forId ? document.getElementById(forId) : lbl.querySelector("input[type=radio]");
          if (inp && inp.type === "radio") {
            radioOptions.push({ value: inp.value, text: lbl.innerText.trim(), checked: inp.checked, id: inp.id || "" });
          }
        });

        // Method 2: radios in containers
        if (radioOptions.length === 0) {
          document.querySelectorAll("input[type=radio]").forEach(r => {
            const container = r.closest("li,div,tr,p,span");
            const text = (container?.innerText || r.value || "").trim();
            if (text) radioOptions.push({ value: r.value, text, checked: r.checked, id: r.id });
          });
        }

        // Method 3: Custom framework options (role=radio, role=option, .option, .choice, etc.)
        if (radioOptions.length === 0) {
          const customEls = document.querySelectorAll("[role=radio], [role=option], .option, .choice, .answer-option, .q-option, [class*='option'], [class*='choice']");
          customEls.forEach(el => {
            const text = (el.innerText || "").trim();
            if (text && text.length < 200) {
              const isChecked = el.getAttribute("aria-checked") === "true" || el.classList.contains("selected") || el.classList.contains("active");
              radioOptions.push({ value: text, text, checked: isChecked, id: el.id || "" });
            }
          });
        }

        // Clickable elements
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

        // Question number — targeted DOM scanning + regex patterns
        let qNum = null;
        const bodyText = document.body.innerText || "";

        // Method 1: Check headings, headers, and question element titles first
        const qElements = document.querySelectorAll(
          "h1, h2, h3, h4, h5, h6, .question-title, .q-title, .question-number, .q-number, .qnum, [class*='question'], [id*='question'], [aria-label*='question']"
        );
        for (const el of qElements) {
          const txt = (el.innerText || el.getAttribute("aria-label") || "").trim();
          if (!txt || txt.length > 80) continue;
          const match = txt.match(/(?:Question|Q|Problem|Task|Item)\s*[\.#:#]?\s*(\d+)/i)
                     || txt.match(/^(\d+)\s*[/:]/);
          if (match) {
            const parsed = parseInt(match[1]);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
              qNum = parsed;
              break;
            }
          }
        }

        // Method 2: Body text regex matching
        if (qNum === null) {
          const qPatterns = [
            /Question\s*(?:No\.?|Num\.?)?\s*[:#]?\s*(\d+)/i,
            /Q\s*[\.#]?\s*(\d+)\s*(?:[/:|]|\b)/i,
            /(\d+)\s*(?:of|\/)\s*\d+/i,
            /Question\s*(\d+)/i,
            /Problem\s*(\d+)/i
          ];
          for (const p of qPatterns) {
            const m = bodyText.match(p);
            if (m) {
              const parsed = parseInt(m[1]);
              if (!isNaN(parsed) && parsed > 0 && parsed <= 500) { qNum = parsed; break; }
            }
          }
        }

        // Method 3: URL parameters or paths
        if (qNum === null) {
          const urlM = location.href.match(/[?&/]q(?:uestion)?(?:_id)?[\=/](\d+)/i)
                    || location.href.match(/q(\d+)/i);
          if (urlM) {
            const parsed = parseInt(urlM[1]);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 500) qNum = parsed;
          }
        }

        return {
          title: document.title, url: location.href,
          bodyText: bodyText.slice(0, 4000),
          clickables, radioOptions, questionNumber: qNum
        };
      }
    });
    return r[0].result;
  } catch { return null; }
}

// ── Groq API call ─────────────────────────────────────────────────────────────
async function callGroq(messages, retries = 0) {
  const key = getActiveKey();
  if (!key) throw new Error("No API keys available! Please add a Groq API key manually or import from a .txt file.");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1500, temperature: 0.1 })
  });

  if (res.status === 429 || res.status === 401) {
    markKeyExhausted();
    if (retries < apiKeys.length) return callGroq(messages, retries + 1);
    throw new Error("All keys rate-limited. Wait a minute.");
  }
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildPrompt(snap) {
  const optStr = (snap?.radioOptions || []).length > 0
    ? "\nMCQ OPTIONS — use EXACTLY these texts for select_radio:\n" +
      snap.radioOptions.map((o, i) => `  ${String.fromCharCode(65+i)}) "${o.text}"${o.checked ? " ← currently selected" : ""}`).join("\n")
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
<thinking>
1. Carefully analyze the question and context.
2. Work through the problem step-by-step. Show all logical deductions or calculations.
3. Double-check your reasoning before concluding.
</thinking>
Final conclusion: (brief summary of the answer)
</response>
<actions>[{"action":"ACTION","params":{}}]</actions>

━━━ ACTIONS ━━━
- select_radio: {"text":"EXACT_OPTION_TEXT"}
- click_next: {}   ← ONLY use this to move to the NEXT question (NEVER submit)
- click: {"selector":"text:BUTTON_TEXT"}
- click_xy: {"x":NUMBER,"y":NUMBER}
- scroll: {"direction":"down","amount":400}
- type: {"selector":"text:PLACEHOLDER","text":"VALUE"}
- navigate: {"url":"https://..."}
- none: {}

━━━ STRICT RULES ━━━
1. Answer questions ONE BY ONE in sequential order — do NOT skip any question.
2. For MCQ: ALWAYS output EXACTLY [select_radio({"text":"..."}), click_next({})]
3. NEVER use click_next if a SUBMIT button is visible — use none:{} instead.
4. NEVER click any button labeled Submit, Finish, or End Test.
5. Use EXACT option text from MCQ OPTIONS above — do not paraphrase.
6. Do the math step by step before choosing.
7. If no radio options visible, use [click_next()] to advance.
8. NEVER repeat an action on the same question.
9. NEVER output scroll actions — DO NOT SCROLL THE PAGE.`;
}

function parseAI(raw) {
  const tM = raw.match(/<thinking>([\s\S]*?)<\/thinking>/);
  const rM = raw.match(/<response>([\s\S]*?)<\/response>/);
  const aM = raw.match(/<actions>([\s\S]*?)<\/actions>/);
  
  // Extract a brief summary of the thinking to log
  let text = "Analyzing question and executing...";
  if (tM) {
    text = tM[1].trim().slice(0, 150).replace(/\n/g, ' ') + "...";
  } else if (rM) {
    text = rM[1].trim().slice(0, 150).replace(/\n/g, ' ') + "...";
  }
  let actions = [];
  if (aM) {
    try { actions = JSON.parse(aM[1].trim()); } catch {
      const arrM = aM[1].match(/\[[\s\S]*\]/);
      if (arrM) { try { actions = JSON.parse(arrM[0]); } catch {} }
    }
  }
  return { text, actions };
}

// ── Execute actions ───────────────────────────────────────────────────────────
async function executeActions(tabId, actions) {
  for (const a of actions) {
    if (a.action === "none" || a.action === "scroll") continue;

    if (a.action === "select_radio") {
      const optionText = a.params?.text || "";
      let res = "";
      try {
        const r = await chrome.scripting.executeScript({ target: { tabId }, func: runAction, args: [a] });
        res = r?.[0]?.result || "";
      } catch (e) {
        res = "ERROR: " + e.message;
      }
      const isSuccess = res && !res.includes("NOT_FOUND") && !res.includes("ERROR");
      addAnswerCard(optionText, isSuccess);
    } else {
      addLog("action", "→", `${a.action}(${JSON.stringify(a.params)})`);
      try {
        if (a.action === "navigate") {
          await chrome.runtime.sendMessage({ type: "navigate", tabId, url: a.params.url });
          await sleep(800);
        } else if (a.action === "go_back") {
          await chrome.runtime.sendMessage({ type: "go_back", tabId });
          await sleep(800);
        } else {
          await chrome.scripting.executeScript({ target: { tabId }, func: runAction, args: [a] });
        }
      } catch (e) { addLog("error", "fail", e.message); }
    }
    const isNav = a.action === "click_next" || a.action === "navigate" || a.action === "go_back";
    await sleep(isNav ? 1500 : 400);
  }
}

function runAction({action, params}) {
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
    // Page scrolling disabled
    if (el.tagName === "LABEL") {
      const forId = el.getAttribute("for");
      const input = forId ? document.getElementById(forId) : el.querySelector("input[type=radio],input[type=checkbox]");
      if (input) {
        input.checked = true;
        ["mousedown","mouseup","click"].forEach(t => input.dispatchEvent(new MouseEvent(t, {bubbles:true})));
        input.dispatchEvent(new Event("change", {bubbles:true}));
        el.dispatchEvent(new MouseEvent("click", {bubbles:true}));
        return true;
      }
    }
    if (el.type === "radio" || el.type === "checkbox") {
      el.checked = true;
      ["mousedown","mouseup","click"].forEach(t => el.dispatchEvent(new MouseEvent(t, {bubbles:true})));
      el.dispatchEvent(new Event("change", {bubbles:true}));
      return true;
    }
    ["mousedown","mouseup"].forEach(t => el.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true})));
    el.click();
    return true;
  }

  switch(action) {
    case "scroll":
      // Page scrolling disabled per user preference
      break;

    case "click": {
      const el = find(params.selector);
      if (el) robustClick(el);
      else return "NOT_FOUND: " + params.selector;
      break;
    }

    case "click_next": {
      const allBtns = [...document.querySelectorAll("a, button, input[type=submit], input[type=button], [role=button]")];
      // HARDCODED: Never click Submit/Finish/End buttons
      const isSubmit = el => /(submit|finish|end test|end quiz|done)/i.test((el.innerText || el.value || "").trim());
      const eligible = allBtns.filter(el => !isSubmit(el));
      let btn = eligible.find(el => /next/i.test(el.innerText || el.value || ""))
             || eligible.find(el => /→|>|»/.test(el.innerText || ""));
      if (btn) {
        // Page scrolling disabled
        ["mousedown","mouseup"].forEach(t => btn.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true})));
        btn.click();
        if (btn.tagName === "A" && btn.href && !btn.href.startsWith("javascript")) {
          window.location.href = btn.href;
        }
        return "clicked: " + (btn.innerText || btn.value || "button");
      }
      return "NOT_FOUND: next button (Submit blocked)";
    }

    case "click_xy": {
      const el = document.elementFromPoint(params.x, params.y);
      if (el) robustClick(el);
      break;
    }

    case "select_radio": {
      const targetText = (params.text || "").trim();
      const lowerTarget = targetText.toLowerCase();

      // Core text without leading Option letters like "A)", "A.", "(A)", "1)", "Option A:"
      const coreTarget = lowerTarget.replace(/^(?:[a-d0-9][\.\)\:\-]\s*|\([a-d0-9]\)\s*|option\s+[a-d0-9][\:\.\s]*)/i, "").trim();

      // Extract option letter index if present (A=0, B=1, C=2, D=3, E=4)
      const letterMatch = lowerTarget.match(/^(?:([a-e])[\.\)\:]|\(([a-e])\)|option\s+([a-e]))/i);
      const targetIdx = letterMatch ? (letterMatch[1] || letterMatch[2] || letterMatch[3]).toLowerCase().charCodeAt(0) - 97 : -1;

      // Helper function to trigger selection safely across Vanilla & Frameworks (React, Vue, Angular, etc.)
      function selectEl(el, inputEl) {
        if (!el && !inputEl) return false;
        if (inputEl) {
          try {
            const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
            if (nativeSet) nativeSet.call(inputEl, true);
            else inputEl.checked = true;
          } catch(e) { inputEl.checked = true; }

          ["pointerdown", "mousedown", "pointerup", "mouseup", "input", "change", "click"].forEach(t => {
            try { inputEl.dispatchEvent(new Event(t, { bubbles: true, cancelable: true })); } catch(e){}
          });
        }
        if (el) {
          ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(t => {
            try { el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })); } catch(e){}
          });
          if (typeof el.click === "function") { try { el.click(); } catch(e){} }
        }
        return true;
      }

      // Step 1: Search <label> elements
      const labels = [...document.querySelectorAll("label")];
      let matchedLabel = labels.find(lbl => {
        const txt = lbl.innerText.toLowerCase().trim();
        return txt === lowerTarget || txt === coreTarget || txt.includes(lowerTarget) || (coreTarget.length > 2 && txt.includes(coreTarget));
      });
      if (matchedLabel) {
        const forId = matchedLabel.getAttribute("for");
        const input = forId ? document.getElementById(forId) : matchedLabel.querySelector("input[type=radio],input[type=checkbox]");
        selectEl(matchedLabel, input);
        return "selected label: " + matchedLabel.innerText.trim();
      }

      // Step 2: Search <input type=radio> and <input type=checkbox>
      const radios = [...document.querySelectorAll("input[type=radio], input[type=checkbox]")];
      for (const r of radios) {
        const container = r.closest("li,div,tr,p,td,span,label") || r.parentElement;
        const txt = (container?.innerText || r.value || "").toLowerCase().trim();
        if (txt === lowerTarget || txt === coreTarget || txt.includes(lowerTarget) || (coreTarget.length > 2 && txt.includes(coreTarget))) {
          selectEl(container || r, r);
          return "selected radio: " + txt;
        }
      }

      // Step 3: Search Custom Option Containers (div, li, span, tr, [role=radio], etc.)
      const customCandidates = [...document.querySelectorAll("[role=radio], [role=option], .option, .choice, .q-option, [class*='option'], [class*='choice'], li, div, p, tr, td")];
      let bestMatch = null;
      for (const candidate of customCandidates) {
        const txt = (candidate.innerText || "").toLowerCase().trim();
        if (!txt || txt.length > 250) continue;
        if (txt === lowerTarget || txt === coreTarget || (coreTarget.length > 3 && txt.includes(coreTarget))) {
          bestMatch = candidate;
          break;
        }
      }
      if (bestMatch) {
        const childInp = bestMatch.querySelector("input[type=radio], input[type=checkbox]");
        selectEl(bestMatch, childInp);
        return "selected custom element: " + bestMatch.innerText.trim();
      }

      // Step 4: Fallback to Option Index if letter A/B/C/D was detected
      if (targetIdx >= 0) {
        if (radios.length > targetIdx) {
          const r = radios[targetIdx];
          const container = r.closest("li,div,tr,p,td,span,label") || r.parentElement;
          selectEl(container || r, r);
          return `selected radio at index ${targetIdx}`;
        }
        const optionEls = [...document.querySelectorAll("[role=radio], [role=option], .option, .choice, .q-option, [class*='option'], [class*='choice']")];
        if (optionEls.length > targetIdx) {
          const el = optionEls[targetIdx];
          const childInp = el.querySelector("input[type=radio], input[type=checkbox]");
          selectEl(el, childInp);
          return `selected option element at index ${targetIdx}`;
        }
      }

      return "NOT_FOUND option: " + targetText;
    }

    case "type": {
      const el = find(params.selector);
      if (el) {
        el.focus(); el.value = "";
        el.dispatchEvent(new Event("input", {bubbles:true}));
        for (const ch of params.text) { el.value += ch; el.dispatchEvent(new Event("input", {bubbles:true})); }
        el.dispatchEvent(new Event("change", {bubbles:true}));
      }
      break;
    }

    case "navigate":
      window.location.href = params.url;
      break;
  }
}

// ── Auto-loop ─────────────────────────────────────────────────────────────────
let autoLoopActive = false;
const stopBtn = document.getElementById("stopBtn");
stopBtn.addEventListener("click", () => {
  autoLoopActive = false;
  addLog("info","stop","⏹ Stopped by user.");
  stopBtn.classList.remove("visible");
});

async function forceNextOnPage(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const allBtns = [...document.querySelectorAll("a, button, input[type=submit], [role=button]")];
      // HARDCODED: Never force-click Submit/Finish/End buttons
      const isSubmit = el => /(submit|finish|end test|end quiz|done)/i.test((el.innerText || el.value || "").trim());
      const eligible = allBtns.filter(el => !isSubmit(el));
      const btn = eligible.find(el => /next/i.test(el.innerText || el.value || ""))
               || eligible.find(el => /→|>|»/.test(el.innerText || ""));
      if (btn) {
        // Page scrolling disabled
        ["mousedown","mouseup"].forEach(t => btn.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true})));
        btn.click();
        if (btn.tagName === "A" && btn.href && !btn.href.startsWith("javascript")) window.location.href = btn.href;
      }
    }
  });
}

function isTestFinished(snap) {
  if (!snap) return false;
  // If there are active radio options visible, the test is NOT finished
  if (snap.radioOptions && snap.radioOptions.length > 0) return false;
  const body = (snap.bodyText || "").toLowerCase();
  // Match explicit completion phrases only (avoids loose words like "result" matching "resulting")
  const finishPattern = /\b(?:your score|you scored|final score|test completed?|quiz completed?|exam completed?|test submitted|quiz submitted|assessment completed?|congratulations,? you (?:have )?completed)\b/i;
  return finishPattern.test(body);
}

async function waitForAdvance(tabId, fromQNum, fromUrl, maxWait = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(500);
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url !== fromUrl) {
        await waitForTabLoad(tabId, 3000);
        const snap = await getPageSnapshot(tabId);
        const finished = isTestFinished(snap);
        return { advanced: true, finished, qNum: snap?.questionNumber, url: tab.url, snap };
      }
      if (tab.status === "complete") {
        const snap = await getPageSnapshot(tabId);
        if (isTestFinished(snap)) {
          return { advanced: true, finished: true, qNum: null, url: tab.url };
        }
        if (snap?.questionNumber !== null && snap?.questionNumber !== fromQNum) {
          return { advanced: true, finished: false, qNum: snap.questionNumber, url: tab.url };
        }
      }
    } catch {}
  }
  return { advanced: false, finished: false, qNum: fromQNum, url: fromUrl };
}

async function runAutoLoop(userMsg, tab) {
  const MAX_Q = 100;
  let answered = 0;
  let lastQNum = null;
  const startQVal = parseInt(document.getElementById("startQ").value) || 1;
  const endQVal = parseInt(document.getElementById("endQ").value) || 100;
  const totalTargetToAnswer = (endQVal >= startQVal) ? (endQVal - startQVal + 1) : 1;

  addLog("info","auto",`🔄 Auto-loop — answering Q${startQVal} to Q${endQVal}. Click ⏹ to stop.`);

  while (autoLoopActive && answered < MAX_Q) {
    // 1. Force stop if target count of answered questions reached
    if (answered >= totalTargetToAnswer) {
      autoLoopActive = false;
      addLog("info","done",`🛑 Force Stopped — Completed target count of ${totalTargetToAnswer} question(s) (Q${startQVal} to Q${endQVal}).`);
      break;
    }

    const currentTab = await getCurrentTab();
    if (!currentTab) break;
    if (currentTab.url) updatePageUrlDisplay(currentTab.url);

    await waitForTabLoad(currentTab.id, 3000);
    const preSnap = await getPageSnapshot(currentTab.id);
    if (!preSnap) { addLog("error","err","Cannot read page."); break; }

    const qNum = preSnap.questionNumber;
    const fromUrl = preSnap.url;
    const bodyLower = preSnap.bodyText.toLowerCase();

    // Stop if test is complete
    if (isTestFinished(preSnap)) {
      autoLoopActive = false;
      addLog("info","done","✅ Test complete!"); break;
    }

    // Safety: detect if we're stuck on the same question number
    if (qNum !== null && qNum === lastQNum) {
      addLog("info","warn",`Still on Q${qNum} — forcing advance...`);
      await forceNextOnPage(currentTab.id);
      await sleep(2000);
      continue;
    }

    const currentQ = qNum ?? (startQVal + answered);

    // 2. Force stop if current question number exceeds End Question setting
    if (currentQ > endQVal) {
      autoLoopActive = false;
      addLog("info","done",`🛑 Force Stopped — Reached End Question limit (${endQVal}).`);
      break;
    }

    if (currentQ < startQVal) {
      addLog("info","step",`Skipping Q${currentQ} (Target Start: Q${startQVal})...`);
      await forceNextOnPage(currentTab.id);
      await sleep(1500);
      const result = await waitForAdvance(currentTab.id, qNum, fromUrl, 5000);
      if (result.finished) { autoLoopActive = false; addLog("info","done","✅ Test completed!"); break; }
      continue;
    }

    addLog("info","step",`Q${currentQ} — answering...`);

    const messages = [
      { role:"system", content: buildPrompt(preSnap) },
      { role:"user",   content: `Answer question ${currentQ} now. Select the correct radio option first, then use click_next to advance. Do NOT click Submit or Finish.` }
    ];

    let raw;
    try { raw = await callGroq(messages); }
    catch(e) { addLog("error","api",e.message); break; }

    const { text, actions } = parseAI(raw);
    addLog("agent","groq", text);

    // HARDCODED: Strip any submit/finish actions before executing
    let safeActions = actions.filter(a => {
      if (a.action === "click" && /submit|finish|end/i.test(a.params?.selector || "")) return false;
      return true;
    });

    if (currentQ >= endQVal) {
      safeActions = safeActions.filter(a => a.action !== "click_next" && a.action !== "navigate");
    }

    await executeActions(currentTab.id, safeActions);
    lastQNum = qNum;
    answered++;

    // 3. Force stop immediately after answering the End Question
    if (currentQ >= endQVal || answered >= totalTargetToAnswer) {
      autoLoopActive = false;
      addLog("info","done",`🛑 Force Stopped — Reached End Question (${endQVal}). Stopping immediately.`);
      break;
    }

    // If AI didn't click next, force it
    const didClickNext = safeActions.some(a => a.action === "click_next");
    if (!didClickNext) {
      addLog("info","warn","AI didn't use click_next — forcing...");
      await forceNextOnPage(currentTab.id);
      await sleep(1500);
    }

    // Wait for page to advance to next question
    const result = await waitForAdvance(currentTab.id, qNum, fromUrl, 5000);
    if (result.finished) { autoLoopActive = false; addLog("info","done","✅ Test completed!"); break; }

    if (!result.advanced) {
      addLog("info","warn",`Q${qNum} not advancing — force clicking Next again...`);
      await forceNextOnPage(currentTab.id);
      const result2 = await waitForAdvance(currentTab.id, qNum, fromUrl, 4000);
      if (result2.finished) { autoLoopActive = false; addLog("info","done","✅ Test completed!"); break; }
    }

    await sleep(300);
  }

  if (answered >= MAX_Q) addLog("info","warn","Reached max questions limit. Stopping.");
}

// ── Main send handler ─────────────────────────────────────────────────────────
async function handleSend() {
  const userMsg = cmdInput.value.trim();
  if (!userMsg) return;
  if (apiKeys.length === 0) { addLog("error","keys","No API keys! Click ⚙ keys to add your Groq keys."); return; }

  cmdInput.value = ""; autoResize();
  addLog("user","you", userMsg);
  setThinking(true);
  autoLoopActive = true;
  stopBtn.classList.add("visible");

  try {
    const tab = await getCurrentTab();
    if (tab?.url) updatePageUrlDisplay(tab.url);

    const isMultiStep = /all|every|each|\d+.*question|questions|quiz|test|exam/i.test(userMsg);

    if (isMultiStep) {
      await runAutoLoop(userMsg, tab);
    } else {
      const snap = await getPageSnapshot(tab.id);
      const messages = [
        { role:"system", content: buildPrompt(snap) },
        { role:"user",   content: userMsg }
      ];
      const raw = await callGroq(messages);
      const { text, actions } = parseAI(raw);
      addLog("agent","groq", text);
      if (actions.length > 0 && tab) {
        let safeActions = actions.filter(a => {
          if (a.action === "click" && /(submit|finish|end test|end quiz|done)/i.test(a.params?.selector || "")) return false;
          if (a.action === "click_next" || a.action === "navigate") return false;
          return true;
        });
        await executeActions(tab.id, safeActions);
        const done = safeActions.filter(a => a.action !== "none").length;
        if (done > 0) addLog("info","done",`${done} action(s) completed ✓`);
      }
    }
  } catch(e) {
    addLog("error","error", e.message);
  } finally {
    autoLoopActive = false;
    setThinking(false);
    stopBtn.classList.remove("visible");
  }
}

// ── UI wiring ─────────────────────────────────────────────────────────────────
function autoResize() {
  cmdInput.style.height = "auto";
  cmdInput.style.height = Math.min(cmdInput.scrollHeight, 80) + "px";
}

sendBtn.addEventListener("click", handleSend);
cmdInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } });
cmdInput.addEventListener("input", autoResize);

document.querySelectorAll(".quick-btn").forEach(btn => {
  btn.addEventListener("click", () => { cmdInput.value = btn.dataset.cmd; autoResize(); handleSend(); });
});
clearBtn.addEventListener("click", () => { logArea.innerHTML = ""; logArea.appendChild(logEmpty); logEmpty.style.display = "flex"; });

// Modal event listeners
if (keysToggleBtn) {
  keysToggleBtn.addEventListener("click", () => {
    if (keysModalOverlay) keysModalOverlay.classList.add("active");
    updateKeysUI();
  });
}

if (closeKeysModalBtn) {
  closeKeysModalBtn.addEventListener("click", () => {
    if (keysModalOverlay) keysModalOverlay.classList.remove("active");
  });
}

if (keysModalOverlay) {
  keysModalOverlay.addEventListener("click", (e) => {
    if (e.target === keysModalOverlay) {
      keysModalOverlay.classList.remove("active");
    }
  });
}

if (addKeyBtn) {
  addKeyBtn.addEventListener("click", () => {
    if (newKeyInput) addKey(newKeyInput.value);
  });
}

if (newKeyInput) {
  newKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addKey(newKeyInput.value);
    }
  });
}

if (importKeysBtn) {
  importKeysBtn.addEventListener("click", () => {
    if (importKeysInput) importKeysInput.click();
  });
}

if (importKeysBtnToolbar) {
  importKeysBtnToolbar.addEventListener("click", () => {
    if (importKeysInput) importKeysInput.click();
  });
}

if (importKeysInput) {
  importKeysInput.addEventListener("change", handleFileImport);
}

if (resetExhaustedBtn) {
  resetExhaustedBtn.addEventListener("click", resetExhaustedKeys);
}

if (clearAllKeysBtn) {
  clearAllKeysBtn.addEventListener("click", clearAllKeys);
}

// ── Detect Question Feature ───────────────────────────────────────────────────
async function detectCurrentQuestion() {
  const detectBtn = document.getElementById("detectQBtn");
  if (detectBtn) detectBtn.disabled = true;

  try {
    const tab = await getCurrentTab();
    if (!tab) {
      addLog("info", "warn", "No active browser tab found.");
      return;
    }
    const snap = await getPageSnapshot(tab.id);
    if (snap && snap.questionNumber !== null && !isNaN(snap.questionNumber)) {
      const qVal = snap.questionNumber;
      document.getElementById("startQ").value = qVal;
      addLog("info", "detect", `🎯 Detected Question ${qVal} on active page. Set Start Question to ${qVal}.`);
    } else {
      addLog("info", "warn", "⚠️ Could not auto-detect question number on page. Please set Start Question manually.");
    }
  } catch (e) {
    addLog("error", "err", `Detection error: ${e.message}`);
  } finally {
    if (detectBtn) detectBtn.disabled = false;
  }
}

const detectQBtn = document.getElementById("detectQBtn");
if (detectQBtn) {
  detectQBtn.addEventListener("click", detectCurrentQuestion);
}

// Copy URL Listeners
function copyCurrentUrl(e) {
  if (e) e.stopPropagation();
  if (!currentFullUrl) return;
  navigator.clipboard.writeText(currentFullUrl).then(() => {
    const icon = document.getElementById("copyUrlIcon");
    const copyBtn = document.getElementById("copyUrlBtn");
    if (icon) icon.textContent = "check";
    if (copyBtn) copyBtn.classList.add("copied");
    setTimeout(() => {
      if (icon) icon.textContent = "content_copy";
      if (copyBtn) copyBtn.classList.remove("copied");
    }, 1500);
  }).catch(() => {});
}

const copyUrlBtn = document.getElementById("copyUrlBtn");
if (copyUrlBtn) {
  copyUrlBtn.addEventListener("click", copyCurrentUrl);
}

const pageBar = document.getElementById("pageBar");
if (pageBar) {
  pageBar.addEventListener("click", copyCurrentUrl);
}

(async () => { await loadKeys(); const tab = await getCurrentTab(); if (tab?.url) updatePageUrlDisplay(tab.url); })();

chrome.tabs.onActivated.addListener(async () => {
  const tab = await getCurrentTab();
  if (tab?.url) updatePageUrlDisplay(tab.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    const currentTab = await getCurrentTab();
    if (currentTab && currentTab.id === tabId && currentTab.url) {
      updatePageUrlDisplay(currentTab.url);
    }
  }
});

