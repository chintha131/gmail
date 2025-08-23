// content.js - This script runs inside the Gmail page to perform DOM manipulations.

// --- Utility Functions ---

/**
 * Waits for a specific element to appear in the DOM.
 * @param {string} selector The CSS selector for the element.
 * @param {number} timeout The maximum time to wait in milliseconds.
 * @returns {Promise<Element>} A promise that resolves with the element.
 */
function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const intervalTime = 200;
    let totalWait = 0;
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
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

/**
 * A simple promise-based sleep function.
 * @param {number} ms Milliseconds to wait.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Checks if an element is currently visible to the user.
 * @param {Element} el The element to check.
 * @returns {boolean} True if the element is visible.
 */
function isVisible(el) {
  return !!(el && el.offsetParent !== null);
}

// --- Core Action Functions ---

/**
 * Counts the number of visible email rows in the current view.
 * @returns {number} The count of emails.
 */
function countVisibleMails() {
  // Gmail's main email list view is a table with role="grid".
  const grid = document.querySelector('div[role="main"] table[role="grid"]');
  if (!grid) return 0;
  // Each email is a tr with role="row".
  const rows = Array.from(grid.querySelectorAll('tr[role="row"]'));
  // Filter out header rows or other non-email rows.
  return rows.filter(r => r.querySelector('td')).length;
}

/**
 * Selects all emails in the current view and moves them to the Inbox.
 * Handles "Not Spam" for the spam folder and "Move to Inbox" for others.
 * @param {string} folderName The name of the folder being processed (for logging).
 * @returns {Promise<object>} A status object.
 */
async function moveAllToInbox(folderName = "Unknown") {
  try {
    await waitForElement('div[role="main"]');
    const mailCount = countVisibleMails();
    if (mailCount === 0) {
      console.log(`ℹ️ No emails found in ${folderName}.`);
      return { status: "empty", moved: 0 };
    }

    // Find the master "Select All" checkbox in the toolbar.
    const selectAllCheckbox = document.querySelector('div[data-tooltip="Select"] span[role="checkbox"]');
    if (!selectAllCheckbox) throw new Error("Select-all checkbox not found.");
    selectAllCheckbox.click();
    await sleep(500);

    // After selecting visible, Gmail might show a banner to "Select all conversations".
    const selectAllBanner = Array.from(document.querySelectorAll('span[role="link"]'))
      .find(el => el.textContent.includes("Select all"));
    if (selectAllBanner) {
      selectAllBanner.click();
      await sleep(500);
    }

    // Find the correct "Move" button based on the current folder.
    const inSpam = window.location.hash.includes("#spam");
    const moveButtonSelector = inSpam ?
      'div[data-tooltip="Not spam"]' :
      'div[data-tooltip="Move to Inbox"]';

    const moveButton = document.querySelector(moveButtonSelector);
    if (!moveButton) throw new Error(`"Move" button not found for folder: ${folderName}`);

    moveButton.click();
    await sleep(1500); // Wait for action to complete and UI to update.

    console.log(`✅ Moved emails from ${folderName} to Inbox.`);
    return { status: "success", moved: mailCount, folder: folderName };

  } catch (e) {
    console.error(`Error in moveAllToInbox for ${folderName}:`, e.message);
    return { status: "error", message: e.message };
  }
}

/**
 * Iterates through unread emails in the inbox, opens them, and clicks a "safe" link.
 * @returns {Promise<object>} A status object with the count of processed emails.
 */
async function openAndClickUnreadMails() {
  try {
    let processedCount = 0;
    const maxToProcess = 50; // Safety break to prevent infinite loops.

    for (let i = 0; i < maxToProcess; i++) {
      await waitForElement('div[role="main"] table[role="grid"]', 5000).catch(() => {});
      // Unread emails have a class 'zE'.
      const nextUnread = document.querySelector('tr.zE');
      if (!nextUnread) {
        console.log("No more unread emails found.");
        break; // Exit loop if no unread emails are left.
      }

      nextUnread.click();
      await waitForElement('div.a3s', 8000); // Wait for email body to load.
      await sleep(1000);

      // Find a "safe" link to click. Avoids unsubscribe, spam, etc.
      const emailBody = document.querySelector('div.a3s');
      if (emailBody) {
        const links = Array.from(emailBody.querySelectorAll('a[href]'));
        const badKeywords = ["unsubscribe", "report", "spam", "abuse", "block", "privacy", "terms"];
        const safeLink = links.find(a => {
          const text = (a.textContent || "").toLowerCase();
          const href = (a.getAttribute("href") || "").toLowerCase();
          return !badKeywords.some(kw => text.includes(kw) || href.includes(kw));
        });

        if (safeLink) {
          console.log("Found safe link, clicking:", safeLink.href);
          safeLink.setAttribute("target", "_blank"); // Open in new tab to avoid navigation issues.
          safeLink.click();
          await sleep(500);
        }
      }

      // Go back to the inbox view.
      const backButton = document.querySelector('div[data-tooltip="Back to Inbox"]');
      if (backButton && isVisible(backButton)) {
        backButton.click();
      } else {
        window.history.back(); // Fallback
      }
      await sleep(1500); // Wait for inbox to reload.
      processedCount++;
    }

    console.log(`📩 Processed ${processedCount} inbox emails.`);
    return { status: "success", processed: processedCount };
  } catch (e) {
    console.error("Error in openAndClickUnreadMails:", e.message);
    return { status: "error", message: e.message };
  }
}

/**
 * Extracts the email address of the currently logged-in user.
 * @returns {{email: string}|null}
 */
function getAccountEmail() {
    // This selector targets the account info tooltip area in the top right.
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

// Listens for messages from the background script.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "moveSpamToInbox":
      moveAllToInbox("Spam").then(sendResponse);
      break;
    case "movePromotionsToInbox":
      moveAllToInbox("Promotions").then(sendResponse);
      break;
    case "moveUpdatesToInbox":
      moveAllToInbox("Updates").then(sendResponse);
      break;
    case "moveSocialToInbox":
      moveAllToInbox("Social").then(sendResponse);
      break;
    case "processInboxMails":
      openAndClickUnreadMails().then(sendResponse);
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
  // Return true to indicate we will send a response asynchronously.
  return true;
});

console.log("Gmail Warmup content script loaded.");
