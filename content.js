// Content script — injected into pages
// Luna CRT — Compact Live Process Manager HUD

(function () {
  if (window.__agentInjected) return;
  window.__agentInjected = true;

  // --- Toast System ---
  let toastContainer = null;

  function getOrCreateToastContainer() {
    if (toastContainer && document.contains(toastContainer)) {
      return toastContainer;
    }
    try {
      toastContainer = document.createElement("div");
      toastContainer.id = "__agent-toasts";
      Object.assign(toastContainer.style, {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: "2147483647",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none",
        fontFamily: "system-ui, -apple-system, sans-serif"
      });

      const parent = document.body || document.documentElement;
      if (parent) parent.appendChild(toastContainer);
      return toastContainer;
    } catch (e) {
      return null;
    }
  }

  function showToast(message, type = "action") {
    try {
      const container = getOrCreateToastContainer();
      if (!container) return;

      const colors = {
        action: { bg: "#2B2930", text: "#D0BCFF" },
        success: { bg: "#2B2930", text: "#A8E5A3" },
        error: { bg: "#8C1D18", text: "#F9DEDC" }
      };
      const c = colors[type] || colors.action;

      const toast = document.createElement("div");
      Object.assign(toast.style, {
        background: c.bg,
        color: c.text,
        padding: "10px 16px",
        borderRadius: "10px",
        fontSize: "13px",
        fontWeight: "500",
        maxWidth: "340px",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)",
        opacity: "0",
        transform: "translateY(12px)",
        transition: "all 0.25s cubic-bezier(0.2, 0, 0, 1)",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: "8px"
      });

      toast.textContent = "🤖 " + message;
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
      });

      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(6px)";
        setTimeout(() => toast.remove(), 250);
      }, 3000);
    } catch (e) {}
  }

  // --- Compact Live Process Card HUD ---
  let hudHost = null;
  let shadowRoot = null;

  const hudState = {
    visible: true,
    status: "Active", // Active, Processing, Completed, Error
    title: "Status: Active",
    detail: "Ready for commands",
    model: "Llama 3.3",
    progress: 0, // 0 to 100
    isProcessing: false
  };

  function createHud() {
    if (hudHost && document.contains(hudHost)) return;

    try {
      hudHost = document.createElement("div");
      hudHost.id = "__luna-live-hud";
      Object.assign(hudHost.style, {
        position: "fixed",
        top: "16px",
        right: "16px",
        zIndex: "2147483647",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      });

      shadowRoot = hudHost.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .card {
          width: 290px;
          background: rgba(24, 24, 37, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 12px 14px;
          color: #cdd6f4;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04);
          user-select: none;
          position: relative;
          overflow: hidden;
          transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
        }

        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #a6e3a1;
          box-shadow: 0 0 8px #a6e3a1;
          flex-shrink: 0;
          transition: background 0.3s, box-shadow 0.3s;
        }
        .dot.processing {
          background: #cba6f7;
          box-shadow: 0 0 10px #cba6f7;
          animation: pulse 1.2s infinite ease-in-out;
        }
        .dot.error {
          background: #f38ba8;
          box-shadow: 0 0 10px #f38ba8;
        }

        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.7; }
          50% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.7; }
        }

        .title {
          font-size: 13px;
          font-weight: 700;
          color: #f5e0dc;
          letter-spacing: 0.2px;
        }

        .badge {
          background: rgba(137, 180, 250, 0.14);
          color: #89b4fa;
          padding: 2px 7px;
          border-radius: 6px;
          font-size: 10.5px;
          font-weight: 700;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: #6c7086;
          width: 20px;
          height: 20px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        .detail {
          font-size: 11.5px;
          color: #bac2de;
          line-height: 1.35;
          word-break: break-word;
          min-height: 16px;
        }

        .progress-bar {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 2.5px;
          background: linear-gradient(90deg, #89b4fa, #cba6f7, #a6e3a1);
          border-radius: 0 2px 2px 0;
          transition: width 0.3s ease, opacity 0.3s ease;
          width: 0%;
          opacity: 0;
        }
        .progress-bar.active {
          opacity: 1;
        }
      `;
      shadowRoot.appendChild(style);

      const card = document.createElement("div");
      card.className = "card";
      card.id = "card";
      shadowRoot.appendChild(card);

      const parent = document.body || document.documentElement;
      if (parent) parent.appendChild(hudHost);

      renderHud();
    } catch (e) {}
  }

  function renderHud() {
    if (!shadowRoot) return;
    const card = shadowRoot.getElementById("card");
    if (!card) return;

    if (!hudState.visible) {
      hudHost.style.display = "none";
      return;
    }
    hudHost.style.display = "block";

    const dotClass = hudState.status === "Processing" ? "processing" : (hudState.status === "Error" ? "error" : "");
    const showProgress = hudState.isProcessing && hudState.progress > 0;

    card.innerHTML = `
      <div class="card-top">
        <div class="title-group">
          <div class="dot ${dotClass}"></div>
          <span class="title">${hudState.title}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="badge">${hudState.model}</span>
          <button class="close-btn" id="closeBtn" title="Hide (Alt+T)">✕</button>
        </div>
      </div>
      <div class="detail">${hudState.detail}</div>
      <div class="progress-bar ${showProgress ? 'active' : ''}" style="width: ${hudState.progress}%"></div>
    `;

    const closeBtn = shadowRoot.getElementById("closeBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        hudState.visible = false;
        renderHud();
      });
    }
  }

  function updateLiveProcess(data = {}) {
    createHud();

    if (data.status !== undefined) {
      hudState.status = data.status;
      if (data.status === "Processing") {
        hudState.isProcessing = true;
        hudState.title = data.statusText || "Processing...";
      } else {
        hudState.isProcessing = false;
        hudState.title = data.statusText || `Status: ${data.status}`;
      }
    }

    if (data.statusText !== undefined) hudState.title = data.statusText;
    if (data.detail !== undefined) hudState.detail = data.detail;
    if (data.logText && !data.detail) hudState.detail = data.logText;
    if (data.model !== undefined) hudState.model = data.model;
    if (data.progress !== undefined) hudState.progress = data.progress;
    if (data.visible !== undefined) hudState.visible = data.visible;

    renderHud();
  }

  function toggleHud() {
    createHud();
    hudState.visible = !hudState.visible;
    renderHud();
  }

  function triggerActionScan() {
    try {
      chrome.runtime.sendMessage({ type: "EXECUTE_ACTION" });
    } catch (e) {}
  }

  // Keyboard Shortcuts (Alt+T toggle, Alt+A action)
  window.addEventListener("keydown", (e) => {
    if (!e.altKey) return;
    const key = (e.key || "").toLowerCase();
    if (key === "t" || e.code === "KeyT") {
      e.preventDefault();
      toggleHud();
    } else if (key === "a" || e.code === "KeyA") {
      e.preventDefault();
      triggerActionScan();
    }
  });

  // Listener for extension runtime messages
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "agent-toast") {
        showToast(msg.text, msg.variant || "action");
      } else if (msg && msg.type === "TOGGLE_STATUS") {
        toggleHud();
      } else if (msg && msg.type === "EXECUTE_ACTION") {
        triggerActionScan();
      } else if (msg && msg.type === "UPDATE_PROCESS") {
        updateLiveProcess(msg);
      }
    });
  } catch (e) {}

  // Init on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createHud);
  } else {
    createHud();
  }

  window.__agentShowToast = showToast;
  window.__lunaUpdateProcess = updateLiveProcess;
})();

