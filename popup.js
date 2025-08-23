// popup.js

const $ = sel => document.querySelector(sel);
const el = {
  startWarmup: $("#startWarmupBtn"),
  startScan: $("#startScanBtn"),
  status: $("#status"),
  running: $("#runningCount"),
  reviewing: $("#reviewingCount"),
  clicked: $("#clickedCount"),
  sent: $("#sentCount"),
  accountCount: $("#accountCount"),
  isScanning: $("#isScanning"),
  step: $("#step"),
  globalLimit: $("#globalLimit"),
  saveGlobalLimit: $("#saveGlobalLimit"),
  accountsContainer: $("#accountsContainer"),
  seedlist: $("#seedlist"),
};

function renderAccounts(scanResults = {}, perAccountLimits = {}) {
  el.accountsContainer.innerHTML = "";
  const keys = Object.keys(scanResults);
  el.accountCount.textContent = String(keys.length);

  keys.forEach(key => {
    const idx = key.replace("Account ", "");
    const info = scanResults[key] || {};
    const limit = perAccountLimits[idx] ?? 10;

    const wrap = document.createElement("div");
    wrap.className = "account";
    wrap.innerHTML = `
      <h4>Account ${idx} <span class="muted">mail id: ${info.email || ""}</span></h4>
      <div class="counts">
        <div class="pill">📥 Inbox: ${info.inbox ?? 0}</div>
        <div class="pill">🚫 Spam: ${info.spam ?? 0}</div>
        <div class="pill">🏷️ Promotions: ${info.promotions ?? 0}</div>
        <div class="pill">Limit: ${limit}</div>
      </div>
      <div class="limit-row">
        <label class="small">Daily Limit:</label>
        <input type="number" min="1" step="1" value="${limit}" data-account-index="${idx}" />
        <button class="save-per-account" data-account-index="${idx}">💾 Save Per-Account Limit</button>
      </div>
    `;
    el.accountsContainer.appendChild(wrap);
  });

  // wire save per-account buttons
  el.accountsContainer.querySelectorAll(".save-per-account").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = btn.getAttribute("data-account-index");
      const input = el.accountsContainer.querySelector(`input[data-account-index="${idx}"]`);
      const value = Number(input.value) || 10;
      chrome.runtime.sendMessage({ action: "savePerAccountLimit", accountIndex: idx, value }, () => {});
    });
  });
}

function renderSeedlist(seedlist = []) {
  el.seedlist.innerHTML = "";
  if (!seedlist.length) {
    el.seedlist.innerHTML = `<div class="item muted">No items yet.</div>`;
    return;
  }
  seedlist.slice(-100).reverse().forEach(it => {
    const line = document.createElement("div");
    line.className = "item";
    line.textContent = `[${new Date(it.time).toLocaleTimeString()}] · A${it.accountIndex} · ${it.action.toUpperCase()} · ${it.senderEmail || ""} · ${it.subject || ""}`;
    el.seedlist.appendChild(line);
  });
}

function syncUI(data) {
  const {
    isWarmingUp, step, log,
    runningCount, reviewingCount, clickedCount, sentCount,
    isScanning, scanResults, mailLimit, seedlist, perAccountLimits
  } = data;

  el.status.textContent = isWarmingUp ? "⏳ Running..." : "✅ Ready.";
  el.step.textContent = step || "Idle";
  el.isScanning.textContent = isScanning ? "Yes" : "No";

  el.running.textContent = runningCount ?? 0;
  el.reviewing.textContent = reviewingCount ?? 0;
  el.clicked.textContent = clickedCount ?? 0;
  el.sent.textContent = sentCount ?? 0;

  el.globalLimit.value = mailLimit ?? 10;

  renderAccounts(scanResults || {}, perAccountLimits || {});
  renderSeedlist(seedlist || []);
}

function init() {
  el.startWarmup.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startWarmup" }, () => {});
  });

  el.startScan.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "startScan" }, () => {});
  });

  el.saveGlobalLimit.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "saveGlobalLimit", value: Number(el.globalLimit.value) || 10 }, () => {});
  });

  // initial load
  chrome.storage.local.get([
    "isWarmingUp","step","log",
    "runningCount","reviewingCount","clickedCount","sentCount",
    "isScanning","scanResults","mailLimit","seedlist","perAccountLimits"
  ], syncUI);

  // live updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    chrome.storage.local.get([
      "isWarmingUp","step","log",
      "runningCount","reviewingCount","clickedCount","sentCount",
      "isScanning","scanResults","mailLimit","seedlist","perAccountLimits"
    ], syncUI);
  });
}

document.addEventListener("DOMContentLoaded", init);
