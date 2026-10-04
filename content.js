// Content script — injected into pages
// Provides a safe toast notification system for agent feedback

(function () {
  if (window.__agentInjected) return;
  window.__agentInjected = true;

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
        bottom: "30px",
        right: "30px",
        zIndex: "2147483647",
        display: "flex",
        flexDirection: "column",
        gap: "15px",
        pointerEvents: "none",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Roboto', 'Segoe UI', sans-serif"
      });

      const parent = document.body || document.documentElement;
      if (parent) {
        parent.appendChild(toastContainer);
      }
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
        padding: "15px 20px",
        borderRadius: "15px",
        fontSize: "16px",
        fontWeight: "500",
        maxWidth: "400px",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 15px -3px rgba(0, 0, 0, 0.1)",
        opacity: "0",
        transform: "translateY(20px)",
        transition: "all 0.3s cubic-bezier(0.2, 0, 0, 1)",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        letterSpacing: "0.1px"
      });

      toast.textContent = "🤖 " + message;
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
      });

      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    } catch (e) {
      // Gracefully ignore DOM/CSP errors
    }
  }

  // Listen for messages from popup
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "agent-toast") {
        showToast(msg.text, msg.variant || "action");
      }
    });
  } catch (e) {}

  window.__agentShowToast = showToast;
})();
