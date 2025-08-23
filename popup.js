// popup.js - Logic for the extension's popup UI.

const $ = sel => document.querySelector(sel);

// Store references to all UI elements
const ui = {
  startWarmupBtn: $("#startWarmupBtn"),
  startScanBtn: $("#startScanBtn"),
  reloadBtn: $("#reloadBtn"),
  clearDataBtn: $("#clearDataBtn"),
  statusChip: $("#statusChip"),
  statusText: $("#statusText"),
  step: $("#step"),
  cycles: $("#cycles"),
  accountCount: $("#accountCount"),
  repliesSent: $("#repliesSent"),
  globalLimit: $("#globalLimit"),
  saveGlobalLimit: $("#saveGlobalLimit"),
  accountsContainer: $("#accountsContainer"),
  aiReplyToggle: $("#aiReplyToggle"),
};

/**
 * Renders the list of scanned accounts and their settings.
 * @param {object} scanResults - Data from the account scan.
 * @param {object} perAccountLimits - Custom limits for each account.
 * @param {number} globalLimit - The default global limit.
 */
function renderAccounts(scanResults = {}, perAccountLimits = {}, globalLimit = 10) {
  ui.accountsContainer.innerHTML = ""; // Clear previous results
  const accountKeys = Object.keys(scanResults);
  ui.accountCount.textContent = String(accountKeys.length);

  if (accountKeys.length === 0) {
    ui.accountsContainer.innerHTML = `<p class="placeholder">No accounts found yet.</p>`;
    return;
  }

  accountKeys.forEach(key => {
    const accountIndex = key.replace("Account ", "");
    const info = scanResults[key] || {};
    const limit = perAccountLimits[accountIndex] ?? globalLimit;
    const accountDiv = document.createElement("div");
    accountDiv.className = "account";
    accountDiv.innerHTML = `
      <div class="account-header">${key}<span class="email">${info.email || ""}</span></div>
      <div class="account-stats">
        <div class="pill">📥 Inbox: ${info.inbox ?? 0}</div>
        <div class="pill">🚫 Spam: ${info.spam ?? 0}</div>
        <div class="pill">🏷️ Promotions: ${info.promotions ?? 0}</div>
      </div>
      <div class="setting-row">
        <label>Daily Limit:</label>
        <input type="number" min="1" step="1" value="${limit}" data-account-index="${accountIndex}" />
        <button class="btn small save-per-account" data-account-index="${accountIndex}">Save</button>
      </div>
    `;
    ui.accountsContainer.appendChild(accountDiv);
  });
}

/**
 * Main function to update the entire UI based on the current state from storage.
 * @param {object} data - The state object from chrome.storage.local.
 */
function syncUI(data) {
  const {
    isWarmingUp,
    isScanning,
    step,
    mailLimit,
    scanResults,
    perAccountLimits,
    repliesSentCount,
    isAiReplyEnabled
  } = data;

  // Update status chip
  ui.statusText.textContent = isWarmingUp ? "Running..." : "Ready";
  ui.statusChip.className = isWarmingUp ? "status-chip running" : "status-chip ready";
  
  // Update buttons state
  ui.startWarmupBtn.disabled = isWarmingUp || isScanning;
  ui.startScanBtn.disabled = isWarmingUp || isScanning;
  ui.startScanBtn.textContent = isScanning ? "Scanning..." : "🔍 Scan Accounts";

  // Update stats
  ui.step.textContent = step || "Idle";
  ui.globalLimit.value = mailLimit ?? 10;
  ui.cycles.textContent = `0 / ${mailLimit ?? 10}`;
  
  if(ui.repliesSent) {
    ui.repliesSent.textContent = repliesSentCount ?? 0;
  }
  if(ui.aiReplyToggle) {
    ui.aiReplyToggle.checked = !!isAiReplyEnabled;
  }

  // Render accounts section
  renderAccounts(scanResults, perAccountLimits, mailLimit);
}

/**
 * Sets up all event listeners for the popup.
 */
function initialize() {
  // --- Button Clicks ---
  ui.startWarmupBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startWarmup" });
  });

  ui.startScanBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startScan" });
  });

  ui.saveGlobalLimit.addEventListener("click", () => {
    const value = Number(ui.globalLimit.value) || 10;
    chrome.runtime.sendMessage({ action: "saveGlobalLimit", value });
  });

  ui.reloadBtn.addEventListener("click", () => {
    chrome.runtime.reload();
  });

  ui.clearDataBtn.addEventListener("click", () => {
    chrome.storage.local.clear(() => {
        chrome.runtime.reload();
    });
  });

  if(ui.aiReplyToggle) {
    ui.aiReplyToggle.addEventListener("change", (e) => {
        chrome.runtime.sendMessage({ action: "saveAiReplySetting", isEnabled: e.target.checked });
    });
  }

  // --- Event Delegation for Per-Account Saves ---
  ui.accountsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("save-per-account")) {
      const accountIndex = e.target.dataset.accountIndex;
      const input = ui.accountsContainer.querySelector(`input[data-account-index="${accountIndex}"]`);
      const value = Number(input.value) || 10;
      chrome.runtime.sendMessage({ action: "savePerAccountLimit", accountIndex, value });
    }
  });

  // --- Storage Listener for Live UI Updates ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      // When storage changes, fetch the whole state and re-sync the UI
      loadStateAndSync();
    }
  });

  // Initial load
  loadStateAndSync();
}

/**
 * Fetches the current state from storage and calls syncUI.
 */
function loadStateAndSync() {
  const keys = [
    "isWarmingUp", "isScanning", "step", "mailLimit",
    "scanResults", "perAccountLimits", "repliesSentCount", "isAiReplyEnabled"
  ];
  chrome.storage.local.get(keys, (data) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading state:", chrome.runtime.lastError);
      return;
    }
    syncUI(data);
  });
}

// Run the initialize function once the DOM is fully loaded.
document.addEventListener("DOMContentLoaded", initialize);
