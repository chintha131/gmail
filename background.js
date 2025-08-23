// background.js - Combined and updated service worker

// --- State Management ---
const initialState = {
  isWarmingUp: false,
  // All other state will be managed dynamically
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set(initialState);
});

// --- Tab and State Management ---
const warmupTabs = new Map();
const openedTabs = new Map();

// --- Core Automation Logic ---

async function warmupOrchestrator() {
    console.log("Starting warmup orchestrator...");
    await chrome.storage.local.set({ isWarmingUp: true });

    // This logic assumes that the user has already saved their email accounts
    // using the popup's "Save" functionality.
    const { emails } = await chrome.storage.local.get('emails');

    if (!emails || emails.length === 0) {
        console.log("No accounts found in storage. Please save accounts via the popup.");
        await chrome.storage.local.set({ isWarmingUp: false });
        return;
    }
    
    // We need to figure out the account index (/u/0/, /u/1/, etc.)
    // This is a simplified approach. A more robust solution would scan for them.
    for (let i = 0; i < emails.length; i++) {
        const accountIndex = i;
        const startUrl = `https://mail.google.com/mail/u/${accountIndex}/#inbox`;
        const tab = await chrome.tabs.create({ url: startUrl, active: false });

        warmupTabs.set(tab.id, {
            accountIndex,
            state: "processingInbox",
        });
    }
    console.log(`🚀 Warmup starting for ${emails.length} accounts...`);
}

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
        console.log(`Account ${accountIndex}: State - ${state}, URL matched.`);
        try {
            await chrome.tabs.sendMessage(tabId, { action: currentState.action });
            tabState.state = currentState.next;
            
            if (currentState.next === "cycleComplete") {
                console.log(`🏁 Warmup cycle complete for Account ${accountIndex}.`);
                chrome.tabs.remove(tabId);
                warmupTabs.delete(tabId);
                if (warmupTabs.size === 0) {
                    console.log("All accounts have completed the warmup process.");
                    chrome.storage.local.set({ isWarmingUp: false });
                }
            } else {
                const nextUrl = `https://mail.google.com/mail/u/${accountIndex}/${transitions[currentState.next].fragment}`;
                chrome.tabs.update(tabId, { url: nextUrl });
            }
        } catch (e) {
            console.error(`Error in state ${state} for Account ${accountIndex}:`, e);
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

// --- Message Handling ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // This is the command from your original popup.js
    if (request.action === "goToGoogle") {
        warmupOrchestrator();
        sendResponse({ status: "Warmup initiated" });
        return true;
    }

    // Handle tab management
    if (request.action === "openTab") {
        chrome.tabs.create({ url: request.url, active: false }, (tab) => {
            openedTabs.set(tab.id, tab);
            sendResponse({ success: true, tabId: tab.id });
        });
        return true;
    }

    if (request.action === "closeTab") {
        if (request.tabId) {
            chrome.tabs.remove(request.tabId, () => {
                openedTabs.delete(request.tabId);
                sendResponse({ success: true });
            });
        }
        return true;
    }

    // Handle API Calls
    if (request.type === "POST_MESSAGE_ID") {
        handlePostMessageId(request, sendResponse);
        return true;
    }

    if (request.action === "saveData") {
        handleSaveData(request, sendResponse);
        return true;
    }
    
    // Keep alive heartbeat
    if (request.type === 'HEARTBEAT') {
        sendResponse({ status: 'active' });
        return true;
    }
});

// --- API Functions ---

async function handlePostMessageId(request, sendResponse) {
    const emailData = [{ email: request.email, status: "Active", last_active: new Date().toISOString().slice(0, 19).replace('T', ' ') }];
    try {
        await callCombinedAPI(emailData);
        const apiUrls = [
            "https://sendcrux.com/api/v1/warmup_activity_log?api_token=xIFZvOVosfhZry58AkS4aTR4TWHiIWrhYnp5tnP4xNPl1Cl30Y90sO0766Rw",
            "https://revenuerollbulksending.com/api/v1/warmup_activity_log?api_token=mjKi7ZFov2AsJ1egayMsba0zyGbw7dmbnD4sisQELRGDeDPohf950UNm2zvl",
        ];
        const requestData = { message_id: request.messageId, type: request.emailType || "tabs" };
        const postRequests = apiUrls.map(url => fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestData)
        }).then(res => res.json()));
        await Promise.all(postRequests);
        sendResponse({ status: "success" });
    } catch (error) {
        sendResponse({ status: "error", error: error.message });
    }
}

async function handleSaveData(request, sendResponse) {
    const apiUrls = [
      "https://revenuerollbulksending.com/api/v1/seedlist/addsubscribers?api_token=mjKi7ZFov2AsJ1egayMsba0zyGbw7dmbnD4sisQELRGDeDPohf950UNm2zvl",
      "https://sendcrux.com/api/v1/seedlist/addsubscribers?api_token=xIFZvOVosfhZry58AkS4aTR4TWHiIWrhYnp5tnP4xNPl1Cl30Y90sO0766Rw",
    ];
    try {
        const postRequests = apiUrls.map(url => fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.payload)
        }).then(res => res.json()));
        const results = await Promise.all(postRequests);
        sendResponse({ success: true, data: results });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function callCombinedAPI(emailData) {
  const apiUrl = 'http://127.0.0.1:8000/api/v1/combined';
  const payload = {
    gmail_list: { location: "kukatapally" },
    laptop_detail: { laptop_name: "Laptop-003" },
    email_detail: emailData
  };
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gmails_stats_2024_secure_token_123'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
  return await response.json();
}

// --- Keep Alive and Update Check ---
setInterval(() => {
  fetch("http://localhost:4567/update")
    .then(res => res.json())
    .then(data => {
      if (data.status === true) {
        chrome.runtime.reload();
      }
    })
    .catch(err => {}); // Fail silently
}, 1000 * 60 * 60 * 6);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    port.onDisconnect.addListener(() => {
      chrome.runtime.connect({ name: 'keepAlive' });
    });
  }
});
