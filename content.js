window.isProcessingPaused = false;
let count = 0;
let unreadCount = 0;
let emails = [];
let currentIndex = 0;
const openedLinks = new Set();
let isProcessingSocialTab = false;

// Add service worker heartbeat
function keepServiceWorkerActive() {
  const HEARTBEAT_INTERVAL = 1000 * 60 * 60 * 6; // 6 hours
  
  setInterval(() => {
    try {
      // Send a message to the service worker to keep it alive
      chrome.runtime.sendMessage({ type: 'HEARTBEAT' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Service worker heartbeat failed:', chrome.runtime.lastError);
          // Try to reconnect
          chrome.runtime.connect({ name: 'keepAlive' });
        } else {
          console.log('Service worker heartbeat successful');
        }
      });
    } catch (error) {
      console.log('Error in service worker heartbeat:', error);
      // Try to reconnect
      try {
        chrome.runtime.connect({ name: 'keepAlive' });
      } catch (e) {
        console.log('Failed to reconnect service worker:', e);
      }
    }
  }, HEARTBEAT_INTERVAL);
}

// Initialize service worker heartbeat
keepServiceWorkerActive();

// Add error handling for extension context
function handleExtensionError() {
  console.log('Extension context error detected, refreshing page...');
  
  // Force reload using multiple methods
  try {
    // Method 1: Direct reload
    window.location.reload(true);
  } catch (e) {
    console.log('First reload method failed, trying alternative...');
    try {
      // Method 2: Replace current location
      window.location.replace(window.location.href);
    } catch (e2) {
      console.log('Second reload method failed, trying final method...');
      try {
        // Method 3: Force reload with cache clearing
        window.location.href = window.location.href + '?t=' + new Date().getTime();
      } catch (e3) {
        console.log('All reload methods failed, attempting to reload parent...');
        try {
          // Method 4: Try to reload parent window
          window.parent.location.reload(true);
        } catch (e4) {
          console.log('All reload attempts failed');
        }
      }
    }
  }
}
// Add error listener for extension context
window.addEventListener('error', (event) => {
  if (event.message.includes('Extension context invalidated')) {
    console.log('Extension context error detected');
    handleExtensionError();
  }
});
// Add periodic extension context check
function checkExtensionContext() {
  try {
    // Test if extension context is valid
    chrome.runtime.getURL('');
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.log('Extension context check failed, refreshing page...');
      handleExtensionError();
    }
  }
}

// Check extension context every 2 minutes
setInterval(checkExtensionContext, 2 * 60 * 1000);

// Add hourly reload functionality
function setupHourlyReload() {
  const ONE_HOUR = 18 * 60 * 1000; // 18 minutes in milliseconds
  console.log('Setting up hourly reloadle...');
 
  setInterval(() => {
    console.log('Performing hourly reload...');
    handleExtensionError();
  }, ONE_HOUR);
}
 
// Initialize hourly reload
setupHourlyReload();
 
const SERVER_CONFIG = {
  urls: [
    'https://insights.warmupip.com'
  ],
  endpoint: '/api/v1/combined',
  token: 'Bearer TsiTsgDUROQTZpAWKSNOmeVrwKmNuALnrKQBGdrWTw',
  currentUrl: null // Will store the working URL
};
 
function simulateClick(element) {
  if (element) {
    // Create and dispatch mouse events
    const mouseDownEvent = new MouseEvent('mousedown', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: element.getBoundingClientRect().left + 10,
      clientY: element.getBoundingClientRect().top + 10
    });
   
    const mouseUpEvent = new MouseEvent('mouseup', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: element.getBoundingClientRect().left + 10,
      clientY: element.getBoundingClientRect().top + 10
    });
   
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: element.getBoundingClientRect().left + 10,
      clientY: element.getBoundingClientRect().top + 10
    });
 
    element.dispatchEvent(mouseDownEvent);
    element.dispatchEvent(mouseUpEvent);
    element.dispatchEvent(clickEvent);
   
    console.log('✅ Element clicked successfully');
  }
}
 
function simulateButtonClick(element) {
  if (element) {
    element.click();
    console.log('✅ Button clicked successfully');
  }
}
 
function handleAccountDetails() {
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        const accountDetails = document.querySelector(".gb_Bc");
        const firstNameElement = document.querySelector(".gb_g");
 
        if (accountDetails && firstNameElement) {
          const emailElement = accountDetails.querySelectorAll("div")[2];
          const email = emailElement ? emailElement.textContent.trim() : "Email not found";
          const firstNameFull = firstNameElement.textContent.trim();
          const nameParts = firstNameFull.split(" ");
          const firstName = nameParts[0];
          const lastName = nameParts.slice(1).join(" ") || "";
 
          chrome.storage.local.get({ emails: [] }, (data) => {
            const emailExists = data.emails.some(entry => entry.email === email);
 
            if (!emailExists) {
              const updatedEmails = [...data.emails, { first_name: firstName, last_name: lastName, email: email }];
              chrome.storage.local.set({ emails: updatedEmails }, () => {
                console.log("Email and names stored in chrome.storage");
              });
            } else {
              console.log("Email already exists, not adding again.");
            }
          });
 
          const currentUrl = window.location.href;
 
          chrome.storage.local.get({ urlVisitCounts: {}, breakTime: 8, currentAccountIndex: 0 }, (data) => {
            const urlVisitCounts = data.urlVisitCounts;
            const currentAccountIndex = data.currentAccountIndex || 0;
 
            const breakValue = (parseInt(data.breakTime) * 60000) || 8000;
 
            console.log(`Break Value Retrieved: ${breakValue} milliseconds`);
           
 
            if (!urlVisitCounts[currentUrl]) {
              urlVisitCounts[currentUrl] = 1;
            } else {
              urlVisitCounts[currentUrl]++;
            }
 
            chrome.storage.local.set({ urlVisitCounts }, () => {
              const visitCount = urlVisitCounts[currentUrl];
              console.log(`Visited URL: ${currentUrl}, Count: ${visitCount}`);
 
              if (visitCount > 1) {
                console.log(`URL ${currentUrl} visited more than 1 time. Proceeding with unread emails.`);
 
                setTimeout(() => {
                  processUnreadEmails();  
              }, 10000);  
             
 
                return;
              } else {
                setTimeout(() => {
                  navigateToNextAccount(currentUrl, currentAccountIndex);  
                }, 8000);
              }
            });
          });
 
          observer.disconnect();
          return;
        } else {
          console.log("Account details element with class 'gb_zc' or 'gb_g' not found.");
          processUnreadEmails(0);  
        }
 
        observer.disconnect();
        return;
      }
    }
  });
 
  observer.observe(document.body, { childList: true, subtree: true });
}
 
 
 
 
 
 
function navigateToNextAccount(currentUrl) {
  const urlMatch = currentUrl.match(/\/mail\/u\/(\d+)\//);
 
  if (urlMatch) {
    const currentIndex = parseInt(urlMatch[1], 10);
    const nextIndex = currentIndex + 1;
 
    const newUrl = `https://mail.google.com/mail/u/${nextIndex}/#inbox`;
 
    console.log(`Switching to account: ${nextIndex}`);
    console.log(`New URL: ${newUrl}`);
 
    window.location.replace(newUrl);
  } else {
    console.log("Failed to parse current URL for account index.");
  }
}
 
async function processUnreadEmails() {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting unread email processing.");
    return;
  }
 
  const emails = Array.from(
    new Set(Array.from(document.querySelectorAll("tr.zA.zE")))
  );
  const unreadCount = emails.length;
 
  if (unreadCount === 0) {
    console.log("No unread emails found.");
    navigateToSpam();
    return;
  }
 
  console.log(`Found ${unreadCount} unread emails.`);
 
  // Get the current email from the account
  const currentEmail = getExtractedEmail();
  if (currentEmail) {
    console.log("Current email account:", currentEmail);
   
    // Always call the combined API before processing emails
    console.log("Calling combined API before processing emails...");
    try {
      const apiResult = await callCombinedAPI([{
        email: currentEmail,
        status: "Active",
        last_active: new Date().toISOString().slice(0, 19).replace('T', ' ')
      }]);
      console.log("Combined API result:", apiResult);
    } catch (error) {
      console.error("Error calling combined API:", error);
      // Continue with email processing even if API call fails
    }
  }
 
  const shuffledEmails = shuffleArray(emails);
  let currentIndex = 0;
 
  processNextEmail(shuffledEmails, currentIndex);
}
 
function isUnsubscribeLink(url, text) {
  const unsubscribeWords = [
    'unsubscribe',
    'opt-out',
    'optout',
    'remove',
    'remove me',
    'remove-me',
    'remove_me',
    'unsub',
    'un-sub',
    'un_sub',
    'cancel',
    'stop',
    'stop receiving',
    'stop-receiving',
    'stop_receiving',
    'preferences',
    'email preferences',
    'email-preferences',
    'email_preferences',
    'manage preferences',
    'manage-preferences',
    'manage_preferences',
    'subscription',
    'subscription preferences',
    'subscription-preferences',
    'subscription_preferences'
  ];
 
  const lowerUrl = url.toLowerCase();
  const lowerText = text.toLowerCase();
 
  return unsubscribeWords.some(word =>
    lowerUrl.includes(word) ||
    lowerText.includes(word)
  );
}
 
function processNextEmail(emails, currentIndex) {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting next email processing.");
    return;
  }
 
  if (currentIndex >= emails.length) {
    console.log("All unread emails processed.");
    navigateToSpam();
    return;
  }
 
  const email = emails[currentIndex];
  console.log(`Processing email ${currentIndex + 1} of ${emails.length}...`);
  email.scrollIntoView();
  email.click();
 
  setTimeout(() => {
    const messageId = getMessageId();
    const extractedEmail = getExtractedEmail();
 
    if (!messageId) {
      console.log(`No messageId found for email ${currentIndex + 1}, checking for links...`);
      const links = document.querySelectorAll('div[role="main"] a');
      let linkFound = false;
 
      for (const link of links) {
        const linkUrl = link.href;
        const linkText = link.innerText.toLowerCase();
 
        if (
          link.offsetParent !== null &&
          !openedLinks.has(linkUrl) &&
          !isUnsubscribeLink(linkUrl, linkText) &&
          linkUrl.startsWith("http")
        ) {
          openedLinks.add(linkUrl);
          console.log(`Opening link: ${linkUrl}`);
          // Open new tab using chrome.tabs API for better control
          chrome.runtime.sendMessage({
            action: "openTab",
            url: linkUrl
          }, (response) => {
            if (response && response.tabId) {
              // Store the tab ID for later closing
              const tabId = response.tabId;
              const randomDelay = 4000;
              console.log(`Keeping link open for ${randomDelay / 1000} seconds`);
              
              // Close the tab after delay
              setTimeout(() => {
                closeTab(tabId, () => {
                  try {
                    window.focus();
                    // Proceed after a short delay
                    setTimeout(() => {
                      proceedToMarkImportant(emails, currentIndex);
                    }, 500);
                  } catch (error) {
                    console.error("Error focusing window:", error);
                    proceedToMarkImportant(emails, currentIndex);
                  }
                });
              }, randomDelay);
            } else {
              console.log("Failed to open tab, proceeding with email processing");
              proceedToMarkImportant(emails, currentIndex);
            }
          });
          linkFound = true;
          break;
        }
      }
 
      if (!linkFound) {
        console.log("No valid links found, proceeding to next email");
        moveToNextEmail(emails, currentIndex);
      }
      return;
    }
 
    console.log(`Processing email ${currentIndex + 1}:`, extractedEmail, messageId);
 
    chrome.runtime.sendMessage(
      {
        type: "POST_MESSAGE_ID",
        messageId: messageId,
        emailType: "inbox",
      },
      (response) => {
        console.log(`Posting message-id: ${messageId} to inbox...`);
   
        if (response.status === "success") {
          console.log(`Successfully posted message-id: ${messageId}`);
        } else {
          console.error(`Error posting message-id: ${response.error}`);
        }
   
        chrome.runtime.sendMessage(
          {
            action: "checkEmailReplies",
            message_id: messageId,
            email: extractedEmail,
          },
          (response) => {
            if (response && response.success) {
              console.log(`Successfully checked replies for message-id: ${messageId}, Response:`, response.message);
              replyToEmail(response.message, () => {
                console.log(`Replied to email for message-id: ${messageId}`);
              });
            } else {
              console.error("Failed to check replies or response is undefined.");
            }
   
            if (messageId) {
              handleLinksInEmail(emails, currentIndex);
            }
          }
        );
      }
    );
  }, 2000);
}
 
 
// Helper function to simulate keyboard shortcuts
function simulateKeyPress(key, ctrl = false, shift = false, alt = false) {
  const event = new KeyboardEvent('keydown', {
    key: key,
    code: 'Key' + key.toUpperCase(),
    ctrlKey: ctrl,
    shiftKey: shift,
    altKey: alt,
    keyCode: key.charCodeAt(0),
    which: key.charCodeAt(0),
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(event);
}

// Function to close tab using multiple methods
function closeTab(tabId, callback) {
  if (tabId) {
    // Try using chrome.tabs API first
    chrome.runtime.sendMessage({
      action: "closeTab",
      tabId: tabId
    }, (response) => {
      if (response && response.success) {
        console.log("Tab closed successfully");
      } else {
        console.error("Failed to close tab:", response ? response.error : "Unknown error");
        // Fallback to keyboard shortcut if API fails
        simulateKeyPress('w', true, false, false);
      }
      if (typeof callback === 'function') {
        callback();
      }
    });
  } else if (typeof callback === 'function') {
    callback();
  }
}

function handleLinksInEmail(emails, currentIndex) {
  const links = document.querySelectorAll('div[role="main"] a');
  let linkOpened = false;
  let openedTabId = null;
  let tabCloseTimeout = null;

  if (links.length === 0) {
    console.log("No links found in email.");
    processUnreadEmails();
    return;
  }

  for (const link of links) {
    const linkUrl = link.href;
    const linkText = link.innerText.toLowerCase();

    if (
      link.offsetParent !== null &&
      !openedLinks.has(linkUrl) &&
      !isUnsubscribeLink(linkUrl, linkText) &&
      linkUrl.startsWith("http")
    ) {
      openedLinks.add(linkUrl);

      try {
        console.log(`Opening link: ${linkUrl}`);
        // Open new tab using chrome.tabs API for better control
        chrome.runtime.sendMessage({
          action: "openTab",
          url: linkUrl
        }, (response) => {
          if (response && response.tabId) {
            // Store the tab ID for later closing
            openedTabId = response.tabId;
            
            const randomDelay = 4000;
            console.log(`Keeping link open for ${randomDelay / 1000} seconds`);
            
            // Clear any existing timeout
            if (tabCloseTimeout) {
              clearTimeout(tabCloseTimeout);
            }

            // Set timeout to close the tab
            tabCloseTimeout = setTimeout(() => {
              closeTab(openedTabId, () => {
                // Focus back on main window
                try {
                  window.focus();
                  
                  // If we're still on the same tab after closing, try keyboard shortcut
                  setTimeout(() => {
                    if (document.visibilityState === 'visible') {
                      console.log('Using keyboard shortcut to close tab');
                      simulateKeyPress('w', true, false, false);
                    }
                    
                    // Proceed after a short delay
                    setTimeout(() => {
                      proceedToMarkImportant(emails, currentIndex);
                    }, 500);
                  }, 1000);
                  
                } catch (focusError) {
                  console.error("Error focusing main window:", focusError);
                  proceedToMarkImportant(emails, currentIndex);
                }
              });
            }, randomDelay);
          } else {
            console.log("Failed to open tab, proceeding with email processing");
            proceedToMarkImportant(emails, currentIndex);
          }
        });

        linkOpened = true;
        break;
      } catch (error) {
        console.error("Error handling link:", error);
        proceedToMarkImportant(emails, currentIndex);
      }
    }
  }

  if (!linkOpened) {
    console.log("No new links to open.");
    proceedToMarkImportant(emails, currentIndex);
  }
}
 
function proceedToMarkImportant(emails, currentIndex) {
  console.log("Proceeding to mark email as important.");
 
  markAsImportant(() => {
    moveToNextEmail(emails, currentIndex);
  });
}
 
 
 
 
 
 
 
function getExtractedEmail() {
  const accountDetails = Array.from(document.querySelectorAll("div")).find(div => div.textContent.trim() === "Google Account");
  if (!accountDetails) {
    console.error("Account details not found.");
    return null;
  }
 
  const parentDiv = accountDetails.parentElement;
  const emailElement = parentDiv.querySelectorAll("div")[2];
  const email = emailElement ? emailElement.textContent.trim() : null;
 
  if (!email) {
    console.error("Failed to extract email from account details.");
  }
 
  return email;
}
 
 
 
 
 
 
function moveToNextEmail(emails, currentIndex) {
  const fixedDelayBeforeInbox = 1000;
 
  setTimeout(() => {
    returnToInbox(() => {
      setTimeout(() => {
        processNextEmail(emails, currentIndex + 1);
      }, 1000);
    });
  }, fixedDelayBeforeInbox);
}
 
 
 
 
function markAsImportant(callback) {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting mark as important.");
    return;
  }
 
  setTimeout(() => {
    try {
      const moreButton =
        document.querySelector('div[aria-label="More options"]') ||
        document.querySelector('div[role="button"]');
      if (moreButton) {
        moreButton.click();
        setTimeout(() => {
          const starIcon =
            document.querySelector('div[aria-label="Not starred"]') ||
            document.querySelector('div[aria-label="Star"]');
          if (starIcon) {
            starIcon.click();
 
            const messageId = getMessageId();
 
            if (messageId) {
              console.log(
                `Marking email as important with messageId: ${messageId}`
              );
              chrome.runtime.sendMessage({
                type: "POST_MESSAGE_ID",
                messageId: messageId,
                emailType: "important",
              });
            } else {
              console.error(
                "Message-ID not found after marking email as important."
              );
            }
 
            setTimeout(callback, 1000);
          } else {
            console.error("Star icon not found.");
            callback();
          }
        }, 1000);
      } else {
        console.error("More options button not found. Retrying...");
        setTimeout(() => markAsImportant(callback), 2000);
      }
    } catch (error) {
      console.error("Error marking as important:", error);
      callback();
    }
  }, 2000);
}
 
function returnToInbox(callback) {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting return to inbox.");
    return;
  }
 
  try {
    if (window.location.hash !== "#inbox") {
      window.location.hash = "#inbox";
      setTimeout(callback, 2000);
    } else {
      console.log("Already in the inbox.");
      processUnreadEmails();
    }
  } catch (error) {
    console.error("Error returning to inbox:", error);
    setTimeout(callback, 2000);
  }
}
 
 
function updateCount(count, unreadCount) {
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(
      { emailCount: count, totalUnread: unreadCount },
      () => {
        console.log(
          `Email count updated: Opened ${count}, Total Unread: ${unreadCount}`
        );
      }
    );
  } else {
    console.error("chrome.storage.local is not available.");
  }
}
 
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
 
 
function replyToEmail(apiMessage, callback) {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting reply.");
    return;
  }
 
  try {
    const replyButton = document.querySelector('div[role="button"][data-tooltip="Reply"]');
 
    if (replyButton) {
      console.log("Reply button found. Clicking to open reply form.");
      replyButton.click();
 
      setTimeout(() => {
        const replyTextarea = document.querySelector('div[aria-label="Message Body"]');
 
        if (replyTextarea) {
          const messageToSend = apiMessage ? `${apiMessage}` : "I'll review your suggestion with the team!";
          replyTextarea.innerText = messageToSend;
 
          const sendButton = document.querySelector('div[aria-label="Send ‪(Ctrl-Enter)‬"]');
          if (sendButton) {
            if (apiMessage) {
              setTimeout(() => {
                sendButton.click();
                console.log("Reply sent successfully.");
                callback();
              }, 4000);
            } else {
              console.log("No valid API message to send.");
              callback();
            }
          } else {
            console.error("Send button not found.");
          }
        } else {
          console.error("Reply textarea not found.");
        }
      }, 3000);
    } else {
      console.error("Reply button not found.");
      callback();
    }
  } catch (error) {
    console.error("Error replying to the email:", error);
    callback();
  }
}
 
async function callCombinedAPI(emails) {
  console.log('🚀 ===== COMBINED API CALL STARTED =====');
 
  // Get location and system name from storage
  const { location, systemName } = await new Promise(resolve => {
    chrome.storage.local.get(['location', 'systemName'], (result) => {
      resolve({
        location: result.location || 'kukatapally',
        systemName: result.systemName || 'Laptop-003'
      });
    });
  });
 
  // Get current time in Asia/Kolkata timezone
  const getLocalTime = () => {
    const now = new Date();
    const options = {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
   
    const formatter = new Intl.DateTimeFormat('en-IN', options);
    const parts = formatter.formatToParts(now);
   
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;
   
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  };
 
  // Log the current local time for debugging
  const currentTime = getLocalTime();
  console.log('Current Asia/Kolkata time:', currentTime);
 
  const payload = {
    gmail_list: {
      location: location
    },
    laptop_detail: {
      laptop_name: systemName
    },
    email_detail: emails.map(email => {
      const localTime = getLocalTime();
      console.log('Using Asia/Kolkata time:', localTime);
      return {
        email: email.email,
        status: email.status,
        last_active: localTime
      };
    })
  };
 
  console.log('📦 API Payload:', JSON.stringify(payload, null, 2));
 
  try {
    const response = await fetch(SERVER_CONFIG.urls[0] + SERVER_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': SERVER_CONFIG.token,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(payload),
      mode: 'cors',
      credentials: 'omit'
    });
 
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
 
    const data = await response.json();
    console.log('📥 API Response:', data);
   
    // Mark the email as processed after a successful API call
    chrome.storage.local.get(['processedEmails'], (result) => {
      const processedEmails = result.processedEmails || [];
      const newProcessedEmails = [...processedEmails, ...emails.map(e => e.email)];
      chrome.storage.local.set({ processedEmails: newProcessedEmails });
    });
     
    console.log('✅ API call successful');
    console.log('🚀 ===== COMBINED API CALL COMPLETED =====');
    return data;
  } catch (error) {
    console.error('❌ API call failed:', error);
    return null;
  }
}
 
function clearProcessedEmails() {
  chrome.storage.local.set({ processedEmails: [] }, () => {
    console.log('Cleared processedEmails array');
  });
}
 
function formatDateForAPI() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
 
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
 
function observeForSearchBox() {
  const maxWaitTime = 10000;
  let searchFound = false;
  const currentUrl = window.location.href;
 
  // Clear processed emails at the start of observation
  clearProcessedEmails();
 
  const observer = new MutationObserver(() => {
    const searchBox = document.querySelector('input[name="q"]');
    if (searchBox) {
      searchFound = true;
      observer.disconnect();
      searchBox.value = "";
      console.log("Search term 'superstar' set in search box.");
      setTimeout(handleAccountDetails, 10000);
    }
  });
 
  observer.observe(document.body, { childList: true, subtree: true });
 
  setTimeout(async () => {
    console.log(`Current URL: ${currentUrl}`);
    if (!searchFound) {
      console.log(`Search box not found on URL: ${currentUrl}.`);
 
      // Try multiple selector approaches
      const emailDivs1 = document.querySelectorAll('div.SfkAJe div.yAlK0b[jsname="bQIQze"]');
      const emailDivs2 = document.querySelectorAll('div.yAlK0b[jsname="bQIQze"][data-email]');
      const emailDivs3 = document.querySelectorAll('div.HOE91e div.JQ5tlb, div[jsname="bQIQze"].IxcUte, div.gb_Ac > div:last-child');
     
      // Combine all found elements
      const emailDivs = [...emailDivs1, ...emailDivs2, ...emailDivs3];
     
      console.log('Found elements with first selector:', emailDivs1.length);
      console.log('Found elements with second selector:', emailDivs2.length);
      console.log('Found elements with third selector:', emailDivs3.length);
 
      if (emailDivs.length > 0) {
        console.log(`Total email divs found: ${emailDivs.length}`);
       
        // Log each found element for debugging
        emailDivs.forEach((div, index) => {
          console.log(`Element ${index + 1}:`, {
            class: div.className,
            jsname: div.getAttribute('jsname'),
            text: div.textContent,
            dataEmail: div.getAttribute('data-email'),
            isVisible: div.offsetParent !== null,
            parentClasses: div.parentElement ? div.parentElement.className : 'no parent'
          });
        });
 
        const emails = Array.from(emailDivs)
          .map((emailDiv) => {
            // Try to get email from data-email attribute first
            const dataEmail = emailDiv.getAttribute("data-email");
            if (dataEmail) {
              console.log(`Found email from data-email attribute: ${dataEmail}`);
              return dataEmail;
            }
           
            // Then try text content
            if (emailDiv.textContent.includes('@')) {
              console.log(`Found email from text content: ${emailDiv.textContent.trim()}`);
              return emailDiv.textContent.trim();
            }
           
            // Finally try specific class
            if (emailDiv.classList.contains("IxcUte")) {
              console.log(`Found email from IxcUte class: ${emailDiv.textContent.trim()}`);
              return emailDiv.textContent.trim();
            }
           
            return null;
          })
          .filter((email) => email);
 
        console.log("Extracted emails:", emails);
 
        if (emails.length > 0) {
          // Check if these emails have already been processed
          chrome.storage.local.get(['processedEmails'], async (result) => {
            const processedEmails = result.processedEmails || [];
           
            // Clear processedEmails if it's too large (more than 1000 emails)
            if (processedEmails.length > 1000) {
              chrome.storage.local.set({ processedEmails: [] }, () => {
                console.log('Cleared processedEmails array due to size limit');
              });
              processedEmails = [];
            }

            // Filter out already processed emails
            const newEmails = emails.filter(email => !processedEmails.includes(email));

            if (newEmails.length > 0) {
              console.log("New emails to process:", newEmails);

              // Store the new emails in chrome.storage.local under unsubscribeEmails key
              chrome.storage.local.get(['unsubscribeEmails'], (result) => {
                const existingEmails = result.unsubscribeEmails || [];
                const updatedEmails = [...new Set([...existingEmails, ...newEmails])]; // Remove duplicates
                chrome.storage.local.set({ unsubscribeEmails: updatedEmails }, () => {
                  console.log(`Stored ${updatedEmails.length} emails in unsubscribeEmails storage`);
                });
              });

              // Prepare the payload with inactive status
              const payload = {
                gmail_list: {
                  location: await new Promise(resolve => {
                    chrome.storage.local.get(['location'], (result) => {
                      resolve(result.location || 'kukatapally');
                    });
                  })
                },
                laptop_detail: {
                  laptop_name: await new Promise(resolve => {
                    chrome.storage.local.get(['systemName'], (result) => {
                      resolve(result.systemName || 'Laptop-003');
                    });
                  })
                },
                email_detail: newEmails.map(email => ({
                  email: email,
                  status: "inactive",
                  last_active: formatDateForAPI()
                }))
              };
 
              console.log('📦 API Payload for inactive emails:', JSON.stringify(payload, null, 2));
 
              try {
                const response = await fetch(SERVER_CONFIG.urls[0] + SERVER_CONFIG.endpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': SERVER_CONFIG.token,
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                  },
                  body: JSON.stringify(payload)
                });
 
                if (response.ok) {
                  console.log('✅ Successfully sent inactive emails to API');
                  // Mark emails as processed
                  chrome.storage.local.set({
                    processedEmails: [...processedEmails, ...newEmails]
                  });
                } else {
                  console.error('❌ Failed to send inactive emails to API:', response.status);
                }
              } catch (error) {
                console.error('❌ Error sending inactive emails to API:', error);
              }
            } else {
              console.log("All emails have already been processed");
            }
          });
        } else {
          console.log("No emails extracted to process.");
        }
      } else {
        console.log("No email divs found.");
      }
    }
  }, maxWaitTime);
}
 
function processEmails(emails) {
  chrome.storage.local.get(
    ["unsubscribeEmails", "processedEmails"],
    (result) => {
      const unsubscribeEmails = result.unsubscribeEmails || [];
      const processedEmails = result.processedEmails || [];
 
      const updatedProcessedEmails = Array.from(new Set([...processedEmails, ...emails]));
 
      const updatedUnsubscribeEmails = Array.from(new Set([...unsubscribeEmails, ...emails]));
 
      chrome.storage.local.set(
        {
          processedEmails: updatedProcessedEmails,
          unsubscribeEmails: updatedUnsubscribeEmails
        },
        () => {
          console.log(
            `Processed emails updated: ${updatedProcessedEmails.join(", ")}`
          );
          console.log(
            `Unsubscribe list updated: ${updatedUnsubscribeEmails.join(", ")}`
          );
           incrementUrlAndOpenTab();
        }
      );
    }
  );
}
 
 
 
function incrementUrlAndOpenTab() {
  chrome.storage.local.get(["nextAccountUrl"], (result) => {
    if (chrome.runtime.lastError) {
      console.error(`Error retrieving URL: ${chrome.runtime.lastError}`);
    } else {
      let storedUrl = result.nextAccountUrl || "https://mail.google.com/mail/u/0/";
      console.log(`Stored next account URL: ${storedUrl}`);
 
      if (storedUrl !== "No URL found") {
        storedUrl = incrementUrl(storedUrl);
        console.log(`Incremented URL: ${storedUrl}`);
 
        chrome.storage.local.set({ nextAccountUrl: storedUrl }, () => {
          console.log(`Updated next account URL in storage: ${storedUrl}`);
 
          window.location.href = storedUrl;
        });
      } else {
        console.log("No valid URL found to open in a new tab.");
      }
    }
  });
}
 
function incrementUrl(url) {
  const match = url.match(/\/u\/(\d+)\//);
  if (match && match[1]) {
    const currentNumber = parseInt(match[1], 10);
    let incrementedNumber = currentNumber + 1;
 
    // Reset to 0 if the incremented number is 10 or higher
    if (incrementedNumber >= 10) {
      incrementedNumber = 0;
    }
 
    return url.replace(`/u/${currentNumber}/`, `/u/${incrementedNumber}/`);
  }
  return url;
}
 
 
function navigateToInbox() {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting navigation to Inbox.");
    return;
  }
 
  if (window.location.hash !== "#inbox") {
    window.location.hash = "#inbox";
    console.log("Navigating to Inbox folder...");
    setTimeout(() => {
      console.log("Navigated to Inbox folder.");
      openPromotionsTab();
    }, 5000);
  } else {
    console.log("Already in Inbox folder.");
    openPromotionsTab();
  }
}
 
 
 
function getMessageId() {
  const anchorElement = document.querySelector("a[id*='msg-id']");
 
  if (anchorElement) {
    const hrefValue = anchorElement.getAttribute("href");
 
    if (hrefValue) {
      const messageIdMatch = hrefValue.match(/reply\/([^?]+)/);
      if (messageIdMatch && messageIdMatch[1]) {
        return messageIdMatch[1];
      }
    }
  }
 
  return null;
}
 
 
function navigateToSocialTab(callback) {
  if (isProcessingSocialTab) {
    console.log('⚠️ Social tab is already being processed, skipping...');
    setTimeout(() => {
      switchToNextAccount();
    }, 5000);
 
    return;
  }
 
  isProcessingSocialTab = true;
  console.log('🚀 Starting social tab processing...');
 
  const socialTab = Array.from(document.querySelectorAll(".aKz")).find(
    (element) => element.innerText.includes("Social")
  );
 
  if (socialTab) {
    console.log("Social tab found:", socialTab);
    socialTab.scrollIntoView();
    simulateClick(socialTab);
    console.log("Clicked Social tab");
 
    setTimeout(() => {
      const selectAllCheckbox = Array.from(document.querySelectorAll('span[role="checkbox"]'))
        .find(el => el.offsetParent !== null && el.getAttribute('aria-checked') === 'false');
     
      if (selectAllCheckbox) {
        simulateRealClick(selectAllCheckbox);
        console.log('☑️ Select all checkbox clicked in Social tab!');
        setTimeout(() => {
          rightClickFirstEmail(() => {
            console.log('✅ Completed social tab operations, switching to next account...');
            isProcessingSocialTab = false;
            setTimeout(() => {
              switchToNextAccount();
            }, 5000);
          });
        }, 5000);
      } else {
        console.log('❌ Select all checkbox not found or already checked in Social tab');
        isProcessingSocialTab = false;
        setTimeout(() => {
          switchToNextAccount();
        }, 5000);
      }
    }, 5000);
  } else {
    console.log("Social tab not found");
    isProcessingSocialTab = false;
    setTimeout(() => {
      switchToNextAccount();
    }, 5000);
  }
}
 
function rightClickFirstEmail(callback) {
  const emailRows = Array.from(document.querySelectorAll('tr.zA'));
 
  if (!emailRows.length) {
    console.log('❌ No email rows found to right-click.');
    if (callback) {
      console.log('✅ No emails found, proceeding to next account...');
      callback();
    }
    return;
  }
 
  let attempts = 0;
  const maxAttempts = emailRows.length;
 
  function tryRightClick(index) {
    if (index >= emailRows.length) {
      console.log('❌ No email triggered "Move to tab". All emails checked.');
      if (callback) {
        console.log('✅ All emails checked, proceeding to next account...');
        callback();
      }
      return;
    }
 
    const row = emailRows[index];
 
    if (!row || row.offsetParent === null || row.getBoundingClientRect().width === 0) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.log('❌ Maximum attempts reached, proceeding to next account...');
        if (callback) callback();
        return;
      }
      return tryRightClick(index + 1);
    }
 
    const rect = row.getBoundingClientRect();
    const rightClickEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + 10,
      clientY: rect.top + 10,
      button: 2
    });
 
    row.dispatchEvent(rightClickEvent);
    console.log(`🖱️ Tried right-click on email #${index + 1}`);
 
    setTimeout(() => {
      const moveToTab = Array.from(document.querySelectorAll('div.J-N.J-Ph[role="menuitem"]'))
        .find(el => el.textContent.includes('Move to tab'));
 
      if (moveToTab) {
        const moveRect = moveToTab.getBoundingClientRect();
        const mouseOverEvent = new MouseEvent('mouseover', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: moveRect.left + 5,
          clientY: moveRect.top + 5
        });
 
        moveToTab.dispatchEvent(mouseOverEvent);
        console.log('🪄 Hovered over "Move to tab"');
 
        setTimeout(() => {
          const primaryItem = Array.from(document.querySelectorAll('div.J-N-Jz'))
            .find(el => el.textContent.trim() === 'Primary');
 
          if (primaryItem) {
            const primaryRect = primaryItem.getBoundingClientRect();
 
            ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
              const evt = new MouseEvent(evtType, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: primaryRect.left + 5,
                clientY: primaryRect.top + 5
              });
              primaryItem.dispatchEvent(evt);
            });
 
            console.log('📥 Simulated real user click on "Primary" tab!');
            setTimeout(() => {
              if (callback) {
                console.log('✅ Primary tab clicked, proceeding to next account...');
                callback();
              }
            }, 5000);
          } else {
            console.log('❌ "Primary" submenu item not found.');
            setTimeout(() => {
              if (callback) {
                console.log('✅ Primary not found, proceeding to next account...');
                callback();
              }
            }, 5000);
          }
        }, 5000);
      } else {
        console.log('❌ "Move to tab" not found, trying next email...');
        attempts++;
        if (attempts >= maxAttempts) {
          console.log('❌ Maximum attempts reached, proceeding to next account...');
          if (callback) callback();
          return;
        }
        tryRightClick(index + 1);
      }
    }, 5000);
  }
 
  tryRightClick(0);
}
 
function switchToNextAccount() {
  const currentUrl = window.location.href;
  console.log(`Current URL: ${currentUrl}`);
 
  const urlMatch = currentUrl.match(/\/u\/(\d+)\//);
 
  if (urlMatch) {
    const currentIndex = parseInt(urlMatch[1], 10);
 
    chrome.storage.local.get(["activeAccounts", "totalAccounts", "breakTime"], (data) => {
      const activeAccounts = data.activeAccounts || 0;
      const totalAccounts = data.totalAccounts || 0;
      const breakValue = (parseInt(data.breakTime) * 60000) || 8000;
 
      console.log(`Active accounts: ${activeAccounts}`);
      console.log(`Total accounts: ${totalAccounts}`);
      console.log(`Break Value Retrieved: ${breakValue} milliseconds`);
 
      const nextIndex = currentIndex + 1;
      console.log(`Next account index: ${nextIndex}`);
 
      const newUrl = `https://mail.google.com/mail/u/${nextIndex}/`;
 
      if (nextIndex === totalAccounts) {
       
        console.log(`Switching to account: ${nextIndex} with break time.`);
        setTimeout(() => {
          console.log(`Redirecting to: ${newUrl}`);
          chrome.storage.local.set({ nextAccountUrl: newUrl }, () => {
            if (chrome.runtime.lastError) {
              console.error(`Error storing URL: ${chrome.runtime.lastError}`);
            } else {
              console.log(`Successfully stored next account URL: ${newUrl}`);
            }
          });
          window.location.replace(newUrl);
        }, breakValue);
      } else {
        console.log(`Switching to account: ${nextIndex} without break time.`);
        chrome.storage.local.set({ nextAccountUrl: newUrl }, () => {
          if (chrome.runtime.lastError) {
            console.error(`Error storing URL: ${chrome.runtime.lastError}`);
          } else {
            console.log(`Successfully stored next account URL: ${newUrl}`);
          }
        });
        window.location.replace(newUrl);
      }
    });
  } else {
    console.error("Unable to determine the current account index from the URL.");
  }
}
 
 
 
 
 
 
 
 
 
 
function simulateRealClick(element) {
  if (element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
 
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
      const evt = new MouseEvent(evtType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY
      });
      element.dispatchEvent(evt);
    });
   
    console.log('✅ Element clicked with real click simulation');
  }
}
 
function rightClickFirstEmail() {
  const emailRows = Array.from(document.querySelectorAll('tr.zA'));
 
  if (!emailRows.length) {
    console.log('❌ No email rows found to right-click.');
    setTimeout(() => {
      navigateToSocialTab();
    }, 3000);
    return;
  }
 
  function tryRightClick(index) {
    if (index >= emailRows.length) {
      console.log('❌ No email triggered "Move to tab". All emails checked.');
      setTimeout(() => {
        navigateToSocialTab();
      }, 3000);
      return;
    }
 
    const row = emailRows[index];
 
    if (!row || row.offsetParent === null || row.getBoundingClientRect().width === 0) {
      return tryRightClick(index + 1);
    }
 
    const rect = row.getBoundingClientRect();
    const rightClickEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + 10,
      clientY: rect.top + 10,
      button: 2
    });
 
    row.dispatchEvent(rightClickEvent);
    console.log(`🖱️ Tried right-click on email #${index + 1}`);
 
    setTimeout(() => {
      const moveToTab = Array.from(document.querySelectorAll('div.J-N.J-Ph[role="menuitem"]'))
        .find(el => el.textContent.includes('Move to tab'));
 
      if (moveToTab) {
        const moveRect = moveToTab.getBoundingClientRect();
        const mouseOverEvent = new MouseEvent('mouseover', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: moveRect.left + 5,
          clientY: moveRect.top + 5
        });
 
        moveToTab.dispatchEvent(mouseOverEvent);
        console.log('🪄 Hovered over "Move to tab"');
 
        setTimeout(() => {
          const primaryItem = Array.from(document.querySelectorAll('div.J-N-Jz'))
            .find(el => el.textContent.trim() === 'Primary');
 
          if (primaryItem) {
            const primaryRect = primaryItem.getBoundingClientRect();
 
            ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtType => {
              const evt = new MouseEvent(evtType, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: primaryRect.left + 5,
                clientY: primaryRect.top + 5
              });
              primaryItem.dispatchEvent(evt);
            });
 
            console.log('📥 Simulated real user click on "Primary" tab!');
            setTimeout(() => {
              navigateToSocialTab();
            }, 3000);
          } else {
            console.log('❌ "Primary" submenu item not found.');
            setTimeout(() => {
              navigateToSocialTab();
            }, 3000);
          }
        }, 1000);
      } else {
        console.log('❌ "Move to tab" not found, trying next email...');
        tryRightClick(index + 1);
      }
    }, 1000);
  }
 
  tryRightClick(0);
}
 
function PromotionsTab() {
  const promotionsTab = Array.from(document.querySelectorAll(".aKz")).find(
    (element) => element.innerText.includes("Promotions")
  );
 
  if (promotionsTab) {
    console.log("Promotions tab found:", promotionsTab);
    promotionsTab.scrollIntoView();
    simulateClick(promotionsTab);
    console.log("Clicked Promotions tab");
 
    setTimeout(() => {
      const selectAllCheckbox = Array.from(document.querySelectorAll('span[role="checkbox"]'))
        .find(el => el.offsetParent !== null && el.getAttribute('aria-checked') === 'false');
     
      if (selectAllCheckbox) {
        simulateRealClick(selectAllCheckbox);
        console.log('☑️ Select all checkbox clicked!');
        setTimeout(() => {
          rightClickFirstEmail();
        }, 3000);
      } else {
        console.log('❌ Select all checkbox not found or already checked');
        setTimeout(() => {
          navigateToSocialTab();
        }, 3000);
      }
    }, 3000);
  } else {
    console.log("Promotions tab not found");
    setTimeout(() => {
      navigateToSocialTab();
    }, 3000);
  }
}
 
 
 
function navigateToSpam() {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting navigation to Spam.");
    return;
  }
 
  if (window.location.hash !== "#spam") {
    window.location.hash = "#spam";
    console.log("Navigating to Spam folder...");
    setTimeout(() => {
      console.log("Navigated to Spam folder.");
      selectAllSpamEmails();
    }, 5000);
  } else {
    console.log("Already in Spam folder.");
    selectAllSpamEmails();
  }
}
 
function selectAllSpamEmails() {
  if (window.isProcessingPaused) {
    console.log("Processing paused. Aborting spam email selection.");
    return;
  }
 
  setTimeout(() => {
    const checkboxAll = Array.from(document.querySelectorAll('span[role="checkbox"]')).find(el => el.offsetParent !== null);
    if (checkboxAll) {
      simulateClick(checkboxAll);
      console.log('☑️ All spam emails selected.');
 
      setTimeout(() => {
        const notSpamButton = document.querySelector('div[act="18"][aria-label="Not spam"]');
        if (notSpamButton) {
          console.log('🚫 Clicking "Not spam"...');
          simulateClick(notSpamButton);
 
          setTimeout(() => {
            console.log('📥 Clicking Inbox after Not Spam...');
            const inboxButton = document.querySelector('a[aria-label*="Inbox"]');
            if (inboxButton) {
              simulateClick(inboxButton);
              setTimeout(() => {
                console.log('🔄 Navigating to Promotions tab...');
                PromotionsTab();
              }, 3000);
            } else {
              console.log('❌ Inbox button not found.');
            }
          }, 3000);
        } else {
          console.log('❌ "Not spam" button not found, proceeding to Inbox directly...');
          const inboxButton = document.querySelector('a[aria-label*="Inbox"]');
          if (inboxButton) {
            console.log('📥 Clicking Inbox directly...');
            simulateClick(inboxButton);
            setTimeout(() => {
              console.log('🔄 Navigating to Promotions tab...');
              PromotionsTab();
            }, 3000);
          } else {
            console.log('❌ Inbox button not found.');
          }
        }
      }, 3000);
    } else {
      console.error('❌ Checkbox not found.');
    }
  }, 5000);
}
 
function dispatchMouseEvent(element, eventType) {
  const event = new MouseEvent(eventType, {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  element.dispatchEvent(event);
}
 
function clickNotSpamButton() {
  setTimeout(() => {
    const notSpamButton = document.querySelector(
      'div[role="button"][data-tooltip="Not spam"]'
    );
 
    if (notSpamButton) {
      console.log("Attempting to click 'Not spam' button...");
 
      notSpamButton.focus();
      notSpamButton.scrollIntoView();
 
      dispatchMouseEvent(notSpamButton, "mousedown");
      dispatchMouseEvent(notSpamButton, "mouseup");
      dispatchMouseEvent(notSpamButton, "click");
 
      console.log("Clicked 'Not spam' button with MouseEvent.");
 
      setTimeout(() => {
        console.log("Verifying if emails were removed from Spam...");
        const remainingEmails = document.querySelectorAll(
          'div[role="checkbox"]'
        );
        console.log(
          `After clicking 'Not spam', ${remainingEmails.length} spam emails remain.`
        );
 
        navigateToInbox();
      }, 5000);
    } else {
      console.error("'Not spam' button not found.");
    }
  }, 3000);
}
 
 
observeForSearchBox();



