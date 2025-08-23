// content.js - Runs inside Gmail

/**
 * Utility: wait for an element to appear
 */
function waitForElement(selector, timeout = 7000) {
    return new Promise((resolve, reject) => {
        const intervalTime = 200;
        let waited = 0;
        const interval = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) {
                clearInterval(interval);
                resolve(el);
            } else if ((waited += intervalTime) >= timeout) {
                clearInterval(interval);
                reject(new Error(`Timeout: ${selector}`));
            }
        }, intervalTime);
    });
}

// Small helpers
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function isVisible(el){ return !!el && el.offsetParent !== null; }

/**
 * Count visible mails in current view
 */
function countVisibleMails() {
    const grid = document.querySelector('div[role="main"] table[role="grid"]');
    if (!grid) return 0;
    const rows = Array.from(grid.querySelectorAll('tr[role="row"]'));
    return rows.filter(r => r.querySelector('td')).length;
}

/**
 * Select all emails + move to Inbox
 */
async function moveAllToInbox(folderName = "Unknown") {
    try {
        // Ensure list is present
        await waitForElement('div[role="main"]', 8000);
        const mailCount = countVisibleMails();
        if (mailCount === 0) {
            console.log(`ℹ No mails found in ${folderName}`);
            return { status: "empty", moved: 0 };
        }

        // Click the toolbar select checkbox
        let selectTarget =
            document.querySelector('div[aria-label="Select"] input[type="checkbox"]') ||
            document.querySelector('div[data-tooltip="Select"] span[role="checkbox"]') ||
            document.querySelector('div[aria-label^="Select"] span[role="checkbox"]') ||
            document.querySelector('div[role="checkbox"]');

        if (!selectTarget) {
            const allChecks = Array.from(document.querySelectorAll('span[role="checkbox"], div[role="checkbox"]'));
            selectTarget = allChecks.find(isVisible);
        }
        if (!selectTarget) return { status: "error", message: "Select-all checkbox not found" };

        selectTarget.click();
        await sleep(400);

        // "Select all conversations" banner
        const selectAllBannerLink = Array.from(document.querySelectorAll('span[role="link"], a'))
            .find(n => /select all conversations/i.test(n.textContent || ""));
        if (selectAllBannerLink) { selectAllBannerLink.click(); await sleep(300); }

        const hash = (location.hash || "").toLowerCase();
        const inSpam = hash.includes("#spam");

        const tryClick = (sel) => {
            const el = document.querySelector(sel);
            if (isVisible(el)) { el.click(); return true; }
            return false;
        };

        if (inSpam) {
            if (tryClick('div[aria-label="Not spam"], div[data-tooltip="Not spam"]')) {
                await sleep(1200);
                console.log(`✅ Moved ${mailCount}+ spam mails → Inbox`);
                return { status: "success", moved: mailCount, folder: "Spam" };
            }
        } else {
            if (tryClick('div[aria-label="Move to inbox"], div[data-tooltip="Move to inbox"], div[aria-label="Move to Inbox"], div[data-tooltip="Move to Inbox"]')) {
                await sleep(1200);
                console.log(`✅ Moved ${mailCount}+ mails from ${folderName} → Inbox`);
                return { status: "success", moved: mailCount, folder: folderName };
            }
            if (tryClick('div[aria-label="Move to Primary"], div[data-tooltip="Move to Primary"]')) {
                await sleep(1200);
                console.log(`✅ Moved ${mailCount}+ mails from ${folderName} → Inbox`);
                return { status: "success", moved: mailCount, folder: folderName };
            }
        }

        return { status: "error", message: "Move button not found" };
    } catch (e) {
        return { status: "error", message: e.message };
    }
}

/**
 * Open all unread mails one by one and click a safe link
 */
async function openAndClickAllMails() {
    try {
        let processed = 0;
        let safetyCounter = 0;
        while (true) {
            try { await waitForElement('div[role="main"] table[role="grid"]', 7000); } catch {}
            const nextUnread = document.querySelector('tr.zE');
            if (!nextUnread) break;

            nextUnread.click();
            await waitForElement('div.a3s, h2.hP', 8000);
            await sleep(400);

            const emailBody = document.querySelector('div.a3s.aiL, div.a3s');
            if (emailBody) {
                const links = Array.from(emailBody.querySelectorAll('a[href]'));
                const BAD = ["unsubscribe", "report", "spam", "abuse", "block", "privacy", "terms"];
                const GOOD_HINTS = ["verify", "confirm", "click", "view", "open", "continue", "get started", "activate"];
                const safe = links.find(a => {
                    const t = (a.textContent || "").toLowerCase();
                    const h = (a.getAttribute("href") || "").toLowerCase();
                    if (BAD.some(b => t.includes(b) || h.includes(b))) return false;
                    if (GOOD_HINTS.some(g => t.includes(g))) return true;
                    return true;
                });
                if (safe) {
                    safe.setAttribute("target", "_blank");
                    safe.click();
                    await sleep(500);
                }
            }

            const backBtn =
                document.querySelector('div[aria-label="Back to Inbox"]') ||
                document.querySelector('div[aria-label="Back"]') ||
                document.querySelector('div[aria-label^="Back to"]') ||
                document.querySelector('div[command="Back"]');
            if (backBtn && isVisible(backBtn)) {
                backBtn.click();
            } else {
                window.history.back();
            }
            await sleep(1500);

            processed++;
            if (++safetyCounter > 200) break;
        }
        console.log(`📩 Processed ${processed} inbox mails`);
        return { status: "success", processed };
    } catch (e) {
        return { status: "error", message: e.message };
    }
}

// ===============================
// MESSAGE LISTENER
// ===============================
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === "moveSpamToInbox") {
        moveAllToInbox("Spam").then(sendResponse); return true;
    }
    if (req.action === "movePromotionsToInbox") {
        moveAllToInbox("Promotions").then(sendResponse); return true;
    }
    if (req.action === "moveUpdatesToInbox") {
        moveAllToInbox("Updates").then(sendResponse); return true;
    }
    if (req.action === "moveSocialToInbox") {
        moveAllToInbox("Social").then(sendResponse); return true;
    }
    if (req.action === "processInboxMails") {
        openAndClickAllMails().then(sendResponse); return true;
    }
    return false;
});

console.log("✅ Gmail content.js updated: Spam → Promotions → Updates → Social → Inbox → process mails.");
