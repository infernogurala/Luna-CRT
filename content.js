// Content script — injected into every page
// Provides a toast notification system for agent feedback

(function () {
  if (window.__agentInjected) return;
  window.__agentInjected = true;

  // Create toast container
  const toastContainer = document.createElement("div");
  toastContainer.id = "__agent-toasts";
  toastContainer.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    gap: 15px;
    pointer-events: none;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Roboto', 'Segoe UI', sans-serif;
  `;
  document.body?.appendChild(toastContainer);

  function showToast(message, type = "action") {
    // Material 3 Dark Theme Colors
    const colors = {
      action: { bg: "#2B2930", text: "#D0BCFF" }, // surface-container-high, primary
      success: { bg: "#2B2930", text: "#A8E5A3" }, // surface-container-high, custom green
      error: { bg: "#8C1D18", text: "#F9DEDC" }, // error-container, on-error-container
    };
    const c = colors[type] || colors.action;

    const toast = document.createElement("div");
    toast.style.cssText = `
      background: ${c.bg};
      color: ${c.text};
      padding: 15px 20px;
      border-radius: 15px;
      font-size: 18px;
      font-weight: 500;
      max-width: 400px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s cubic-bezier(0.2, 0, 0, 1);
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 12px;
      letter-spacing: 0.1px;
    `;
    toast.textContent = "🤖 " + message;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "agent-toast") {
      showToast(msg.text, msg.variant || "action");
    }
  });

  window.__agentShowToast = showToast;
})();
