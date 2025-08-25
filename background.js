// --- State Management ---
const initialState = { isWarmingUp: false };
chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set(initialState));

const warmupTabs = new Map();
const openedTabs = new Map();

// --- Core Warmup Orchestrator ---
async function warmupOrchestrator() {
  console.log("🚀 Starting warmup orchestrator...");
  await chrome.storage.local.set({ isWarmingUp: true });

  const { emails } = await chrome.storage.local.get("emails");
  if (!emails || emails.length === 0) {
    console.log("⚠️ No accounts found. Please save accounts in popup.");
    await chrome.storage.local.set({ isWarmingUp: false });
    return;
  }

  for (let i = 0; i < emails.length; i++) {
    const startUrl = `https://mail.google.com/mail/u/${i}/#inbox`;
    const tab = await chrome.tabs.create({ url: startUrl, active: false });
    warmupTabs.set(tab.id, { accountIndex: i, state: "processingInbox" });
  }

  console.log(`🔥 Warmup launched for ${emails.length} accounts`);
}

// --- State machine for Gmail categories ---
const navigationListener = async ({ tabId, url }) => {
  if (!warmupTabs.has(tabId)) return;
  const tabState = warmupTabs.get(tabId);
  const { accountIndex, state } = tabState;

  const transitions = {
    processingInbox: { fragment: "#inbox", action: "processUnreadEmails", next: "movingSpam" },
    movingSpam: { fragment: "#spam", action: "moveAllToInbox", next: "movingPromos" },
    movingPromos: { fragment: "#category/promotions", action: "movePromotionsToInbox", next: "movingSocial" },
    movingSocial: { fragment: "#category/social", action: "moveSocialToInbox", next: "cycleComplete" }
  };

  const currentState = transitions[state];
  if (currentState && url.includes(currentState.fragment)) {
    console.log(`📌 Account ${accountIndex}: State - ${state}`);
    try {
      await chrome.tabs.sendMessage(tabId, { action: currentState.action });
      tabState.state = currentState.next;

      if (tabState.state === "cycleComplete") {
        console.log(`✅ Warmup cycle complete for Account ${accountIndex}`);
        chrome.tabs.remove(tabId);
        warmupTabs.delete(tabId);
        if (warmupTabs.size === 0) {
          chrome.storage.local.set({ isWarmingUp: false });
          console.log("🎉 All accounts finished warmup.");
        }
      } else {
        const nextUrl = `https://mail.google.com/mail/u/${accountIndex}/${transitions[tabState.state].fragment}`;
        chrome.tabs.update(tabId, { url: nextUrl });
      }
    } catch (err) {
      console.error(`❌ Error in ${state} for account ${accountIndex}:`, err);
      chrome.tabs.remove(tabId);
      warmupTabs.delete(tabId);
    }
  }
};

if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
  chrome.webNavigation.onCompleted.addListener(navigationListener, {
    url: [{ hostContains: "mail.google.com" }]
  });
}

// -----------------------------
// 🤖 AI CHAT (Gemini 2.0 Flash) — with auto loop + warmup control
// -----------------------------
let chatHistory = [];

async function handleAIChat(message, sendResponse, auto = false) {
  try {
    const { geminiApiKey } = await chrome.storage.local.get("geminiApiKey");
    const apiKey = geminiApiKey || "AIzaSyCuw2pQtiBr5dRn0t3cw8bDW-gN9c4TEBg";

    if (!apiKey) {
      sendResponse({
        success: false,
        reply: "⚠️ Gemini API key not set. Save it in storage or hardcode it."
      });
      return;
    }

    // ✅ Custom AI Commands
    if (message) {
      const lower = message.toLowerCase();

      if (lower.includes("start warmup")) {
        warmupOrchestrator();
        sendResponse({ success: true, reply: "🚀 Gmail warmup started by AI." });
        return;
      }

      if (lower.includes("stop warmup")) {
        chrome.storage.local.set({ isWarmingUp: false });
        sendResponse({ success: true, reply: "⏹ Gmail warmup stopped by AI." });
        return;
      }

      // Otherwise, add message to AI history
      chatHistory.push({ role: "user", parts: [{ text: message }] });
    }

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const body = { contents: chatHistory };

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    const data = await resp.json();
    console.log("🤖 Gemini raw:", data);

    if (!resp.ok) {
      const msg =
        (data && (data.error?.message || JSON.stringify(data))) ||
        `HTTP ${resp.status}`;
      sendResponse({ success: false, reply: `❌ Gemini error: ${msg}` });
      return;
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "🤖 (empty response)";

    chatHistory.push({ role: "model", parts: [{ text: reply }] });

    sendResponse({ success: true, reply });

    // 🔄 Auto loop if requested
    if (auto && !/done|✅/i.test(reply)) {
      setTimeout(() => {
        handleAIChat(null, () => {}, true);
      }, 3000);
    }
  } catch (err) {
    console.error("AI Chat fatal error:", err);
    sendResponse({ success: false, reply: `⚠️ AI request failed: ${err.message}` });
  }
}

// --- Messages from popup.js ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "goToGoogle") {
    warmupOrchestrator();
    sendResponse({ status: "Warmup started" });
    return true;
  }

  if (request.action === "chatMessage") {
    handleAIChat(request.text, sendResponse, request.auto || false);
    return true;
  }

  if (request.action === "openTab") {
    chrome.tabs.create({ url: request.url, active: false }, (tab) => {
      openedTabs.set(tab.id, tab);
      sendResponse({ success: true, tabId: tab.id });
    });
    return true;
  }

  if (request.action === "closeTab" && request.tabId) {
    chrome.tabs.remove(request.tabId, () => {
      openedTabs.delete(request.tabId);
      sendResponse({ success: true });
    });
    return true;
  }
});

// --- Keep Alive ---
setInterval(() => {
  fetch("http://localhost:4567/update")
    .then((res) => res.json())
    .then((data) => {
      if (data.status === true) chrome.runtime.reload();
    })
    .catch(() => {});
}, 1000 * 60 * 60 * 6);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "keepAlive") {
    port.onDisconnect.addListener(() =>
      chrome.runtime.connect({ name: "keepAlive" })
    );
  }
});
