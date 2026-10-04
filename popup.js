const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
let selectedModel = DEFAULT_MODEL;


// ── Elements ──────────────────────────────────────────────────────────────────
const logArea            = document.getElementById("logArea");
const logEmpty           = document.getElementById("logEmpty");
const cmdInput           = document.getElementById("cmdInput");
const sendBtn            = document.getElementById("sendBtn");
const thinking           = document.getElementById("thinking");
const clearBtn           = document.getElementById("clearBtn");
const modelSelect        = document.getElementById("modelSelect");
const customModelRow     = document.getElementById("customModelRow");
const customModelInput   = document.getElementById("customModelInput");
const saveCustomModelBtn = document.getElementById("saveCustomModelBtn");

// Provider Elements
const providerSelect        = document.getElementById("providerSelect");
const openProviderModalBtn  = document.getElementById("openProviderModalBtn");
const providerModalOverlay  = document.getElementById("providerModalOverlay");
const closeProviderModalBtn = document.getElementById("closeProviderModalBtn");
const modalProvidersCountTag= document.getElementById("modalProvidersCountTag");
const providerFormTitle     = document.getElementById("providerFormTitle");
const cancelEditProviderBtn = document.getElementById("cancelEditProviderBtn");
const provNameInput         = document.getElementById("provNameInput");
const provUrlInput          = document.getElementById("provUrlInput");
const provKeyInput          = document.getElementById("provKeyInput");
const toggleProvKeyPwBtn    = document.getElementById("toggleProvKeyPwBtn");
const provModelInput        = document.getElementById("provModelInput");
const saveProviderBtn       = document.getElementById("saveProviderBtn");
const saveProviderBtnText   = document.getElementById("saveProviderBtnText");
const providerFeedback      = document.getElementById("providerFeedback");
const providersListContainer= document.getElementById("providersListContainer");
const keysModalTitleText    = document.getElementById("keysModalTitleText");
const addKeyLabel           = document.getElementById("addKeyLabel");
const providerStatusBadge   = document.getElementById("providerStatusBadge");
const providerStatusText    = document.getElementById("providerStatusText");

let currentFullUrl = "";

function notifyTabProcessUpdate(updateData) {
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        const prov = typeof getActiveProvider === "function" ? getActiveProvider() : null;
        const msg = {
          type: "UPDATE_PROCESS",
          provider: prov ? prov.name : "Groq",
          model: prov ? (prov.model || selectedModel) : selectedModel,
          ...updateData
        };
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
      }
    });
  }
}

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

// ── Safe Storage Adapter (Chrome Extension storage with localStorage fallback) ─
const storage = {
  async get(keys) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return chrome.storage.local.get(keys);
    }
    const res = {};
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v !== null) {
        try { res[k] = JSON.parse(v); } catch { res[k] = v; }
      }
    }
    return res;
  },
  async set(items) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      return chrome.storage.local.set(items);
    }
    for (const [k, v] of Object.entries(items)) {
      localStorage.setItem(k, JSON.stringify(v));
    }
  }
};

// ── Provider state & presets ──────────────────────────────────────────────────
const DEFAULT_PROVIDER_VERSION = "v2_cf_gemini";
const DEFAULT_CUSTOM_PROVIDER = {
  id: "prov_default_cloudflare",
  name: "Cloudflare Gemini",
  url: "https://scoop-november-medium-arnold.trycloudflare.com/v1/chat/completions",
  model: "antigravity/gemini-3.7-flash-medium",
  apiKeys: ["sk-b5b65eff745747bd-7d1a51-e704dc7c"]
};

let activeProviderId = DEFAULT_CUSTOM_PROVIDER.id;
let customProviders = [DEFAULT_CUSTOM_PROVIDER];
let editingProviderId = null;

const PRESETS = {
  cf_gemini: {
    name: "Cloudflare Gemini",
    url: "https://scoop-november-medium-arnold.trycloudflare.com/v1/chat/completions",
    model: "antigravity/gemini-3.7-flash-medium",
    key: "sk-b5b65eff745747bd-7d1a51-e704dc7c"
  },
  openai: {
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o"
  },
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "anthropic/claude-3.5-sonnet"
  },
  deepseek: {
    name: "DeepSeek",
    url: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat"
  },
  ollama: {
    name: "Ollama (Local)",
    url: "http://localhost:11434/v1/chat/completions",
    model: "llama3.2"
  },
  lmstudio: {
    name: "LM Studio (Local)",
    url: "http://localhost:1234/v1/chat/completions",
    model: "local-model"
  }
};

function normalizeEndpointUrl(url) {
  if (!url) return "";
  let clean = url.trim().replace(/\/+$/, "");
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://" + clean;
  }
  try {
    const u = new URL(clean);
    if (u.pathname === "/" || u.pathname === "") {
      u.pathname = "/v1/chat/completions";
    } else if (u.pathname === "/v1") {
      u.pathname = "/v1/chat/completions";
    } else if (!u.pathname.endsWith("/chat/completions") && !u.pathname.includes("/completions")) {
      u.pathname = u.pathname.replace(/\/+$/, "") + "/chat/completions";
    }
    return u.toString();
  } catch (e) {
    return clean;
  }
}

function getActiveProvider() {
  if (activeProviderId === "groq") {
    return {
      id: "groq",
      name: "Groq",
      type: "groq",
      url: GROQ_URL,
      model: selectedModel || DEFAULT_MODEL,
      apiKeys: apiKeys.map(k => k.key)
    };
  }
  const found = customProviders.find(p => p.id === activeProviderId);
  if (found) return found;
  activeProviderId = "groq";
  return {
    id: "groq",
    name: "Groq",
    type: "groq",
    url: GROQ_URL,
    model: selectedModel || DEFAULT_MODEL,
    apiKeys: apiKeys.map(k => k.key)
  };
}

async function loadProviders() {
  try {
    const res = await storage.get(["active_provider_id", "custom_providers", "default_prov_version"]);
    customProviders = Array.isArray(res.custom_providers) ? res.custom_providers : [];

    // Ensure user's default provider is configured and set as active on initial run or version upgrade
    if (res.default_prov_version !== DEFAULT_PROVIDER_VERSION) {
      activeProviderId = DEFAULT_CUSTOM_PROVIDER.id;
      const existingIdx = customProviders.findIndex(p => p.id === DEFAULT_CUSTOM_PROVIDER.id || p.url.includes("scoop-november-medium-arnold"));
      if (existingIdx !== -1) {
        customProviders[existingIdx] = { ...DEFAULT_CUSTOM_PROVIDER };
      } else {
        customProviders.unshift({ ...DEFAULT_CUSTOM_PROVIDER });
      }
      await storage.set({
        active_provider_id: activeProviderId,
        custom_providers: customProviders,
        default_prov_version: DEFAULT_PROVIDER_VERSION
      });
    } else {
      activeProviderId = res.active_provider_id || DEFAULT_CUSTOM_PROVIDER.id;
      if (activeProviderId !== "groq" && !customProviders.some(p => p.id === activeProviderId)) {
        activeProviderId = DEFAULT_CUSTOM_PROVIDER.id;
      }
    }
  } catch (e) {
    customProviders = [{ ...DEFAULT_CUSTOM_PROVIDER }];
    activeProviderId = DEFAULT_CUSTOM_PROVIDER.id;
  }
  renderProviderSelect();
  renderProvidersList();
  triggerProviderStatusCheck();
}

async function saveProvidersToStorage() {
  try {
    await storage.set({
      active_provider_id: activeProviderId,
      custom_providers: customProviders
    });
  } catch (e) {
    console.error("Failed to save providers to storage:", e);
  }
}

async function switchProvider(id) {
  if (id === activeProviderId) return;
  activeProviderId = id;
  await saveProvidersToStorage();
  await loadKeys();
  await loadModel();
  renderProviderSelect();
  renderProvidersList();
  const prov = getActiveProvider();
  addLog("info", "provider", `Switched active provider to: ${prov.name} (${prov.model})`);
  triggerProviderStatusCheck();
}

// ── Real-time Provider Status Signal (Active or Unavailable) ───────────────────
let currentStatusAbortController = null;

async function triggerProviderStatusCheck() {
  const badge = document.getElementById("providerStatusBadge");
  const textElem = document.getElementById("providerStatusText");
  if (!badge || !textElem) return;

  badge.className = "provider-status-badge checking";
  badge.title = "Testing connection to provider...";
  textElem.textContent = "Checking";

  if (currentStatusAbortController) {
    currentStatusAbortController.abort();
  }
  currentStatusAbortController = new AbortController();
  const signal = currentStatusAbortController.signal;

  const prov = getActiveProvider();
  const startTime = Date.now();

  try {
    const isGroq = !prov || prov.id === "groq";
    const endpoint = prov ? normalizeEndpointUrl(prov.url) : GROQ_URL;
    let checkUrl = endpoint.replace(/\/chat\/completions$/, "/models");
    if (checkUrl === endpoint) {
      checkUrl = endpoint.replace(/\/+$/, "") + "/models";
    }

    const headers = {};
    const key = (prov.apiKeys && prov.apiKeys.length > 0) ? prov.apiKeys[0] : (getActiveKey() || "");
    if (key) {
      headers["Authorization"] = `Bearer ${key}`;
    }
    if (endpoint.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://github.com/infernoGurala/Luna-CRT";
      headers["X-Title"] = "Luna cool girl";
    }

    let isAvailable = false;
    let detail = "";

    // 1. Try GET /models with 5s timeout
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout (5s)")), 5000));
      const fetchPromise = fetch(checkUrl, { method: "GET", headers, signal });
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (res.ok) {
        isAvailable = true;
        const latency = Date.now() - startTime;
        detail = `Active (${latency}ms)`;
      } else if (res.status === 401 || res.status === 403) {
        isAvailable = false;
        detail = "Auth Failed (401)";
      } else {
        // Fallback: minimal chat completion if /models returned 404/405
        const compRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            model: prov.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
          }),
          signal
        });
        if (compRes.ok) {
          isAvailable = true;
          const latency = Date.now() - startTime;
          detail = `Active (${latency}ms)`;
        } else {
          isAvailable = false;
          detail = `HTTP ${compRes.status}`;
        }
      }
    } catch (fetchErr) {
      if (signal.aborted) return;
      isAvailable = false;
      detail = fetchErr.message || "Connection failed";
    }

    if (signal.aborted) return;

    if (isAvailable) {
      badge.className = "provider-status-badge active";
      textElem.textContent = "Active";
      badge.title = `${prov.name} is Active (${detail}).\nClick to re-check.`;
    } else {
      badge.className = "provider-status-badge unavailable";
      textElem.textContent = "Unavailable";
      badge.title = `${prov.name} is Unavailable (${detail}).\nClick to retry.`;
    }
  } catch (err) {
    if (signal.aborted) return;
    badge.className = "provider-status-badge unavailable";
    textElem.textContent = "Unavailable";
    badge.title = `Error checking provider: ${err.message}\nClick to retry.`;
  }
}

function renderProviderSelect() {
  if (!providerSelect) return;
  providerSelect.innerHTML = "";

  const groqOpt = document.createElement("option");
  groqOpt.value = "groq";
  groqOpt.textContent = "Groq (Built-in)";
  if (activeProviderId === "groq") groqOpt.selected = true;
  providerSelect.appendChild(groqOpt);

  if (customProviders.length > 0) {
    const group = document.createElement("optgroup");
    group.label = "Custom Providers";
    customProviders.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      opt.title = `${p.name} (${p.model})`;
      if (activeProviderId === p.id) opt.selected = true;
      group.appendChild(opt);
    });
    providerSelect.appendChild(group);
  }

  const actionsGroup = document.createElement("optgroup");
  actionsGroup.label = "Configure";
  const addOpt = document.createElement("option");
  addOpt.value = "__add_new__";
  addOpt.textContent = "+ Add Custom Provider...";
  actionsGroup.appendChild(addOpt);

  const manageOpt = document.createElement("option");
  manageOpt.value = "__manage__";
  manageOpt.textContent = "⚙ Manage Providers...";
  actionsGroup.appendChild(manageOpt);

  providerSelect.appendChild(actionsGroup);

  if (modalProvidersCountTag) {
    modalProvidersCountTag.textContent = `${1 + customProviders.length} configured`;
  }
}

function renderProvidersList() {
  if (!providersListContainer) return;
  providersListContainer.innerHTML = "";

  // 1. Groq Built-in Card
  const groqCard = document.createElement("div");
  const isGroqActive = activeProviderId === "groq";
  groqCard.className = `provider-card ${isGroqActive ? 'active-provider' : ''}`;
  groqCard.innerHTML = `
    <div class="provider-card-info">
      <div class="provider-card-header">
        <span class="provider-card-name">Groq</span>
        <span class="provider-badge builtin">Built-in</span>
        ${isGroqActive ? '<span class="provider-badge active">Active</span>' : ''}
      </div>
      <div class="provider-card-url">${escapeHtml(GROQ_URL)}</div>
      <div class="provider-card-meta">
        <span>Model: <span class="provider-card-model">${escapeHtml(selectedModel || DEFAULT_MODEL)}</span></span>
      </div>
    </div>
    <div class="provider-card-actions">
      ${!isGroqActive ? `
        <button class="primary-btn activate-prov-btn" style="padding: 4px 10px; font-size: 11px;" title="Use Groq">
          Activate
        </button>
      ` : ''}
    </div>
  `;
  if (!isGroqActive) {
    const actBtn = groqCard.querySelector(".activate-prov-btn");
    if (actBtn) actBtn.addEventListener("click", () => switchProvider("groq"));
  }
  providersListContainer.appendChild(groqCard);

  // 2. Custom Providers
  customProviders.forEach(p => {
    const isActive = p.id === activeProviderId;
    const isEditing = p.id === editingProviderId;
    const card = document.createElement("div");
    card.className = `provider-card ${isActive ? 'active-provider' : ''} ${isEditing ? 'editing-provider' : ''}`;
    const keysCount = Array.isArray(p.apiKeys) ? p.apiKeys.length : (p.apiKey ? 1 : 0);
    const keyInfo = keysCount > 0 ? `${keysCount} key(s)` : "No key (Local)";

    card.innerHTML = `
      <div class="provider-card-info">
        <div class="provider-card-header">
          <span class="provider-card-name">${escapeHtml(p.name)}</span>
          ${isEditing ? '<span class="provider-badge editing">Editing</span>' : (isActive ? '<span class="provider-badge active">Active</span>' : '<span class="provider-badge ready">Ready</span>')}
        </div>
        <div class="provider-card-url" title="${escapeHtml(p.url)}">${escapeHtml(p.url)}</div>
        <div class="provider-card-meta">
          <span>Model: <span class="provider-card-model">${escapeHtml(p.model)}</span></span>
          <span>•</span>
          <span>${keyInfo}</span>
        </div>
      </div>
      <div class="provider-card-actions">
        ${!isActive ? `
          <button class="primary-btn activate-prov-btn" style="padding: 4px 10px; font-size: 11px;" title="Use ${escapeHtml(p.name)}">
            <span class="material-symbols-rounded" style="font-size: 14px;">check_circle</span> Activate
          </button>
        ` : ''}
        <button class="text-btn edit-prov-btn" title="Edit Provider settings">
          <span class="material-symbols-rounded" style="font-size: 15px;">edit</span> Edit
        </button>
        <button class="danger-text-btn delete-prov-btn" title="Delete Provider">
          <span class="material-symbols-rounded" style="font-size: 15px;">delete</span> Delete
        </button>
      </div>
    `;

    if (!isActive) {
      const actBtn = card.querySelector(".activate-prov-btn");
      if (actBtn) actBtn.addEventListener("click", () => switchProvider(p.id));
    }

    const editBtn = card.querySelector(".edit-prov-btn");
    if (editBtn) editBtn.addEventListener("click", () => startEditingProvider(p));

    const delBtn = card.querySelector(".delete-prov-btn");
    if (delBtn) delBtn.addEventListener("click", () => deleteProvider(p.id));

    providersListContainer.appendChild(card);
  });
}

function resetProviderForm() {
  editingProviderId = null;
  if (providerFormTitle) providerFormTitle.textContent = "Add Custom Provider";
  if (saveProviderBtnText) saveProviderBtnText.textContent = "Save & Activate";
  if (cancelEditProviderBtn) cancelEditProviderBtn.style.display = "none";
  if (provNameInput) provNameInput.value = "";
  if (provUrlInput) provUrlInput.value = "";
  if (provKeyInput) provKeyInput.value = "";
  if (provModelInput) provModelInput.value = "";
  if (providerFeedback) {
    providerFeedback.textContent = "";
    providerFeedback.className = "feedback-msg";
  }
  renderProvidersList();
}

function startEditingProvider(prov) {
  editingProviderId = prov.id;
  if (providerFormTitle) providerFormTitle.textContent = `Edit Provider: ${prov.name}`;
  if (saveProviderBtnText) saveProviderBtnText.textContent = "Update Provider";
  if (cancelEditProviderBtn) cancelEditProviderBtn.style.display = "inline-flex";
  if (provNameInput) provNameInput.value = prov.name;
  if (provUrlInput) provUrlInput.value = prov.url;
  if (provKeyInput) provKeyInput.value = (prov.apiKeys || []).join(", ");
  if (provModelInput) provModelInput.value = prov.model;
  if (providerFeedback) {
    providerFeedback.textContent = `Editing "${prov.name}". Make your changes and click Update Provider.`;
    providerFeedback.className = "feedback-msg success";
  }
  
  // Smooth scroll form into view
  const modalBody = providerModalOverlay?.querySelector('.modal-body');
  if (modalBody) {
    modalBody.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (provNameInput) provNameInput.focus();
  renderProvidersList();
}

async function handleSaveProvider() {
  if (providerFeedback) {
    providerFeedback.textContent = "";
    providerFeedback.className = "feedback-msg";
  }

  const name = (provNameInput?.value || "").trim();
  const rawUrl = (provUrlInput?.value || "").trim();
  const rawKey = (provKeyInput?.value || "").trim();
  const model = (provModelInput?.value || "").trim();

  if (!name) {
    showProviderFeedback("Please provide a Provider Name.", "error");
    if (provNameInput) provNameInput.focus();
    return;
  }
  if (!rawUrl) {
    showProviderFeedback("Please provide an API Endpoint URL.", "error");
    if (provUrlInput) provUrlInput.focus();
    return;
  }
  if (!model) {
    showProviderFeedback("Please provide a Model ID.", "error");
    if (provModelInput) provModelInput.focus();
    return;
  }

  const normalizedUrl = normalizeEndpointUrl(rawUrl);
  const parsedKeys = rawKey
    ? rawKey.split(/[\r\n,;]+/).map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : [];

  if (editingProviderId) {
    const idx = customProviders.findIndex(p => p.id === editingProviderId);
    if (idx !== -1) {
      customProviders[idx].name = name;
      customProviders[idx].url = normalizedUrl;
      customProviders[idx].model = model;
      customProviders[idx].apiKeys = parsedKeys;
    }
    await saveProvidersToStorage();
    if (activeProviderId === editingProviderId) {
      await loadKeys();
      await loadModel();
    }
    showProviderFeedback(`Updated "${name}" successfully!`, "success");
    resetProviderForm();
    addLog("info", "provider", `Updated saved provider: ${name} (${model})`);
  } else {
    const newProv = {
      id: "prov_" + Date.now(),
      name,
      url: normalizedUrl,
      model,
      apiKeys: parsedKeys
    };
    customProviders.push(newProv);
    activeProviderId = newProv.id;
    await saveProvidersToStorage();
    await loadKeys();
    await loadModel();
    showProviderFeedback(`Saved and activated "${name}"!`, "success");
    resetProviderForm();
    addLog("info", "provider", `Configured new custom provider: ${name} (${model})`);
  }

  renderProviderSelect();
  renderProvidersList();
  triggerProviderStatusCheck();
}

function showProviderFeedback(msg, type = "success") {
  if (!providerFeedback) return;
  providerFeedback.textContent = msg;
  providerFeedback.className = `feedback-msg ${type}`;
}

async function deleteProvider(id) {
  const prov = customProviders.find(p => p.id === id);
  if (!prov) return;
  if (!confirm(`Are you sure you want to delete provider "${prov.name}"?`)) return;

  customProviders = customProviders.filter(p => p.id !== id);
  if (activeProviderId === id) {
    activeProviderId = "groq";
  }
  if (editingProviderId === id) {
    resetProviderForm();
  }

  await saveProvidersToStorage();
  await loadKeys();
  await loadModel();
  renderProviderSelect();
  renderProvidersList();
  triggerProviderStatusCheck();
  addLog("info", "provider", `Deleted provider: ${prov.name}`);
}

async function clearAllCustomProviders() {
  if (customProviders.length === 0) {
    alert("No custom providers saved to delete.");
    return;
  }
  if (!confirm("Are you sure you want to delete ALL custom providers?")) return;

  customProviders = [];
  activeProviderId = "groq";
  resetProviderForm();

  await saveProvidersToStorage();
  await loadKeys();
  await loadModel();
  renderProviderSelect();
  renderProvidersList();
  triggerProviderStatusCheck();
  addLog("info", "provider", "Cleared all custom providers. Reset active provider to Groq.");
}
// ── Model state & management ──────────────────────────────────────────────────
function restoreGroqModelOptions() {
  if (!modelSelect) return;
  modelSelect.innerHTML = `
    <optgroup label="Production Models">
      <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Recommended)</option>
      <option value="openai/gpt-oss-120b">GPT-OSS 120B (Reasoning)</option>
      <option value="openai/gpt-oss-20b">GPT-OSS 20B (Fast)</option>
      <option value="deepseek-r1-distill-llama-70b">DeepSeek R1 Distill 70B</option>
    </optgroup>
    <optgroup label="Fast & Lightweight">
      <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
      <option value="llama-3.2-3b-preview">Llama 3.2 3B</option>
      <option value="llama-3.2-1b-preview">Llama 3.2 1B</option>
      <option value="llama-3.2-11b-vision-preview">Llama 3.2 11B Vision</option>
      <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
      <option value="gemma2-9b-it">Gemma 2 9B</option>
    </optgroup>
    <optgroup label="Custom">
      <option value="custom">Custom Model...</option>
    </optgroup>
  `;
}

async function loadModel() {
  if (activeProviderId === "groq") {
    try {
      const res = await storage.get(["groq_selected_model", "groq_custom_model"]);
      const savedModel = res.groq_selected_model || DEFAULT_MODEL;
      const customModel = res.groq_custom_model || "";

      if (customModelInput && customModel) {
        customModelInput.value = customModel;
      }

      selectedModel = savedModel;

      if (modelSelect) {
        restoreGroqModelOptions();
        const hasOption = Array.from(modelSelect.options).some(opt => opt.value === savedModel);
        if (hasOption) {
          modelSelect.value = savedModel;
          if (customModelRow) customModelRow.style.display = "none";
        } else {
          modelSelect.value = "custom";
          if (customModelRow) {
            customModelRow.style.display = "flex";
            if (customModelInput) customModelInput.value = savedModel;
          }
        }
      }
    } catch (e) {
      selectedModel = DEFAULT_MODEL;
    }
  } else {
    // Custom Provider active
    const prov = customProviders.find(p => p.id === activeProviderId);
    const provModel = prov?.model || "custom-model";
    selectedModel = provModel;
    if (customModelInput) {
      customModelInput.value = provModel;
    }
    if (modelSelect) {
      modelSelect.innerHTML = `
        <optgroup label="${escapeHtml(prov?.name || 'Custom')} Model">
          <option value="${escapeHtml(provModel)}" selected>${escapeHtml(provModel)}</option>
        </optgroup>
        <optgroup label="Options">
          <option value="custom">Edit Model...</option>
        </optgroup>
      `;
      if (customModelRow) customModelRow.style.display = "none";
    }
  }
}

async function setModel(modelName, isCustom = false) {
  const cleanName = (modelName || "").trim();
  if (activeProviderId === "groq") {
    selectedModel = cleanName || DEFAULT_MODEL;
    try {
      const dataToSave = { groq_selected_model: selectedModel };
      if (isCustom) {
        dataToSave.groq_custom_model = selectedModel;
      }
      await storage.set(dataToSave);
    } catch (e) {
      console.error("Failed to save selected model:", e);
    }
  } else {
    // Save to custom provider
    const prov = customProviders.find(p => p.id === activeProviderId);
    if (prov && cleanName) {
      prov.model = cleanName;
      selectedModel = cleanName;
      await saveProvidersToStorage();
      renderProviderSelect();
      renderProvidersList();
      triggerProviderStatusCheck();
    }
  }
  addLog("info", "model", `Active model set to: ${selectedModel}`);
}

// ── Key rotation & management state ──────────────────────────────────────────
let apiKeys = [];
let currentKeyIdx = 0;
const unmaskedKeyIndices = new Set();

async function loadKeys() {
  try {
    if (activeProviderId === "groq") {
      const res = await storage.get(["groq_api_keys"]);
      if (res && Array.isArray(res.groq_api_keys) && res.groq_api_keys.length > 0) {
        const validKeys = res.groq_api_keys
          .map(k => (typeof k === "string" ? k.trim() : ""))
          .filter(Boolean);
        apiKeys = validKeys.map(k => ({ key: k, exhausted: false }));
      } else {
        apiKeys = [];
      }
    } else {
      const prov = customProviders.find(p => p.id === activeProviderId);
      if (prov && Array.isArray(prov.apiKeys)) {
        apiKeys = prov.apiKeys
          .map(k => (typeof k === "string" ? k.trim() : ""))
          .filter(Boolean)
          .map(k => ({ key: k, exhausted: false }));
      } else {
        apiKeys = [];
      }
    }
  } catch (e) {
    apiKeys = [];
  }
  currentKeyIdx = 0;
  updateKeysUI();
}

async function saveKeysToStorage() {
  const keyStrings = apiKeys.map(k => k.key);
  try {
    if (activeProviderId === "groq") {
      await storage.set({ groq_api_keys: keyStrings });
    } else {
      const prov = customProviders.find(p => p.id === activeProviderId);
      if (prov) {
        prov.apiKeys = keyStrings;
        await saveProvidersToStorage();
      }
    }
  } catch (e) {
    console.error("Failed to save keys to storage:", e);
  }
}

function updateKeysUI() {
  const total = apiKeys.length;
  const activeCount = apiKeys.filter(k => !k.exhausted).length;
  
  if (keysBadge) keysBadge.textContent = String(total);
  if (modalKeysCountTag) modalKeysCountTag.textContent = `${activeCount} / ${total} active`;

  const prov = getActiveProvider();
  if (keysModalTitleText) {
    keysModalTitleText.textContent = `${prov.name} API Keys`;
  }
  if (newKeyInput) {
    newKeyInput.placeholder = `Paste ${prov.name} API Key...`;
  }
  if (addKeyLabel) {
    addKeyLabel.textContent = `Add ${prov.name} API Key`;
  }

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
    const prov = getActiveProvider();
    const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i.test(prov.url);
    const hint = isLocal ? "Keys are optional for local endpoints." : `Add a ${prov.name} API key manually or import from a .txt file.`;
    keysListContainer.innerHTML = `
      <div class="keys-empty">
        <span class="material-symbols-rounded" style="font-size: 32px; opacity:0.5; display:block; margin-bottom: 8px;">vpn_key_off</span>
        <div>No API keys present. ${hint}</div>
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
    const prov = getActiveProvider();
    addLog("info", "keys", `Added ${addedCount} new API key(s) for ${prov.name}. Total keys: ${apiKeys.length}`);
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

// ── Logging & History Persistence ───────────────────────────────────────────────
let chatHistory = [];

async function loadChatHistory() {
  try {
    const data = await storage.get(["chat_history"]);
    if (Array.isArray(data.chat_history) && data.chat_history.length > 0) {
      chatHistory = data.chat_history;
      if (logEmpty) logEmpty.style.display = "none";
      chatHistory.forEach(item => {
        if (item.kind === "log") {
          renderLogEntryDOM(item.type, item.label, item.message);
        } else if (item.kind === "answer") {
          renderAnswerCardDOM(item.optionText, item.isSuccess);
        }
      });
      if (logArea) logArea.scrollTop = logArea.scrollHeight;
    }
  } catch (e) {}
}

async function saveChatHistory() {
  try {
    if (chatHistory.length > 100) chatHistory = chatHistory.slice(-100);
    await storage.set({ chat_history: chatHistory });
  } catch (e) {}
}

function renderLogEntryDOM(type, label, message) {
  if (!logArea) return;
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  const formattedMsg = escapeHtml(message).replace(/\n/g, "<br>");
  entry.innerHTML = `<div class="log-dot"></div><div class="log-content"><div class="log-label">${label}</div>${formattedMsg}</div>`;
  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
}

function addLog(type, label, message) {
  if (!message || !String(message).trim()) return;
  if (logEmpty) logEmpty.style.display = "none";
  renderLogEntryDOM(type, label, message);
  chatHistory.push({ kind: "log", type, label, message });
  saveChatHistory();
}

function renderAnswerCardDOM(optionText, isSuccess = true) {
  if (!logArea) return;
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
      let isVerified = false;
      try {
        const parsed = JSON.parse(resultMsg);
        isVerified = parsed.verified === true;
      } catch {
        isVerified = resultMsg && !resultMsg.includes("NOT_FOUND") && !resultMsg.includes("ERROR");
      }
      const statusTag = entry.querySelector(".answer-status-tag");
      if (statusTag) {
        if (isVerified) {
          statusTag.className = "answer-status-tag success";
          statusTag.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> Selected ✓`;
        } else {
          statusTag.className = "answer-status-tag warning";
          statusTag.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">warning</span> Selection unconfirmed`;
        }
      }
    }
    btn.disabled = false;
  });

  logArea.appendChild(entry);
  logArea.scrollTop = logArea.scrollHeight;
  return entry;
}

function addAnswerCard(optionText, isSuccess = true) {
  if (!optionText) return;
  if (logEmpty) logEmpty.style.display = "none";
  const entry = renderAnswerCardDOM(optionText, isSuccess);
  chatHistory.push({ kind: "answer", optionText, isSuccess });
  saveChatHistory();
  return entry;
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
  try {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    }
  } catch (e) {}
  return { id: 1, url: window.location.href, title: document.title };
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
        const seenInputs = new Set();

        function addDetectedOption(text, val, checked, id, idx) {
          const clean = (text || "").replace(/\s+/g, " ").trim();
          if (!clean || clean.length > 300) return;
          radioOptions.push({
            index: radioOptions.length,
            value: val || clean,
            text: clean,
            checked: !!checked,
            id: id || ""
          });
        }

        // 1. Scan standard radio & checkbox inputs
        const allRadios = [...document.querySelectorAll("input[type=radio], input[type=checkbox]")].filter(r => {
          if (r.name && /(theme|mode|consent|agree|terms|dark|light)/i.test(r.name)) return false;
          return true;
        });

        allRadios.forEach((r, idx) => {
          if (seenInputs.has(r)) return;
          seenInputs.add(r);

          let text = "";
          // Associated label via for=
          if (r.id) {
            try {
              const lbl = document.querySelector(`label[for="${CSS.escape(r.id)}"]`);
              if (lbl) text = lbl.innerText.trim();
            } catch(e){}
          }
          // Parent label
          if (!text) {
            const parentLbl = r.closest("label");
            if (parentLbl) text = parentLbl.innerText.trim();
          }
          // Sibling label or text container
          if (!text && r.parentElement) {
            const sibLbl = r.parentElement.querySelector("label");
            if (sibLbl) text = sibLbl.innerText.trim();
          }
          // Closest option container (Angular Material, Bootstrap, PrimeNG, etc.)
          if (!text) {
            const container = r.closest("mat-radio-button, .mat-radio-button, .form-check, .custom-control, .option, .choice, [class*='option'], [class*='choice'], [class*='radio'], li, td, tr") || r.parentElement;
            if (container) {
              const clone = container.cloneNode(true);
              clone.querySelectorAll("input, button, script, style").forEach(n => n.remove());
              text = clone.innerText.trim();
            }
          }
          // Fallback to value or aria-label
          if (!text) {
            text = r.getAttribute("aria-label") || (r.value && r.value !== "on" ? r.value : "");
          }
          // Resilient fallback for math / icon / image options
          if (!text) {
            text = `Option ${String.fromCharCode(65 + idx)}`;
          }

          addDetectedOption(text, r.value, r.checked, r.id, idx);
        });

        // 2. Scan custom assessment options (Angular, React, Vue, Material, etc.)
        if (radioOptions.length < 2) {
          const customSelectors = [
            "mat-radio-button",
            ".mat-radio-button",
            "[role=radio]",
            "[role=option]",
            ".p-radiobutton",
            ".ant-radio-wrapper",
            ".option",
            ".choice",
            ".answer-option",
            ".q-option",
            "[class*='option-item']",
            "[class*='choice-item']",
            "[data-option]"
          ];
          const customEls = [...document.querySelectorAll(customSelectors.join(","))];
          const leafEls = customEls.filter(el => !customEls.some(other => other !== el && el.contains(other)));
          leafEls.forEach((el, idx) => {
            const text = (el.innerText || `Option ${String.fromCharCode(65 + idx)}`).trim();
            if (!text || text.length > 300) return;
            const isChecked = el.getAttribute("aria-checked") === "true"
              || el.classList.contains("selected")
              || el.classList.contains("active")
              || el.classList.contains("checked")
              || el.classList.contains("mat-radio-checked")
              || !!el.querySelector("input:checked, [aria-checked='true'], .selected, .active, .checked, .mat-radio-checked");
            addDetectedOption(text, text, isChecked, el.id || "", idx);
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
          bodyText: bodyText.slice(0, 2500),
          clickables, radioOptions, questionNumber: qNum
        };
      }
    });
    return r[0].result;
  } catch { return null; }
}

// ── Unified LLM API Call ──────────────────────────────────────────────────────
async function callLLM(messages, retries = 0, fallbackConfig = {}) {
  const provider = getActiveProvider();
  const providerName = provider ? provider.name : "Groq";
  const endpointUrl = provider ? normalizeEndpointUrl(provider.url) : GROQ_URL;
  const isGroq = !provider || provider.id === "groq";

  const key = getActiveKey();
  const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i.test(endpointUrl);
  if (!key && isGroq) {
    throw new Error("No API keys available! Please add a Groq API key manually or import from a .txt file.");
  }

  const modelToUse = (provider && provider.model) ? provider.model : (selectedModel || DEFAULT_MODEL);
  const payload = {
    model: modelToUse,
    messages,
    temperature: 0.5,
    max_tokens: 1024,
    top_p: 0.95
  };

  // Add reasoning_effort only for supported models on Groq if not in fallback mode
  const supportsReasoning = isGroq && (modelToUse.includes("qwen") || modelToUse.includes("gpt-oss")) && !fallbackConfig.noReasoning;
  if (supportsReasoning) {
    payload.reasoning_effort = "default";
  }

  const headers = { "Content-Type": "application/json" };
  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
  }
  if (endpointUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://github.com/infernoGurala/Luna-CRT";
    headers["X-Title"] = "Luna cool girl";
  }

  notifyTabProcessUpdate({
    status: "Processing",
    progress: 50,
    currentStep: 3,
    stepUpdates: [
      { id: 1, status: "completed", detail: "Scanned page DOM context" },
      { id: 2, status: "completed", detail: "Payload structured successfully" },
      { id: 3, status: "active", detail: `Querying ${providerName} (${modelToUse})...` }
    ],
    logText: `🧠 Requesting AI reasoning from ${providerName} (${modelToUse})`
  });

  let res;
  try {
    res = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  } catch (networkErr) {
    notifyTabProcessUpdate({
      status: "Error",
      statusText: "Status: Error",
      stepUpdates: [{ id: 3, status: "error", detail: `Connection error: ${networkErr.message}` }],
      logText: `❌ Network error connecting to ${providerName}`,
      logType: "error"
    });
    throw new Error(`Network error connecting to ${providerName} (${endpointUrl}): ${networkErr.message}`);
  }

  // Handle 401 Unauthorized (Invalid / Revoked API Key)
  if (res.status === 401) {
    let authDetail = "Invalid API Key or unauthorized";
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) authDetail = errJson.error.message;
    } catch {}
    
    addLog("error", "auth", `⚠️ ${providerName} Key #${currentKeyIdx + 1} rejected (401): ${authDetail}`);
    if (apiKeys.length > 0) markKeyExhausted();
    
    if (apiKeys.length > 1 && retries < apiKeys.length - 1) {
      await sleep(300);
      return callLLM(messages, retries + 1, fallbackConfig);
    }
    const consoleHelp = isGroq ? "in Groq Console (console.groq.com/keys)" : `for ${providerName}`;
    throw new Error(`All API keys failed authentication (401). Please verify your keys ${consoleHelp}.`);
  }

  // Handle 429 Rate Limit (RPM / TPM exceeded)
  if (res.status === 429) {
    let rateDetail = "Rate limit reached (429)";
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) rateDetail = errJson.error.message;
    } catch {}

    addLog("info", "rate-limit", `⏳ ${providerName} Key #${currentKeyIdx + 1} rate-limited: ${rateDetail}`);
    if (apiKeys.length > 0) markKeyExhausted();

    if (apiKeys.length > 1 && retries < apiKeys.length - 1) {
      // Delay 1.5s before rotating to avoid burst rate limiting
      await sleep(1500);
      return callLLM(messages, retries + 1, fallbackConfig);
    }
    throw new Error(`${providerName} rate limit exceeded: ${rateDetail}\nPlease wait a few moments before continuing.`);
  }

  // Handle other HTTP errors (400, 404, 500, etc.)
  if (!res.ok) {
    let errDetail = `HTTP ${res.status}`;
    let errJson = null;
    try {
      errJson = await res.json();
      if (errJson?.error?.message) {
        errDetail = `${res.status} - ${errJson.error.message}`;
      } else if (errJson?.message) {
        errDetail = `${res.status} - ${errJson.message}`;
      }
    } catch {}

    // Graceful fallback if a model rejects reasoning_effort
    if (!fallbackConfig.noReasoning && payload.reasoning_effort && errDetail.toLowerCase().includes("reasoning_effort")) {
      return callLLM(messages, retries, { ...fallbackConfig, noReasoning: true });
    }

    throw new Error(`${providerName} error: ${errDetail}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message?.content;
  if (!choice) {
    throw new Error(`${providerName} returned an empty response.`);
  }

  notifyTabProcessUpdate({
    status: "Processing",
    progress: 75,
    currentStep: 4,
    stepUpdates: [
      { id: 3, status: "completed", detail: `Response received from ${providerName}` },
      { id: 4, status: "active", detail: "Applying answer actions to page..." }
    ],
    logText: `⚡ Received AI response payload (${choice.length} chars)`
  });

  return choice;
}
const callGroq = callLLM;

// ── System prompt ─────────────────────────────────────────────────────────────
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
- click_xy: {"x":NUMBER,"y":NUMBER}
- scroll: {"direction":"down","amount":400}
- type: {"selector":"text:PLACEHOLDER","text":"VALUE"}
- navigate: {"url":"https://..."}
- none: {}

━━━ STRICT RULES ━━━
1. Answer questions ONE BY ONE in sequential order — do NOT skip any question.
2. For MCQ: ALWAYS output EXACTLY [select_radio({"option":"A", "text":"..."}), click_next({})]
   - Specify BOTH "option" ("A", "B", "C", "D") AND the exact option "text".
3. NEVER use click_next if a SUBMIT button is visible — use none:{} instead.
4. NEVER click any button labeled Submit, Finish, or End Test.
5. Use EXACT option text from MCQ OPTIONS above — do not paraphrase.
6. Do the math step by step before choosing.
7. If no radio options visible, use [click_next()] to advance.
8. NEVER repeat an action on the same question.
9. NEVER output scroll actions — DO NOT SCROLL THE PAGE.`;
}

function cleanReasoningText(rawText) {
  if (!rawText) return "";
  let clean = rawText.trim();

  // Strip prompt template boilerplate instructions
  clean = clean.replace(/1\.\s*Carefully analyze the question[\s\S]*?3\.\s*Double-check your reasoning before concluding\./gi, "");
  clean = clean.replace(/1\.\s*The user requested to[\s\S]*?3\.\s*According to the allowed actions[\s\S]*?\./gi, "");
  clean = clean.replace(/^Final conclusion:\s*/i, "");

  // Remove XML tags & raw action arrays if any leaked into text
  clean = clean.replace(/<\/?(thinking|response|actions)>/gi, "");
  clean = clean.replace(/\[\s*\{[\s\S]*?"action"[\s\S]*?\}\s*\]/g, "");

  return clean.trim();
}

function parseAI(raw) {
  if (!raw) return { text: "", actions: [] };

  const rM = raw.match(/<response>([\s\S]*?)<\/response>/i);
  const tM = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const aM = raw.match(/<actions>([\s\S]*?)<\/actions>/i);

  let rawText = "";
  if (rM) {
    rawText = rM[1];
  } else if (tM) {
    rawText = tM[1];
  } else {
    rawText = raw.replace(/<actions>[\s\S]*?<\/actions>/gi, "");
  }

  const cleanText = cleanReasoningText(rawText);

  let actions = [];
  if (aM) {
    try { actions = JSON.parse(aM[1].trim()); } catch {
      const arrM = aM[1].match(/\[[\s\S]*\]/);
      if (arrM) { try { actions = JSON.parse(arrM[0]); } catch {} }
    }
  }

  // Fallback 1: Markdown code block containing JSON array
  if (actions.length === 0) {
    const codeBlockM = raw.match(/```(?:json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/i);
    if (codeBlockM) {
      try { actions = JSON.parse(codeBlockM[1].trim()); } catch {}
    }
  }

  // Fallback 2: Any raw JSON array with "action"
  if (actions.length === 0) {
    const jsonArrM = raw.match(/\[\s*\{[\s\S]*?"action"[\s\S]*?\}\s*\]/);
    if (jsonArrM) {
      try { actions = JSON.parse(jsonArrM[0]); } catch {}
    }
  }

  // Fallback 3: Infer option letter from text conclusion if AI didn't format action tags
  if (actions.length === 0) {
    const letterMatch = raw.match(/(?:correct\s+(?:option|answer)|conclusion|answer|option)\s*(?:is|:)?\s*[\(\[]?([A-E])[\)\]]?/i)
                     || raw.match(/\b([A-E])\s*(?:is\s+the\s+correct\s+answer|is\s+correct)\b/i);
    if (letterMatch) {
      const optLetter = letterMatch[1].toUpperCase();
      actions = [
        { action: "select_radio", params: { option: optLetter, text: optLetter } },
        { action: "click_next" }
      ];
    }
  }

  return { text: cleanText, actions };
}

// ── Execute actions ───────────────────────────────────────────────────────────
async function executeActions(tabId, actions) {
  for (const a of actions) {
    if (a.action === "none" || a.action === "scroll") continue;

    if (a.action === "select_radio") {
      const optionText = a.params?.text || a.params?.option || "";
      let res = "";
      try {
        const r = await chrome.scripting.executeScript({ target: { tabId }, func: runAction, args: [a] });
        res = r?.[0]?.result || "";
      } catch (e) {
        res = JSON.stringify({ success: false, verified: false, error: e.message });
      }

      let parsed = null;
      try { parsed = JSON.parse(res); } catch {}

      let isVerified = parsed?.verified === true;
      let isSuccess = parsed ? (parsed.success && parsed.verified) : (res && !res.includes("NOT_FOUND") && !res.includes("ERROR"));

      const cardEl = addAnswerCard(parsed?.text || optionText, isVerified || isSuccess);

      if (!isVerified) {
        addLog("info", "warn", `⚠️ Option "${optionText}" unconfirmed on first pass — retrying...`);
        await sleep(350);
        try {
          const r2 = await chrome.scripting.executeScript({ target: { tabId }, func: runAction, args: [a] });
          const res2 = r2?.[0]?.result || "";
          try {
            const p2 = JSON.parse(res2);
            if (p2?.verified) {
              isVerified = true;
              isSuccess = true;
              const tag = cardEl?.querySelector?.(".answer-status-tag");
              if (tag) {
                tag.className = "answer-status-tag success";
                tag.innerHTML = `<span class="material-symbols-rounded" style="font-size:14px;">check_circle</span> Auto-selected`;
              }
            }
          } catch(e){}
        } catch(e){}
      }

      // Dwell 800ms for web portal component state & auto-save to persist
      await sleep(800);
    } else if (a.action === "click_next") {
      // Safety: Ensure an answer is checked in the DOM before advancing
      try {
        const checkRes = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const hasAnySelected = () => {
              if (document.querySelector("input[type=radio]:checked, input[type=checkbox]:checked")) return true;
              if (document.querySelector("[role=radio][aria-checked='true'], [role=option][aria-selected='true']")) return true;
              if (document.querySelector(".mat-radio-checked, .ant-radio-checked, .p-radiobutton-checked")) return true;
              if (document.querySelector(".option.selected, .option.active, .choice.selected, .choice.active")) return true;
              return false;
            };
            const hasOptions = document.querySelectorAll("input[type=radio], [role=radio], .mat-radio-button, .option, .choice").length > 0;
            return { hasOptions, selected: hasAnySelected() };
          }
        });
        const state = checkRes?.[0]?.result;
        if (state?.hasOptions && !state?.selected) {
          addLog("info", "warn", "⚠️ Answer unconfirmed before Next — enforcing selection now...");
          await chrome.scripting.executeScript({
            target: { tabId },
            func: runAction,
            args: [{ action: "select_radio", params: { option: "A", index: 0 } }]
          });
          await sleep(500);
        }
      } catch(e){}

      addLog("action", "→", `click_next()`);
      try {
        await chrome.scripting.executeScript({ target: { tabId }, func: runAction, args: [a] });
      } catch (e) { addLog("error", "fail", e.message); }
      await sleep(1500);
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
      await sleep(400);
    }
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

  switch(action) {
    case "scroll":
      break;

    case "click": {
      const el = find(params.selector);
      if (el) robustClick(el);
      else return "NOT_FOUND: " + params.selector;
      break;
    }

    case "click_next": {
      // Cooldown / debounce guard: prevent duplicate executions within 1000ms
      const now = Date.now();
      if (window.__lastNextClickTime && (now - window.__lastNextClickTime < 1000)) {
        return "DEBOUNCED: Advance already in progress";
      }

      // Helper to check if an option is currently selected
      const hasAnySelected = () => {
        if (document.querySelector("input[type=radio]:checked, input[type=checkbox]:checked")) return true;
        if (document.querySelector("[role=radio][aria-checked='true'], [role=option][aria-selected='true']")) return true;
        if (document.querySelector(".mat-radio-checked, .ant-radio-checked, .p-radiobutton-checked")) return true;
        if (document.querySelector(".option.selected, .option.active, .choice.selected, .choice.active")) return true;
        return false;
      };

      const hasOptions = document.querySelectorAll("input[type=radio], [role=radio], .mat-radio-button, .option, .choice").length > 0;
      if (hasOptions && !hasAnySelected()) {
        return "BLOCKED: No option selected yet. Answer must be selected before advancing.";
      }

      const allBtns = [...document.querySelectorAll("a, button, input[type=submit], input[type=button], [role=button]")];
      // HARDCODED: Never click Submit/Finish/End buttons
      const isSubmit = el => /(submit|finish|end test|end quiz|done)/i.test((el.innerText || el.value || "").trim());
      const eligible = allBtns.filter(el => !isSubmit(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.offsetParent !== null);

      // STRICT EXCLUSIVITY: Pick EXACTLY ONE button to advance
      // Priority 1: Save & Next / Save and Next / Save & Proceed / Save & Continue
      let btn = eligible.find(el => /(save\s*(&|and|\+)?\s*(next|proceed|continue)|save\s+next)/i.test((el.innerText || el.value || "").trim()));

      // Priority 2: Next Question / Next / Continue / Proceed / Forward Arrow
      if (!btn) {
        btn = eligible.find(el => /\bnext\s*(question)?\b/i.test((el.innerText || el.value || "").trim()))
           || eligible.find(el => /\b(continue|proceed)\b/i.test((el.innerText || el.value || "").trim()))
           || eligible.find(el => /next/i.test((el.innerText || el.value || "").trim()))
           || eligible.find(el => /→|>|»/.test((el.innerText || "").trim()));
      }

      // Priority 3: Standalone Save (only if no Next button of any kind exists)
      if (!btn) {
        btn = eligible.find(el => /^\s*save\s*$/i.test((el.innerText || el.value || "").trim()));
      }

      if (btn) {
        window.__lastNextClickTime = now;
        try { btn.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch(e){}

        const clickProps = { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0 };
        // Dispatch mouse preparation events — DO NOT dispatch "click" in the array!
        ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(t => {
          try { btn.dispatchEvent(new MouseEvent(t, clickProps)); } catch(e){}
        });

        // Exactly ONE click invocation
        let clicked = false;
        try {
          btn.click();
          clicked = true;
        } catch(e) {}
        if (!clicked) {
          try { btn.dispatchEvent(new MouseEvent("click", clickProps)); } catch(e){}
        }

        return "clicked: " + (btn.innerText || btn.value || "button").trim();
      }
      return "NOT_FOUND: next button (Submit blocked)";
    }

    case "click_xy": {
      const el = document.elementFromPoint(params.x, params.y);
      if (el) robustClick(el);
      break;
    }

    case "select_radio": {
      // 1. Parse option letter index from params.option, params.index, or params.text
      let targetIdx = -1;
      if (params.option) {
        const oStr = String(params.option).trim().toUpperCase();
        const m = oStr.match(/\b([A-E])\b/) || oStr.match(/^[A-E]$/);
        if (m) targetIdx = m[1].charCodeAt(0) - 65;
        else if (/^[1-5]$/.test(oStr)) targetIdx = parseInt(oStr) - 1;
      }
      if (targetIdx === -1 && params.index !== undefined && Number.isInteger(params.index)) {
        targetIdx = params.index;
      }

      const rawText = String(params.text || "").trim();
      const rawTarget = (rawText || (params.option ? String(params.option) : "")).trim();
      const lowerTarget = rawTarget.toLowerCase();

      if (targetIdx === -1) {
        const letterMatch = lowerTarget.match(/^(?:option\s+)?\(?([a-e])\)?(?:\s*[\.\:\-\)]|\s+|$)/i);
        if (letterMatch) {
          targetIdx = letterMatch[1].toLowerCase().charCodeAt(0) - 97;
        } else if (/^[a-e]$/i.test(lowerTarget)) {
          targetIdx = lowerTarget.charCodeAt(0) - 97;
        }
      }

      // Core text without leading Option letters like "A)", "A.", "(A)", "1)", "Option A:"
      const coreTarget = lowerTarget
        .replace(/^(?:option\s+)?\(?[a-e0-9]\)?(?:\s*[\.\:\-\)]\s*|\s+)/i, "")
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
        .trim();

      // Discover all candidate options on the page
      const candidates = [];
      const seenNodes = new Set();

      // 1. Scan standard radios & checkboxes
      const allRadios = [...document.querySelectorAll("input[type=radio], input[type=checkbox]")].filter(r => {
        if (r.name && /(theme|mode|consent|agree|terms|dark|light)/i.test(r.name)) return false;
        return true;
      });

      allRadios.forEach((r, idx) => {
        let lbl = null;
        if (r.id) {
          try { lbl = document.querySelector(`label[for="${CSS.escape(r.id)}"]`); } catch(e){}
        }
        if (!lbl) lbl = r.closest("label");
        if (!lbl && r.parentElement) lbl = r.parentElement.querySelector("label");
        const container = r.closest("mat-radio-button, .mat-radio-button, .form-check, .custom-control, .option, .choice, [class*='option'], [class*='choice'], [class*='radio'], li, td, tr") || r.closest("label") || r.parentElement;

        let txt = (lbl?.innerText || "").trim();
        if (!txt && container) {
          const clone = container.cloneNode(true);
          clone.querySelectorAll("input, button, script, style").forEach(n => n.remove());
          txt = clone.innerText.trim();
        }
        if (!txt) txt = r.getAttribute("aria-label") || (r.value && r.value !== "on" ? r.value : "");

        seenNodes.add(r);
        if (container) seenNodes.add(container);
        if (lbl) seenNodes.add(lbl);
        candidates.push({ input: r, label: lbl, container: container || lbl || r, text: txt || `Option ${String.fromCharCode(65 + idx)}`, idx });
      });

      // 2. Scan custom assessment options (Angular, React, Vue, Material)
      if (candidates.length < 2) {
        const customSelectors = [
          "mat-radio-button",
          ".mat-radio-button",
          "[role=radio]",
          "[role=option]",
          ".p-radiobutton",
          ".ant-radio-wrapper",
          ".option",
          ".choice",
          ".answer-option",
          ".q-option",
          "[class*='option-item']",
          "[class*='choice-item']",
          "[data-option]"
        ];
        const customEls = [...document.querySelectorAll(customSelectors.join(","))];
        const leafCustom = customEls.filter(el => !customEls.some(other => other !== el && el.contains(other)));
        leafCustom.forEach((el, idx) => {
          if (seenNodes.has(el)) return;
          seenNodes.add(el);
          const inp = el.querySelector("input[type=radio], input[type=checkbox]");
          const lbl = el.tagName === "LABEL" ? el : el.querySelector("label");
          candidates.push({ input: inp, label: lbl, container: el, text: (el.innerText || `Option ${String.fromCharCode(65 + idx)}`).trim(), idx });
        });
      }

      function applySelection(cand) {
        if (!cand) return false;
        const { input, label, container } = cand;
        const clickList = [];
        if (label) clickList.push(label);
        if (container && !clickList.includes(container)) clickList.push(container);
        if (input && !clickList.includes(input)) clickList.push(input);

        const dot = container?.querySelector?.(".custom-control-label, .checkmark, .radio-btn, .mat-radio-inner-circle, .mat-radio-outer-circle, .mat-radio-container, span[class*='radio'], span[class*='check'], span[class*='dot'], span[class*='circle']");
        if (dot && !clickList.includes(dot)) clickList.unshift(dot);

        const clickProps = { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0 };
        const mouseEvents = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];

        // 1. Natural coordinate click on the option circle / radio element
        const primaryEl = dot || label || container || input;
        if (primaryEl) {
          try {
            primaryEl.scrollIntoView?.({ block: "nearest", inline: "nearest" });
            const rect = primaryEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const clickX = rect.left + Math.min(24, Math.max(8, rect.width / 4));
              const clickY = rect.top + rect.height / 2;
              const targetEl = document.elementFromPoint(clickX, clickY) || primaryEl;
              mouseEvents.forEach(evt => {
                try { targetEl.dispatchEvent(new MouseEvent(evt, clickProps)); } catch(e){}
              });
              try { targetEl.click(); } catch(e){}
            }
          } catch(e){}
        }

        // 2. Direct event dispatch to all candidate elements
        for (const el of clickList) {
          mouseEvents.forEach(evt => {
            try { el.dispatchEvent(new MouseEvent(evt, clickProps)); } catch(e){}
          });
          try { el.click(); } catch(e){}
        }

        // 3. Native property update and change/input event dispatch
        if (input) {
          try {
            if (!input.checked) {
              const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
              if (nativeSet) nativeSet.call(input, true);
              else input.checked = true;
            }
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          } catch(e){}
        }

        // 4. Update aria & CSS state
        if (container) {
          try {
            if (container.getAttribute("role") === "radio") container.setAttribute("aria-checked", "true");
            container.classList.add("selected", "active", "checked");
          } catch(e){}
        }

        return true;
      }

      function checkVerified(cand) {
        if (!cand) return false;
        const { input, label, container } = cand;
        if (input && input.checked) return true;
        const checkables = [input, label, container].filter(Boolean);
        for (const el of checkables) {
          if (el.getAttribute?.("aria-checked") === "true") return true;
          const cls = String(el.className || "");
          if (/(selected|active|checked|chosen|answered|mat-radio-checked)/i.test(cls)) return true;
          if (el.querySelector?.("input:checked, [aria-checked='true'], .selected, .active, .checked, .mat-radio-checked")) return true;
        }

        // Check if any radio matching cand became checked
        const anyChecked = document.querySelector("input[type=radio]:checked, [role=radio][aria-checked='true'], .mat-radio-checked");
        if (anyChecked) {
          if (cand.container?.contains(anyChecked) || cand.input === anyChecked || cand.label?.contains(anyChecked)) {
            return true;
          }
        }
        return false;
      }

      // Match best candidate
      let matchedCand = null;

      // 1. Direct index match if option letter was provided (A=0, B=1, C=2, D=3)
      if (targetIdx >= 0 && targetIdx < candidates.length) {
        matchedCand = candidates[targetIdx];
      }

      // 2. Score by text
      let bestScore = -1;
      let textBest = null;
      for (const c of candidates) {
        const cTxt = c.text.toLowerCase().trim();
        const cleanCTxt = cTxt
          .replace(/^(?:option\s+)?\(?[a-e0-9]\)?(?:\s*[\.\:\-\)]\s*|\s+)/i, "")
          .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
          .trim();

        let score = 0;
        if (cTxt === lowerTarget || cleanCTxt === coreTarget || cTxt === coreTarget) {
          score = 100;
        } else if (coreTarget.length >= 2) {
          if (cleanCTxt.startsWith(coreTarget) || cTxt.startsWith(coreTarget)) score = 85;
          else if (cleanCTxt.includes(coreTarget) || cTxt.includes(coreTarget)) score = 70;
          else if (coreTarget.includes(cleanCTxt) && cleanCTxt.length >= 3) score = 60;
        }

        // Agreement bonus if candidate index matches option letter
        if (targetIdx >= 0 && c.idx === targetIdx) {
          score += 25;
        }

        if (score > bestScore) {
          bestScore = score;
          textBest = c;
        }
      }

      if (bestScore >= 60 && textBest) {
        matchedCand = textBest;
      } else if (!matchedCand && textBest && bestScore > 0) {
        matchedCand = textBest;
      }

      // 3. Fallback to candidate at targetIdx
      if (!matchedCand && targetIdx >= 0 && candidates.length > 0) {
        matchedCand = candidates[Math.min(targetIdx, candidates.length - 1)];
      }

      // 4. Fallback to general label search
      if (!matchedCand && (coreTarget || lowerTarget)) {
        const labels = [...document.querySelectorAll("label, .option, .choice, mat-radio-button")];
        let lbl = labels.find(l => {
          const t = l.innerText.toLowerCase().trim();
          return t === lowerTarget || t === coreTarget || (coreTarget.length >= 3 && t.includes(coreTarget));
        });
        if (lbl) {
          const inp = lbl.querySelector?.("input[type=radio]") || lbl.parentElement?.querySelector?.("input[type=radio]");
          matchedCand = { input: inp, label: lbl.tagName === "LABEL" ? lbl : null, container: lbl, text: lbl.innerText.trim(), idx: 0 };
        }
      }

      // 5. Final fallback to first candidate if options exist
      if (!matchedCand && candidates.length > 0) {
        matchedCand = candidates[0];
      }

      if (matchedCand) {
        applySelection(matchedCand);
        let verified = checkVerified(matchedCand);

        // Active retry on failure
        if (!verified && matchedCand.container) {
          try {
            const rect = matchedCand.container.getBoundingClientRect();
            const centerEl = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            if (centerEl) {
              ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(evt => {
                try { centerEl.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0 })); } catch(e){}
              });
              try { centerEl.click(); } catch(e){}
            }
          } catch(e){}
          verified = checkVerified(matchedCand);
        }

        return JSON.stringify({
          success: true,
          verified,
          text: matchedCand.text,
          idx: matchedCand.idx
        });
      }

      return JSON.stringify({
        success: false,
        verified: false,
        error: "NOT_FOUND option: " + rawTarget
      });
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
      const now = Date.now();
      if (window.__lastNextClickTime && (now - window.__lastNextClickTime < 1000)) {
        return;
      }

      // If MCQ options exist and none is selected, auto-select the first option before forcing advance
      const hasAnySelected = () => {
        if (document.querySelector("input[type=radio]:checked, input[type=checkbox]:checked")) return true;
        if (document.querySelector("[role=radio][aria-checked='true'], [role=option][aria-selected='true']")) return true;
        if (document.querySelector(".mat-radio-checked, .ant-radio-checked, .p-radiobutton-checked")) return true;
        if (document.querySelector(".option.selected, .option.active, .choice.selected, .choice.active")) return true;
        return false;
      };

      const hasOptions = document.querySelectorAll("input[type=radio], [role=radio], .mat-radio-button, .option, .choice").length > 0;
      if (hasOptions && !hasAnySelected()) {
        const firstOpt = document.querySelector("input[type=radio], [role=radio], .mat-radio-button, .option, .choice");
        if (firstOpt) {
          try {
            firstOpt.click();
            if (firstOpt.type === "radio") firstOpt.checked = true;
          } catch(e){}
        }
      }

      const allBtns = [...document.querySelectorAll("a, button, input[type=submit], input[type=button], [role=button]")];
      // HARDCODED: Never force-click Submit/Finish/End buttons
      const isSubmit = el => /(submit|finish|end test|end quiz|done)/i.test((el.innerText || el.value || "").trim());
      const eligible = allBtns.filter(el => !isSubmit(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.offsetParent !== null);

      // STRICT EXCLUSIVITY: Pick EXACTLY ONE button
      // Priority 1: Save & Next / Save and Next / Save & Proceed / Save & Continue
      let btn = eligible.find(el => /(save\s*(&|and|\+)?\s*(next|proceed|continue)|save\s+next)/i.test((el.innerText || el.value || "").trim()));

      // Priority 2: Next / Continue / Proceed
      if (!btn) {
        btn = eligible.find(el => /\bnext\s*(question)?\b/i.test((el.innerText || el.value || "").trim()))
           || eligible.find(el => /\b(continue|proceed)\b/i.test((el.innerText || el.value || "").trim()))
           || eligible.find(el => /next/i.test((el.innerText || el.value || "").trim()))
           || eligible.find(el => /→|>|»/.test((el.innerText || "").trim()));
      }

      // Priority 3: Standalone Save (only if no Next button of any kind exists)
      if (!btn) {
        btn = eligible.find(el => /^\s*save\s*$/i.test((el.innerText || el.value || "").trim()));
      }

      if (btn) {
        window.__lastNextClickTime = now;
        try { btn.scrollIntoView?.({ block: "nearest", inline: "nearest" }); } catch(e){}

        const clickProps = { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0 };
        // Dispatch mouse preparation events — DO NOT dispatch "click" in the array!
        ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(t => {
          try { btn.dispatchEvent(new MouseEvent(t, clickProps)); } catch(e){}
        });

        let clicked = false;
        try {
          btn.click();
          clicked = true;
        } catch(e){}
        if (!clicked) {
          try { btn.dispatchEvent(new MouseEvent("click", clickProps)); } catch(e){}
        }
      }
    }
  });
}

async function navigateToQuestion(tabId, targetQNum) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: (targetQ) => {
        const qStr = String(targetQ).trim();
        // Look for buttons, links, or clickable palette numbers matching targetQ
        const elements = [...document.querySelectorAll("button, a, [role=button], .q-box, .palette-item, [class*='question'], [class*='palette'], div, span")];
        const match = elements.find(el => {
          const txt = (el.innerText || "").trim();
          if (txt !== qStr) return false;
          const isClickable = el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button"
            || (el.className && /(palette|question|item|btn|box|cell|circle|qnum)/i.test(String(el.className)))
            || el.parentElement?.className?.includes("palette");
          return isClickable && el.offsetParent !== null;
        });

        if (match) {
          ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(t => {
            try { match.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, buttons: 1, button: 0 })); } catch(e){}
          });
          try { match.click(); } catch(e){}
          return true;
        }
        return false;
      },
      args: [targetQNum]
    });
    return res?.[0]?.result === true;
  } catch (e) {
    return false;
  }
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
    let preSnap = await getPageSnapshot(currentTab.id);
    if (!preSnap) { addLog("error","err","Cannot read page."); break; }

    // If no radio options detected, wait briefly in case Angular/React is still rendering the question
    if ((!preSnap.radioOptions || preSnap.radioOptions.length === 0) && !isTestFinished(preSnap)) {
      for (let w = 0; w < 6; w++) {
        await sleep(350);
        const retrySnap = await getPageSnapshot(currentTab.id);
        if (retrySnap?.radioOptions && retrySnap.radioOptions.length > 0) {
          preSnap = retrySnap;
          break;
        }
      }
    }

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
    const provName = getActiveProvider().name.toLowerCase();
    const hasSelectRadio = actions.some(a => a.action === "select_radio");
    if (text && !hasSelectRadio) {
      addLog("agent", provName, text);
    }

    // HARDCODED: Strip any submit/finish actions before executing
    let safeActions = actions.filter(a => {
      if (a.action === "click" && /submit|finish|end/i.test(a.params?.selector || "")) return false;
      return true;
    });

    const hasRadioOnPage = (preSnap.radioOptions || []).length > 0;
    const hasSelectRadioAction = safeActions.some(a => a.action === "select_radio");

    if (hasRadioOnPage && !hasSelectRadioAction) {
      // AI omitted select_radio: auto-detect chosen option from text or default to A
      const letterMatch = (text || "").match(/\b([A-E])\b/) || (raw || "").match(/\b([A-E])\b/);
      const chosenOpt = letterMatch ? letterMatch[1].toUpperCase() : "A";
      safeActions.unshift({
        action: "select_radio",
        params: { option: chosenOpt, text: chosenOpt }
      });
      addLog("info", "auto", `Auto-injected selection for Option [${chosenOpt}]`);
    }

    if (currentQ >= endQVal) {
      safeActions = safeActions.filter(a => a.action !== "click_next" && a.action !== "navigate");
    }

    // STRICT SANITIZATION: Ensure safeActions contains AT MOST ONE advancement action
    let seenAdvanceAction = false;
    safeActions = safeActions.filter(a => {
      const isAdvance = a.action === "click_next" || (a.action === "click" && /(next|save\s*(&|and)?\s*next|proceed|continue)/i.test(a.params?.selector || ""));
      if (isAdvance) {
        if (seenAdvanceAction) return false;
        seenAdvanceAction = true;
        a.action = "click_next";
      }
      return true;
    });

    const expectedNextQ = (currentQ !== null && !isNaN(currentQ)) ? (currentQ + 1) : null;

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
    if (!didClickNext && currentQ < endQVal) {
      addLog("info","warn","AI didn't use click_next — forcing advance...");
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

    // Safety & Self-Healing: Detect if portal skipped ahead over a question (e.g. Q17 -> Q19)
    const afterQ = result.qNum;
    if (expectedNextQ !== null && afterQ !== null && afterQ > expectedNextQ && expectedNextQ <= endQVal) {
      addLog("info", "warn", `⚠️ Jump detected: page is on Q${afterQ} (skipped Q${expectedNextQ}). Navigating to Q${expectedNextQ} via palette...`);
      const recovered = await navigateToQuestion(currentTab.id, expectedNextQ);
      if (recovered) {
        await sleep(1200);
        const checkSnap = await getPageSnapshot(currentTab.id);
        if (checkSnap?.questionNumber === expectedNextQ) {
          addLog("info", "done", `✓ Successfully recovered to Q${expectedNextQ}`);
        }
      }
    }

    await sleep(300);
  }

  if (answered >= MAX_Q) addLog("info","warn","Reached max questions limit. Stopping.");
}

// ── Main send handler ─────────────────────────────────────────────────────────
async function handleSend() {
  const userMsg = cmdInput.value.trim();
  if (!userMsg) return;
  const activeProv = getActiveProvider();
  const isLocalProv = /localhost|127\.0\.0\.1|0\.0\.0\.0|::1/i.test(activeProv.url);
  if (apiKeys.length === 0 && !isLocalProv) {
    addLog("error", "keys", `No API keys! Click ⚙ Keys to add your ${activeProv.name} API key.`);
    return;
  }

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
      const provName = getActiveProvider().name.toLowerCase();
      const hasSelectRadio = actions.some(a => a.action === "select_radio");
      if (text && !hasSelectRadio) {
        addLog("agent", provName, text);
      }
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

// ── Model Selection Listeners ────────────────────────────────────────────────
if (modelSelect) {
  modelSelect.addEventListener("change", async () => {
    const val = modelSelect.value;
    if (val === "custom") {
      if (customModelRow) customModelRow.style.display = "flex";
      if (customModelInput) {
        customModelInput.focus();
        const customVal = customModelInput.value.trim();
        if (customVal) {
          await setModel(customVal, true);
        }
      }
    } else {
      if (customModelRow) customModelRow.style.display = "none";
      await setModel(val, false);
    }
  });
}

if (saveCustomModelBtn) {
  saveCustomModelBtn.addEventListener("click", async () => {
    const val = (customModelInput?.value || "").trim();
    if (!val) {
      addLog("error", "model", "Please enter a valid model identifier.");
      return;
    }
    await setModel(val, true);
  });
}

if (customModelInput) {
  customModelInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = customModelInput.value.trim();
      if (val) {
        await setModel(val, true);
      }
    }
  });
}

// ── Provider Event Listeners ──────────────────────────────────────────────────
if (openProviderModalBtn) {
  openProviderModalBtn.addEventListener("click", () => {
    resetProviderForm();
    if (providerModalOverlay) providerModalOverlay.classList.add("active");
  });
}

if (closeProviderModalBtn) {
  closeProviderModalBtn.addEventListener("click", () => {
    if (providerModalOverlay) providerModalOverlay.classList.remove("active");
  });
}

if (providerModalOverlay) {
  providerModalOverlay.addEventListener("click", (e) => {
    if (e.target === providerModalOverlay) {
      providerModalOverlay.classList.remove("active");
    }
  });
}

if (cancelEditProviderBtn) {
  cancelEditProviderBtn.addEventListener("click", resetProviderForm);
}

if (saveProviderBtn) {
  saveProviderBtn.addEventListener("click", handleSaveProvider);
}

const clearAllProvidersBtn = document.getElementById("clearAllProvidersBtn");
if (clearAllProvidersBtn) {
  clearAllProvidersBtn.addEventListener("click", clearAllCustomProviders);
}

if (providerSelect) {
  providerSelect.addEventListener("change", async () => {
    const val = providerSelect.value;
    if (val === "__add_new__") {
      resetProviderForm();
      if (providerModalOverlay) providerModalOverlay.classList.add("active");
      if (provNameInput) provNameInput.focus();
      providerSelect.value = activeProviderId;
    } else if (val === "__manage__") {
      if (providerModalOverlay) providerModalOverlay.classList.add("active");
      providerSelect.value = activeProviderId;
      setTimeout(() => {
        const listContainer = document.getElementById("providersListContainer");
        if (listContainer) {
          listContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }, 50);
    } else {
      await switchProvider(val);
    }
  });
}

// Preset chips click listeners
document.querySelectorAll(".preset-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const key = chip.getAttribute("data-preset");
    const p = PRESETS[key];
    if (p) {
      if (provNameInput) provNameInput.value = p.name;
      if (provUrlInput) provUrlInput.value = p.url;
      if (provModelInput) provModelInput.value = p.model;
      if (p.key && provKeyInput) {
        provKeyInput.value = p.key;
      } else if (provKeyInput) {
        provKeyInput.focus();
      }
      showProviderFeedback(`Loaded ${p.name} preset.`, "success");
    }
  });
});

if (providerStatusBadge) {
  providerStatusBadge.addEventListener("click", () => {
    triggerProviderStatusCheck();
  });
}

if (toggleProvKeyPwBtn && provKeyInput) {
  toggleProvKeyPwBtn.addEventListener("click", () => {
    const isPw = provKeyInput.type === "password";
    provKeyInput.type = isPw ? "text" : "password";
    const icon = toggleProvKeyPwBtn.querySelector(".material-symbols-rounded");
    if (icon) icon.textContent = isPw ? "visibility_off" : "visibility";
  });
}

(async () => {
  await loadProviders();
  await loadKeys();
  await loadModel();
  await loadChatHistory();
  const tab = await getCurrentTab();
  if (tab?.url) updatePageUrlDisplay(tab.url);
})();

if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(async () => {
    const tab = await getCurrentTab();
    if (tab?.url) updatePageUrlDisplay(tab.url);
  });
}

if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      const currentTab = await getCurrentTab();
      if (currentTab && currentTab.id === tabId && currentTab.url) {
        updatePageUrlDisplay(currentTab.url);
      }
    }
  });
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "EXECUTE_ACTION") {
      const answerBtn = document.querySelector(".answer-current-btn");
      if (answerBtn) answerBtn.click();
    }
  });
}

