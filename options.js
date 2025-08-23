document.addEventListener('DOMContentLoaded', function () {
    const startScanBtn = document.getElementById('startScanBtn');
    const resultsContainer = document.getElementById('results-container');
    const spinner = document.getElementById('loader');

    const mailLimitInput = document.getElementById('mailLimit');
    const saveSettingsBtn = document.getElementById('saveSettings');

    function renderResults(results) {
        resultsContainer.innerHTML = '';
        if (!results || Object.keys(results).length === 0) {
            resultsContainer.innerHTML = '<p class="placeholder">No data found. Click "Start Scan".</p>';
            return;
        }

        for (const account in results) {
            const data = results[account];
            const accountDiv = document.createElement('div');
            accountDiv.className = "account-section";
            accountDiv.innerHTML = `
                <h3>${account}</h3>
                <ul>
                    <li>📥 Inbox: <b>${data.inbox}</b></li>
                    <li>🚫 Spam: <b>${data.spam}</b></li>
                    <li>🏷️ Promotions: <b>${data.promotions}</b></li>
                </ul>
            `;
            resultsContainer.appendChild(accountDiv);
        }
    }

    function showSpinner(show) {
        spinner.className = show ? 'show' : 'hidden';
    }

    // Start scan
    startScanBtn.addEventListener('click', () => {
        startScanBtn.disabled = true;
        startScanBtn.textContent = 'Scanning...';
        resultsContainer.innerHTML = '<p class="placeholder">Scanning all your accounts. This may take a moment...</p>';
        showSpinner(true);
        chrome.runtime.sendMessage({ action: "startScan" });
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', () => {
        const limit = parseInt(mailLimitInput.value, 10) || 10;
        chrome.storage.local.set({ mailLimit: limit }, () => {
            alert(`✅ Mail limit saved: ${limit}`);
        });
    });

    // Load saved mail limit
    chrome.storage.local.get("mailLimit", (data) => {
        if (data.mailLimit) mailLimitInput.value = data.mailLimit;
    });

    // Listen for scan results
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.scanResults) {
            renderResults(changes.scanResults.newValue);
        }
        if (area === 'local' && changes.isScanning) {
            if (!changes.isScanning.newValue) {
                startScanBtn.disabled = false;
                startScanBtn.textContent = 'Start Scan';
                showSpinner(false);
            }
        }
    });

    // Initial load
    chrome.storage.local.get(["scanResults", "isScanning"], (data) => {
        renderResults(data.scanResults);
        if (data.isScanning) {
            startScanBtn.disabled = true;
            startScanBtn.textContent = 'Scanning...';
            showSpinner(true);
        }
    });
});
