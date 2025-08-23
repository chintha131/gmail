// background.js - The brain of the extension

// --- State Management ---
const initial_state = {
  // warmup
  isWarmingUp: false,
  step: "Idle",
  log: [],

  // scanning
  isScanning: false,
  scanResults: {},

  // limits
  mailLimit: 10,
  perAccountLimits: {},

  // live counters
  runningCount: 0,
  reviewingCount: 0,
  clickedCount: 0,
  sentCount: 0,

  // seedlist grows automatically
  seedlist: []
};

// Reset state
chrome.runtime.onInstalled.addListener(() => { chrome.storage.local.set(initial_state); });
chrome.runtime.onStartup.addListener(() => { chrome.storage.local.set(initial_state); });

// Helpers
async function addLog(message) {
  const data = await chrome.storage.local.get(["log"]);
  const newLog = [...(data.log || []), `[${new Date().toLocaleTimeString()}] ${message}`];
  await chrome.storage.local.set({ log: newLog });
  console.log("📝", message);
}
async function setStep(stepName) { await chrome.storage.local.set({ step: stepName }); }
async function bumpCounter(key, delta = 1) {
  const cur = await chrome.storage.local.get([key]);
  const next = Math.max(0, (cur[key] || 0) + delta);
  await chrome.storage.local.set({ [key]: next });
}
async function pushSeed(event) {
  const data = await chrome.storage.local.get(["seedlist"]);
  const item = { time: new Date().toISOString(), ...event };
  await chrome.storage.local.set({ seedlist: [...(data.seedlist || []), item] });
}

// messaging to tab
async function sendMessageToTab(tabId, message) {
  let retries = 3;
  while (retries > 0) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response) return response;
      throw new Error("Empty response from content script");
    } catch (error) {
      if (String(error.message || "").includes("Could not establish connection")) {
        retries--;
        await new Promise(r => setTimeout(r, 1200));
      } else { throw error; }
    }
  }
  throw new Error("Could not connect to content script after multiple retries.");
}

// Listen for popup commands
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startWarmup") {
    warmupAccount().catch(console.error);
    sendResponse({ status: "Warmup initiated" }); return true;
  }
  if (request.action === "startScan") {
    chrome.storage.local.set({ isScanning: true, scanResults: {} });
    scanAccounts().then(results => sendResponse({ results })); return true;
  }
  if (request.action === "saveGlobalLimit") {
    chrome.storage.local.set({ mailLimit: Number(request.value) || 10 }).then(() => sendResponse({ ok: true })); return true;
  }
  if (request.action === "savePerAccountLimit") {
    const { accountIndex, value } = request;
    chrome.storage.local.get(["perAccountLimits"]).then(({ perAccountLimits = {} }) => {
      perAccountLimits[String(accountIndex)] = Number(value) || 10;
      chrome.storage.local.set({ perAccountLimits }).then(() => sendResponse({ ok: true }));
    }); return true;
  }
  return true;
});

// --- Globals for warmup ---
let warmupTabId = null;
let navigationState = "idle"; 
let processedCount = 0;
let maxLimit = 10;

// Warmup orchestrator (looped)
async function warmupAccount() {
  await chrome.storage.local.set({
    isWarmingUp: true, step: "Starting", log: [],
    runningCount: 0, reviewingCount: 0, clickedCount: 0, sentCount: 0
  });

  const { mailLimit } = await chrome.storage.local.get(["mailLimit"]);
  maxLimit = Number(mailLimit) || 10;
  processedCount = 0;

  await addLog(`🚀 Warmup starting (limit: ${maxLimit})...`);

  let [tab] = await chrome.tabs.query({ url: "*://mail.google.com/*" });
  if (!tab) tab = await chrome.tabs.create({ url: "https://mail.google.com/mail/u/0/#spam", active: true });
  else await chrome.tabs.update(tab.id, { url: "https://mail.google.com/mail/u/0/#spam", active: true });

  warmupTabId = tab.id;
  navigationState = "movingSpam";
  await setStep("Spam");
}

// Navigation listener with loop
const navigationListener = async ({ tabId, url }) => {
  if (tabId !== warmupTabId) return;
  const { isWarmingUp } = await chrome.storage.local.get(["isWarmingUp"]);
  if (!isWarmingUp) return;

  try {
    if (navigationState === "movingSpam" && url.includes("#spam")) {
      await addLog("📂 Processing Spam...");
      await sendMessageToTab(tabId, { action: "moveSpamToInbox" });
      navigationState = "movingPromos";
      await chrome.tabs.update(tabId, { url: "https://mail.google.com/mail/u/0/#category/promotions" });

    } else if (navigationState === "movingPromos" && url.includes("#category/promotions")) {
      await addLog("🏷️ Processing Promotions...");
      await sendMessageToTab(tabId, { action: "movePromotionsToInbox" });
      navigationState = "movingUpdates";
      await chrome.tabs.update(tabId, { url: "https://mail.google.com/mail/u/0/#category/updates" });

    } else if (navigationState === "movingUpdates" && url.includes("#category/updates")) {
      await addLog("📰 Processing Updates...");
      await sendMessageToTab(tabId, { action: "moveUpdatesToInbox" });
      navigationState = "movingSocial";
      await chrome.tabs.update(tabId, { url: "https://mail.google.com/mail/u/0/#category/social" });

    } else if (navigationState === "movingSocial" && url.includes("#category/social")) {
      await addLog("👥 Processing Social...");
      await sendMessageToTab(tabId, { action: "moveSocialToInbox" });
      navigationState = "processingInbox";
      await chrome.tabs.update(tabId, { url: "https://mail.google.com/mail/u/0/#inbox" });

    } else if (navigationState === "processingInbox" && url.includes("#inbox")) {
      await addLog("📩 Processing Inbox mails...");
      await sendMessageToTab(tabId, { action: "processInboxMails" });
      processedCount++;

      if (processedCount < maxLimit) {
        await addLog(`🔁 Cycle ${processedCount}/${maxLimit} complete. Starting again...`);
        navigationState = "movingSpam";
        await chrome.tabs.update(tabId, { url: "https://mail.google.com/mail/u/0/#spam" });
      } else {
        await addLog(`🏁 Warmup complete. Processed ${processedCount} cycles.`);
        await chrome.storage.local.set({ isWarmingUp: false, step: "Done" });
        navigationState = "idle";
      }
    }
  } catch (e) {
    await addLog(`❌ Error: ${e.message}`);
    await chrome.storage.local.set({ isWarmingUp: false, step: "Error" });
    navigationState = "idle";
  }
};

if (!chrome.webNavigation.onCompleted.hasListener(navigationListener)) {
  chrome.webNavigation.onCompleted.addListener(navigationListener, { url: [{ hostContains: "mail.google.com" }] });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========================
// SCAN ACCOUNTS (unchanged)
// ========================
async function getEmailCount(tabId) { return await sendMessageToTab(tabId, { action: "countEmails" }); }
async function getAccountEmail(tabId) { return await sendMessageToTab(tabId, { action: "getAccountEmail" }); }

async function scanAccounts() {
  const results = {};
  const seenEmails = new Set();

  for (let i = 0; i < 5; i++) {
    try {
      let tab = await chrome.tabs.create({ url: `https://mail.google.com/mail/u/${i}/#inbox`, active: false });
      await new Promise(r => setTimeout(r, 3500));
      const acct = await getAccountEmail(tab.id);
      if (!acct?.email || seenEmails.has(acct.email)) {
        await chrome.tabs.remove(tab.id); continue;
      }
      seenEmails.add(acct.email);

      const inbox = await getEmailCount(tab.id);
      await chrome.tabs.update(tab.id, { url: `https://mail.google.com/mail/u/${i}/#spam` });
      await new Promise(r => setTimeout(r, 2500));
      const spam = await getEmailCount(tab.id);
      await chrome.tabs.update(tab.id, { url: `https://mail.google.com/mail/u/${i}/#category/promotions` });
      await new Promise(r => setTimeout(r, 2500));
      const promos = await getEmailCount(tab.id);

      const { perAccountLimits = {}, mailLimit = 10 } = await chrome.storage.local.get(["perAccountLimits","mailLimit"]);
      results[`Account ${i}`] = {
        email: acct?.email || "",
        inbox: inbox?.count ?? 0,
        spam: spam?.count ?? 0,
        promotions: promos?.count ?? 0,
        limit: perAccountLimits[String(i)] ?? mailLimit ?? 10
      };

      await chrome.tabs.remove(tab.id);
    } catch (e) {
      console.warn(`Account ${i} not accessible:`, e.message);
    }
  }

  await chrome.storage.local.set({ scanResults: results, isScanning: false });
  return results;
}

// Messages from content script
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "mailOpened") { pushSeed({ action: "opened", ...req.mail }).then(() => sendResponse({ ok: true })); return true; }
  if (req.action === "linkClicked") { pushSeed({ action: "clicked", clickedUrl: req.url, ...req.mail }).then(() => sendResponse({ ok: true })); return true; }
  if (req.action === "mailSent") { pushSeed({ action: "sent", ...req.mail }).then(() => sendResponse({ ok: true })); return true; }
  return false;
});
