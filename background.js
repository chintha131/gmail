// background.js - The service worker and brain of the extension

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
  repliesSentCount: 0, // ✨ New counter for AI replies
  // Settings
  isAiReplyEnabled: false, // ✨ AI feature toggle
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

async function setStep(stepName) {
  await chrome.storage.local.set({ step: stepName });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sleepWithJitter(baseMs) {
    const jitter = baseMs * 0.4; // Add up to 40% jitter
    const totalSleep = baseMs + Math.random() * jitter;
    return sleep(totalSleep);
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

// --- Gemini API Integration ---

async function generateReply(emailBody) {
    if (!emailBody || emailBody.trim().length < 20) {
        addLog("✨ Email body too short, skipping AI reply.");
        return null;
    }

    const prompt = `You are an AI assistant helping to warm up an email account. Your task is to write a short, positive, one-sentence reply to the following email. The reply should show you've read the email but ask no questions. Keep it casual and friendly. Examples: "Thanks for the update, this looks great!", "Awesome, appreciate you sending this over.", "Good to know, thanks for sharing."\n\nEmail Content:\n"""\n${emailBody.substring(0, 2000)}\n"""\n\nReply:`;

    try {
        addLog("✨ Asking Gemini for a smart reply...");
        const apiKey = ""; // Canvas will provide this
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
            addLog(`✨ Gemini suggested reply: "${text.trim()}"`);
            return text.trim();
        } else {
            addLog("✨ Gemini did not return a valid reply.");
            return null;
        }
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        addLog(`❌ Error generating AI reply: ${error.message}`);
        return null;
    }
}


// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "startWarmup":
      warmupOrchestrator().catch(console.error);
      sendResponse({ status: "Warmup initiated" });
      break;
    
    case "openAndCloseTab":
      (async () => {
        const newTab = await chrome.tabs.create({ url: request.url, active: false });
        await sleepWithJitter(8000); // Wait for 8 seconds on the new page
        await chrome.tabs.remove(newTab.id);
        sendResponse({ status: "completed" });
      })();
      return true; // Keep the message channel open for async response

    case "getReply":
        generateReply(request.emailBody).then(reply => sendResponse({ reply }));
        break;

    case "incrementReplyCount":
        chrome.storage.local.get('repliesSentCount').then(data => {
            chrome.storage.local.set({ repliesSentCount: (data.repliesSentCount || 0) + 1 });
        });
        sendResponse({ok: true});
        break;

    case "saveAiReplySetting":
        chrome.storage.local.set({ isAiReplyEnabled: request.isEnabled });
        sendResponse({ok: true});
        break;
    
    case "startScan":
      chrome.storage.local.set({ isScanning: true, scanResults: {} });
      scanAccounts().then(results => sendResponse({ results }));
      break;
    case "saveGlobalLimit":
      chrome.storage.local.set({ mailLimit: Number(request.value) || 10 })
        .then(() => sendResponse({ ok: true }));
      break;
    case "savePerAccountLimit":
      const { accountIndex, value } = request;
      chrome.storage.local.get("perAccountLimits").then(({ perAccountLimits = {} }) => {
        perAccountLimits[String(accountIndex)] = Number(value) || 10;
        chrome.storage.local.set({ perAccountLimits })
          .then(() => sendResponse({ ok: true }));
      });
      break;
    case "mailOpened":
    case "linkClicked":
    case "mailSent":
      pushSeed(request).then(() => sendResponse({ ok: true }));
      break;
    default:
      sendResponse({ status: "unknown action" });
      break;
  }
  return true; // Indicate async response
});

async function pushSeed(event) {
  const data = await chrome.storage.local.get("seedlist");
  const item = { time: new Date().toISOString(), ...event };
  const newSeedlist = [...(data.seedlist || []), item].slice(-200);
  await chrome.storage.local.set({ seedlist: newSeedlist });
}


// --- Core Functionality: Warmup ---
let warmupTabs = {}; // Manages state for multiple tabs

async function warmupOrchestrator() {
    await chrome.storage.local.set({
        isWarmingUp: true,
        step: "Starting",
        log: [],
        runningCount: 0, reviewingCount: 0, clickedCount: 0, sentCount: 0, repliesSentCount: 0
    });

    const { mailLimit, scanResults } = await chrome.storage.local.get(["mailLimit", "scanResults"]);
    const accounts = Object.keys(scanResults);

    if (accounts.length === 0) {
        await addLog("No accounts scanned. Please scan accounts before starting warmup.");
        await chrome.storage.local.set({ isWarmingUp: false });
        return;
    }

    for (const account of accounts) {
        const accountIndex = account.replace("Account ", "");
        const startUrl = `https://mail.google.com/mail/u/${accountIndex}/#spam`;
        const tab = await chrome.tabs.create({ url: startUrl, active: false });

        warmupTabs[tab.id] = {
            accountIndex,
            navigationState: "movingSpam",
            processedCycles: 0,
            maxCycles: Number(mailLimit) || 10
        };
    }

    await addLog(`🚀 Warmup starting for ${accounts.length} accounts...`);
}

const navigationListener = async ({ tabId, url }) => {
    if (!warmupTabs[tabId]) return;

    const { isWarmingUp, isAiReplyEnabled } = await chrome.storage.local.get(["isWarmingUp", "isAiReplyEnabled"]);
    if (!isWarmingUp) return;

    const tabState = warmupTabs[tabId];
    const accountIndex = tabState.accountIndex;

    const transitions = {
        movingSpam: { urlFragment: "#spam", action: "moveSpamToInbox", log: `📂 Processing Spam for Account ${accountIndex}...`, nextState: "movingPromos", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#category/promotions` },
        movingPromos: { urlFragment: "#category/promotions", action: "movePromotionsToInbox", log: `🏷️ Processing Promotions for Account ${accountIndex}...`, nextState: "movingUpdates", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#category/updates` },
        movingUpdates: { urlFragment: "#category/updates", action: "moveUpdatesToInbox", log: `📰 Processing Updates for Account ${accountIndex}...`, nextState: "movingSocial", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#category/social` },
        movingSocial: { urlFragment: "#category/social", action: "moveSocialToInbox", log: `👥 Processing Social for Account ${accountIndex}...`, nextState: "processingInbox", nextUrl: `https://mail.google.com/mail/u/${accountIndex}/#inbox` }
    };

    try {
        const currentState = transitions[tabState.navigationState];
        if (currentState && url.includes(currentState.urlFragment)) {
            await addLog(currentState.log);
            await sendMessageToTab(tabId, { action: currentState.action });
            tabState.navigationState = currentState.nextState;
            await chrome.tabs.update(tabId, { url: currentState.nextUrl });
        } else if (tabState.navigationState === "processingInbox" && url.includes("#inbox")) {
            await addLog(`📩 Processing Inbox for Account ${accountIndex}...`);
            await sendMessageToTab(tabId, { action: "processInboxMails", isAiReplyEnabled });
            tabState.processedCycles++;

            if (tabState.processedCycles < tabState.maxCycles) {
                await addLog(`🔁 Cycle ${tabState.processedCycles}/${tabState.maxCycles} complete for Account ${accountIndex}.`);
                tabState.navigationState = "movingSpam";
                await chrome.tabs.update(tabId, { url: `https://mail.google.com/mail/u/${accountIndex}/#spam` });
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

        if (Object.keys(warmupTabs).length === 0) {
            await chrome.storage.local.set({ isWarmingUp: false, step: "Error" });
        }
    }
};

if (chrome.webNavigation && chrome.webNavigation.onCompleted) {
    if (!chrome.webNavigation.onCompleted.hasListener(navigationListener)) {
      chrome.webNavigation.onCompleted.addListener(navigationListener, {
        url: [{ hostContains: "mail.google.com" }]
      });
    }
} else {
    console.error("chrome.webNavigation API is not available. Check permissions in manifest.json.");
    addLog("❌ Error: webNavigation API not available. Warmup process cannot start.");
}


// --- Core Functionality: Account Scanning ---
async function scanAccounts() {
  await addLog("🔍 Starting account scan...");
  const results = {};
  const seenEmails = new Set();
  const maxAccountsToScan = 5;

  for (let i = 0; i < maxAccountsToScan; i++) {
    let tabId = null;
    try {
      const tab = await chrome.tabs.create({ url: `https://mail.google.com/mail/u/${i}/#inbox`, active: false });
      tabId = tab.id;
      await sleepWithJitter(4500); // Increased and randomized delay

      const acct = await sendMessageToTab(tabId, { action: "getAccountEmail" });
      if (!acct || !acct.email || seenEmails.has(acct.email)) {
        await chrome.tabs.remove(tabId);
        continue;
      }
      seenEmails.add(acct.email);
      await addLog(`Scanning account ${i}: ${acct.email}`);

      const folders = { inbox: "#inbox", spam: "#spam", promotions: "#category/promotions" };
      const counts = {};
      for (const folderName in folders) {
        await chrome.tabs.update(tabId, { url: `https://mail.google.com/mail/u/${i}/${folders[folderName]}` });
        await sleepWithJitter(3000); // Increased and randomized delay
        const countResult = await sendMessageToTab(tabId, { action: "countEmails" });
        counts[folderName] = countResult?.count ?? 0;
      }

      const { perAccountLimits = {}, mailLimit = 10 } = await chrome.storage.local.get(["perAccountLimits", "mailLimit"]);
      results[`Account ${i}`] = { email: acct.email, ...counts, limit: perAccountLimits[String(i)] ?? mailLimit };
      await chrome.tabs.remove(tabId);
    } catch (e) {
      console.warn(`Could not access account ${i}:`, e.message);
      if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
    }
  }

  await addLog(`✅ Scan complete. Found ${Object.keys(results).length} accounts.`);
  await chrome.storage.local.set({ scanResults: results, isScanning: false });
  return results;
}
