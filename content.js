// content.js - This script runs inside the Gmail page to perform DOM manipulations.

// --- Utility Functions ---
function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const intervalTime = 200;
    let totalWait = 0;
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el && isVisible(el)) { // Ensure element is also visible
        clearInterval(interval);
        resolve(el);
      } else {
        totalWait += intervalTime;
        if (totalWait >= timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for selector: "${selector}"`));
        }
      }
    }, intervalTime);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sleepWithJitter(baseMs) {
    const jitter = baseMs * 0.4;
    const totalSleep = baseMs + Math.random() * jitter;
    return sleep(totalSleep);
}

function isVisible(el) {
  return !!(el && el.offsetParent !== null);
}

function querySelectors(selectors) {
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && isVisible(element)) {
            return element;
        }
    }
    return null;
}

// --- Core Action Functions ---
function countVisibleMails() {
  const grid = document.querySelector('div[role="main"] table[role="grid"]');
  if (!grid) return 0;
  const rows = Array.from(grid.querySelectorAll('tr[role="row"]'));
  return rows.filter(r => r.querySelector('td')).length;
}

async function moveAllToInbox(folderName = "Unknown") {
  try {
    await waitForElement('div[role="main"]');
    const mailCount = countVisibleMails();
    if (mailCount === 0) {
      console.log(`ℹ️ No emails found in ${folderName}.`);
      return { status: "empty", moved: 0 };
    }

    const selectAllCheckbox = querySelectors([
        'div[data-tooltip="Select"] span[role="checkbox"]',
        'div[aria-label="Select"] span[role="checkbox"]',
        'button[data-tooltip="Select"]'
    ]);
    if (!selectAllCheckbox) throw new Error("Select-all checkbox not found.");
    selectAllCheckbox.click();
    await sleepWithJitter(700);

    const selectAllBanner = Array.from(document.querySelectorAll('span[role="link"]'))
      .find(el => el.textContent.includes("Select all"));
    if (selectAllBanner) {
      selectAllBanner.click();
      await sleepWithJitter(700);
    }

    const inSpam = window.location.hash.includes("#spam");
    
    const moveButton = inSpam 
      ? querySelectors(['div[data-tooltip="Not spam"]', 'button[aria-label="Not spam"]', 'button[data-tooltip="Not spam"]'])
      : querySelectors(['div[data-tooltip="Move to Inbox"]', 'button[aria-label="Move to Inbox"]', 'button[data-tooltip="Move to Inbox"]']);

    if (!moveButton) throw new Error(`"Move" button not found for folder: ${folderName}`);
    moveButton.click();
    await sleepWithJitter(2000);

    console.log(`✅ Moved emails from ${folderName} to Inbox.`);
    return { status: "success", moved: mailCount, folder: folderName };
  } catch (e) {
    console.error(`Error in moveAllToInbox for ${folderName}:`, e.message);
    return { status: "error", message: e.message };
  }
}

async function processInboxMails(isAiReplyEnabled) {
  try {
    let processedCount = 0;
    const maxToProcess = 50;

    for (let i = 0; i < maxToProcess; i++) {
      await waitForElement('div[role="main"] table[role="grid"]', 5000).catch(() => {});
      
      const nextUnread = querySelectors([
          'tr.zE',
          'tr.zA.yO[aria-selected="false"]'
      ]);

      if (!nextUnread) {
        console.log("No more unread emails found.");
        break;
      }

      const clickableArea = nextUnread.querySelector('td');
      if(clickableArea) clickableArea.click();
      else nextUnread.click();

      await waitForElement('div.a3s', 8000);
      await sleepWithJitter(1200);

      if (isAiReplyEnabled) {
        // AI Reply Logic
      } else {
        const emailBody = document.querySelector('div.a3s');
        if (emailBody) {
          const links = Array.from(emailBody.querySelectorAll('a[href]'));
          const badKeywords = ["unsubscribe", "report", "spam", "abuse", "block", "privacy", "terms"];
          const safeLink = links.find(a => {
            const text = (a.textContent || "").toLowerCase();
            const href = (a.getAttribute("href") || "").toLowerCase();
            return !badKeywords.some(kw => text.includes(kw) || href.includes(kw)) && href.startsWith('http');
          });

          if (safeLink) {
            console.log("Found safe link, opening in new tab:", safeLink.href);
            await chrome.runtime.sendMessage({ action: "openAndCloseTab", url: safeLink.href });
            await sleepWithJitter(1000);
          }
        }
      }

      const backButton = querySelectors(['div[data-tooltip="Back to Inbox"]', 'div[aria-label="Back to Inbox"]', 'button[data-tooltip="Back to Inbox"]']);
      if (backButton) {
        backButton.click();
      } else {
        window.history.back();
      }
      await sleepWithJitter(1800);
      processedCount++;
    }

    console.log(`📩 Processed ${processedCount} inbox emails.`);
    return { status: "success", processed: processedCount };
  } catch (e) {
    console.error("Error in processInboxMails:", e.message);
    return { status: "error", message: e.message };
  }
}

function getAccountEmail() {
    const accountButton = document.querySelector('a[href^="https://accounts.google.com/SignOutOptions"]');
    if (accountButton) {
        const email = accountButton.getAttribute('aria-label').match(/(\S+@\S+\.\S+)/);
        if (email && email[0]) {
            return { email: email[0] };
        }
    }
    return null;
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "moveSpamToInbox":
      moveAllToInbox("Spam").then(sendResponse);
      break;
    case "movePromotionsToInbox":
      moveAllToInbox("Promotions").then(sendResponse);
      break;
    case "processInboxMails":
      processInboxMails(request.isAiReplyEnabled).then(sendResponse);
      break;
    case "countEmails":
      sendResponse({ count: countVisibleMails() });
      break;
    case "getAccountEmail":
      sendResponse(getAccountEmail());
      break;
    default:
      sendResponse({ status: "error", message: "Unknown action" });
      break;
  }
  return true;
});

console.log("Gmail Warmup content script (AI Edition) loaded and updated.");
