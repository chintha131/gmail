// background.js - Combined and updated service worker

// --- State Management ---
const initialState = {
  isWarmingUp: false,
  isScanning: false,
  step: "Idle",
  log: [],
  scanResults: {},
  mailLimit: 10,
  perAccountLimits: {},
  // Live counters
  runningCount: 0,
  reviewingCount: 0,
  clickedCount: 0,
  sentCount: 0,
  repliesSentCount: 0,
  // Settings
  isAiReplyEnabled: false,
  // Seedlist for tracking events
  seedlist: []
};

// Initialize or reset state on install or startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(initialState);
  console.log("Extension installed. State initialized.");
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set(initialState);
  console.log("Browser started. State reset.");
});


// --- Utility Functions ---
async function addLog(message) {
  try {
    const data = await chrome.storage.local.get("log");
    const newLog = [...(data.log || []), `[${new Date().toLocaleTimeString()}] ${message}`].slice(-100);
    await chrome.storage.local.set({ log: newLog });
    console.log("📝 LOG:", message);
  } catch (error) {
    console.error("Error adding log:", error);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendMessageToTab(tabId, message) {
  let retries = 3;
  while (retries > 0) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response) return response;
      throw new Error("Empty response from content script");
    } catch (error) {
      if (error.message.includes("Could not establish connection")) {
        retries--;
        console.warn(`Connection to tab ${tabId} failed. Retrying... (${retries} left)`);
        await sleep(1500);
      } else {
        console.error("Error sending message to tab:", error);
        throw error;
      }
    }
  }
  throw new Error(`Could not connect to content script in tab ${tabId} after multiple retries.`);
}


// --- Core Functionality: Warmup ---
let warmupTabs = {}; // Manages state for multiple tabs

async function warmupOrchestrator() {
    await chrome.storage.local.set({
        isWarmingUp: true,
        step: "Starting",
    });

    const { mailLimit, scanResults } = await chrome.storage.local.get(["mailLimit", "scanResults"]);
    const accounts = Object.keys(scanResults || {});

    if (accounts.length === 0) {
        await addLog("No accounts scanned. Please scan accounts before starting warmup.");
        await chrome.storage.local.set({ isWarmingUp: false });
        return;
    }

    for (const account of accounts) {
        const accountIndex = account.replace("Account ", "");
        const startUrl = `https://mail.google.com/mail/u/${accountIndex}/#inbox`; // Start from inbox
        const tab = await chrome.tabs.create({ url: startUrl, active: false });

        warmupTabs[tab.id] = {
            accountIndex,
            navigationState: "processingInbox", // Start with inbox processing
            processedCycles: 0,
            maxCycles: Number(mailLimit) || 10
        };
    }

    await addLog(`🚀 Warmup starting for ${accounts.length} accounts...`);
}

const navigationListener = async ({ tabId, url }) => {
    if (!warmupTabs[tabId]) return;

    const { isWarmingUp } = await chrome.storage.local.get("isWarmingUp");
    if (!isWarmingUp) return;

    const tabState = warmupTabs[tabId];
    const accountIndex = tabState.accountIndex;

    const transitions = {
        processingInbox: { urlFragment: "#inbox", action: "processInboxMails", log: `📩 Processing Inbox for Account ${accountIndex}...`, nextState: "movingSpam", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#spam` },
        movingSpam: { urlFragment: "#spam", action: "moveSpamToInbox", log: `📂 Processing Spam for Account ${accountIndex}...`, nextState: "movingPromos", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#category/promotions` },
        movingPromos: { urlFragment: "#category/promotions", action: "movePromotionsToInbox", log: `🏷️ Processing Promotions for Account ${accountIndex}...`, nextState: "movingSocial", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#category/social` },
        movingSocial: { urlFragment: "#category/social", action: "moveSocialToInbox", log: `👥 Processing Social for Account ${accountIndex}...`, nextState: "cycleComplete", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#inbox` }
    };

    try {
        const currentState = transitions[tabState.navigationState];
        if (currentState && url.includes(currentState.urlFragment)) {
            await addLog(currentState.log);
            await sendMessageToTab(tabId, { action: currentState.action });
            tabState.navigationState = currentState.nextState;
            await chrome.tabs.update(tabId, { url: currentState.nextUrl });

        } else if (tabState.navigationState === "cycleComplete") {
            tabState.processedCycles++;
            if (tabState.processedCycles < tabState.maxCycles) {
                await addLog(`🔁 Cycle ${tabState.processedCycles}/${tabState.maxCycles} complete for Account ${accountIndex}.`);
                tabState.navigationState = "processingInbox"; // Start next cycle
                await chrome.tabs.update(tabId, { url: `https://mail.google.com/mail/u/${accountIndex}/#inbox` });
            } else {
                await addLog(`🏁 Warmup complete for Account ${accountIndex}.`);
                await chrome.tabs.remove(tabId);
                delete warmupTabs[tabId];

                if (Object.keys(warmupTabs).length === 0) {
                    await addLog("All accounts have completed the warmup process.");
                    await chrome.storage.local.set({ isWarmingUp: false, step: "Done" });
                }
            }
        }
    } catch (e) {
        await addLog(`❌ Error during warmup for Account ${accountIndex}: ${e.message}`);
        await chrome.tabs.remove(tabId);
        delete warmupTabs[tabId];
    }
};

if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
    if (!chrome.webNavigation.onCompleted.hasListener(navigationListener)) {
      chrome.webNavigation.onCompleted.addListener(navigationListener, {
        url: [{ hostContains: "mail.google.com" }]
      });
    }
} else {
    console.error("chrome.webNavigation API is not available.");
}


// --- Original background.js Logic ---

const openedTabs = new Map();

chrome.tabs.onRemoved.addListener((tabId) => {
  if (openedTabs.has(tabId)) {
    openedTabs.delete(tabId);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle Warmup Action
  if (request.action === "startWarmup") {
      warmupOrchestrator().catch(console.error);
      sendResponse({ status: "Warmup initiated" });
      return true;
  }

  // Handle tab management messages
  if (request.action === "openTab") {
    chrome.tabs.create({ url: request.url, active: false }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("Error opening tab:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
        return;
      }
      openedTabs.set(tab.id, tab);
      sendResponse({ success: true, tabId: tab.id });
    });
    return true; 
  }

  if (request.action === "closeTab") {
    if (request.tabId) {
      chrome.tabs.remove(request.tabId, () => {
        if (chrome.runtime.lastError) {
          console.error("Error closing tab:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError });
          return;
        }
        openedTabs.delete(request.tabId);
        sendResponse({ success: true });
      });
      return true;
    }
    sendResponse({ success: false, error: "No tab ID provided" });
    return true;
  }

  // Handle the POST_MESSAGE_ID action
  if (request.type === "POST_MESSAGE_ID") {
    const emailData = [{
      email: request.email,
      status: "Active",
      last_active: new Date().toISOString().slice(0, 19).replace('T', ' ')
    }];
 
    callCombinedAPI(emailData)
      .then(() => {
        const apiUrls = [
          "https://sendcrux.com/api/v1/warmup_activity_log?api_token=xIFZvOVosfhZry58AkS4aTR4TWHiIWrhYnp5tnP4xNPl1Cl30Y90sO0766Rw",
          "https://revenuerollbulksending.com/api/v1/warmup_activity_log?api_token=mjKi7ZFov2AsJ1egayMsba0zyGbw7dmbnD4sisQELRGDeDPohf950UNm2zvl",
        ];
 
        const requestData = {
          message_id: request.messageId,
          type: request.emailType || "tabs",
        };
 
        const postRequests = apiUrls.map((apiUrl) =>
          fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestData),
          })
            .then((response) => {
              if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
              return response.json();
            })
            .then((data) => ({ status: "success" }))
            .catch((error) => ({ status: "error", error: error.message }))
        );
 
        return Promise.all(postRequests);
      })
      .then((results) => {
        const success = results.every((result) => result.status === "success");
        sendResponse({ status: success ? "success" : "error" });
      })
      .catch((error) => {
        sendResponse({ status: "error", error: error.message });
      });
 
    return true;
  }
   
  // Handle saveData action
  if (request.action === "saveData") {
    const payload = request.payload;
    const apiUrls = [
      "https://revenuerollbulksending.com/api/v1/seedlist/addsubscribers?api_token=mjKi7ZFov2AsJ1egayMsba0zyGbw7dmbnD4sisQELRGDeDPohf950UNm2zvl",
      "https://sendcrux.com/api/v1/seedlist/addsubscribers?api_token=xIFZvOVosfhZry58AkS4aTR4TWHiIWrhYnp5tnP4xNPl1Cl30Y90sO0766Rw",
    ];
 
    const postRequests = apiUrls.map((apiUrl) =>
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
          return response.json();
        })
        .then((data) => ({ success: true, data: data }))
        .catch((error) => ({ success: false, error: error.message }))
    );
 
    Promise.all(postRequests)
      .then((results) => {
        const success = results.every((result) => result.success === true);
        sendResponse({ success: success, data: results });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
 
    return true;
  }
});
 
async function callCombinedAPI(emailData) {
  const apiUrl = 'http://127.0.0.1:8000/api/v1/combined';
  const payload = {
    gmail_list: { location: "kukatapally" },
    laptop_detail: { laptop_name: "Laptop-003" },
    email_detail: emailData
  };
 
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer gmails_stats_2024_secure_token_123'
      },
      body: JSON.stringify(payload)
    });
 
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const data = await response.json();
    console.log('Combined API response:', data);
    return data;
  } catch (error) {
    console.error('Error calling combined API:', error);
    throw error;
  }
}
 
setInterval(() => {
  fetch("http://localhost:4567/update")
    .then(res => res.json())
    .then(data => {
      if (data.status === true) {
        console.log("Update pulled successfully, reloading extension...");
        chrome.runtime.reload();
      }
    })
    .catch(err => {
      console.error("Failed to check for update:", err);
    });
}, 1000 * 60 * 60 * 6);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    port.onDisconnect.addListener(() => {
      chrome.runtime.connect({ name: 'keepAlive' });
    });
  }
});
