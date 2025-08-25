document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector(".container");
  const systemNameInput = document.getElementById("systemName");
  const profileNameInput = document.getElementById("profileName");
  const breakInput = document.getElementById("breakInput"); 
  const locationInput = document.getElementById('location');
  let isProcessingUnsubscribe = false;
  
  // Create and insert stored emails container
  const storedEmailsContainer = document.createElement("div");
  storedEmailsContainer.classList.add("stored-emails-container");
  container.insertBefore(
      storedEmailsContainer,
      document.getElementById("saveButton")
  );
  
  // ==============================
  // 📧 Unsubscribe Email Functions
  // ==============================
  const displayUnsubscribeEmails = () => {
    chrome.storage.local.get(["unsubscribeEmails"], (result) => {
      const emails = result.unsubscribeEmails || [];
      const emailsListDiv = document.getElementById("emailsToUnsubscribeList");
      emailsListDiv.innerHTML = "";
      emails.forEach(email => {
        const emailDiv = document.createElement("div");
        emailDiv.className = "email-item";
        emailDiv.textContent = email;
        emailsListDiv.appendChild(emailDiv);
      });
    });
  };

  const autoUnsubscribeIfEmailsFound = () => {
    if (isProcessingUnsubscribe) return;
    isProcessingUnsubscribe = true;

    chrome.storage.local.get(["systemName", "profileName"], (result) => {
      const systemName = result.systemName || "";
      const profileName = result.profileName || "";

      chrome.storage.local.get(["unsubscribeEmails"], (result) => {
        const emails = result.unsubscribeEmails || [];
        if (emails.length > 0) {
          chrome.runtime.sendMessage({
            action: "unsubscribeEmails",
            emails: emails,
            systemName,
            profileName
          }, (response) => {
            if (response && response.success) {
              const unsubscribedEmailsDiv = document.getElementById("unsubscribedEmails");
              unsubscribedEmailsDiv.style.display = "block";
              unsubscribedEmailsDiv.innerHTML = "<h3>Unsubscribed Emails</h3>";
              emails.forEach(email => {
                const emailDiv = document.createElement("div");
                emailDiv.className = "unsubscribed-email";
                emailDiv.innerHTML = `
                  <h3>${email}</h3>
                  <p>System: ${systemName}</p>
                  <p>Profile: ${profileName}</p>
                `;
                unsubscribedEmailsDiv.appendChild(emailDiv);
              });
            }
          });

          chrome.storage.local.remove("unsubscribeEmails");
        }
        isProcessingUnsubscribe = false;
      });
    });
  };

  const displayUnsubscribedHistory = () => {
    chrome.storage.local.get(["unsubscribedEmailsHistory"], (result) => {
      const history = result.unsubscribedEmailsHistory || [];
      const unsubscribedEmailsDiv = document.getElementById("unsubscribedEmails");
      unsubscribedEmailsDiv.innerHTML = "";
      const header = document.createElement("h3");
      header.textContent = "Unsubscribed Emails History";
      unsubscribedEmailsDiv.appendChild(header);

      history.forEach(entry => {
        const emailDiv = document.createElement("div");
        emailDiv.className = "unsubscribed-email";
        emailDiv.innerHTML = `
          <h3>${entry.email}</h3>
          <p>System: ${entry.system}</p>
          <p>Profile: ${entry.profile}</p>
          <p>Time: ${new Date(entry.timestamp).toLocaleString()}</p>
        `;
        unsubscribedEmailsDiv.appendChild(emailDiv);
      });

      unsubscribedEmailsDiv.style.display = history.length > 0 ? "block" : "none";
    });
  };

  displayUnsubscribeEmails();
  displayUnsubscribedHistory();
  autoUnsubscribeIfEmailsFound();

  // ==============================
  // 📊 Account Stats & Save
  // ==============================
  const updateCounts = () => {
    const inputGroups = storedEmailsContainer.querySelectorAll(".input-group");
    const totalCount = inputGroups.length;
    let activeAccountsCount = 0;
    let inactiveAccountsCount = 0;

    inputGroups.forEach((group) => {
      const emailInput = group.querySelector("input[type='text']:nth-of-type(2)");
      if (emailInput.value.trim() !== "") {
        activeAccountsCount++;
      } else {
        inactiveAccountsCount++;
      }
    });

    document.getElementById("activeCount").textContent = activeAccountsCount;
    document.getElementById("inactiveCount").textContent = inactiveAccountsCount;
    document.getElementById("totalCount").textContent = totalCount;

    chrome.storage.local.set({
      activeAccounts: activeAccountsCount,
      totalAccounts: totalCount
    });
  };

  chrome.storage.local.get(
    { emails: [], systemName: "", profileName: "", inactiveEmails: [], breakTime: 0 },
    (data) => {
      const allEmails = [...data.emails, ...data.inactiveEmails];
      allEmails.forEach((entry) => {
        const inputGroup = document.createElement("div");
        inputGroup.classList.add("input-group");

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = `${entry.first_name} ${entry.last_name}`;
        nameInput.readOnly = true;
        nameInput.style.width = "200px";

        const emailInput = document.createElement("input");
        emailInput.type = "text";
        emailInput.value = entry.email;
        emailInput.readOnly = true;
        emailInput.style.width = "200px";

        const countInput = document.createElement("input");
        countInput.type = "number";
        countInput.style.width = "100px";
        countInput.placeholder = "Emails receive per day";
        if (entry.receive_limit) countInput.value = entry.receive_limit;

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.style.marginLeft = "10px";
        deleteButton.style.backgroundColor = "#ff4c4c";
        deleteButton.style.color = "white";
        deleteButton.style.border = "none";
        deleteButton.style.padding = "5px 10px";
        deleteButton.style.borderRadius = "5px";
        deleteButton.style.cursor = "pointer";

        deleteButton.addEventListener("click", () => {
          nameInput.value = "";
          emailInput.value = "";
          countInput.value = "";
          updateCounts();
        });

        inputGroup.appendChild(nameInput);
        inputGroup.appendChild(emailInput);
        inputGroup.appendChild(countInput);
        inputGroup.appendChild(deleteButton);
        storedEmailsContainer.appendChild(inputGroup);
      });

      updateCounts();
      systemNameInput.value = data.systemName;
      profileNameInput.value = data.profileName;
      breakInput.value = data.breakTime; 
    }
  );

  document.getElementById("saveButton").addEventListener("click", () => {
    const systemName = systemNameInput.value.trim();
    const profileName = profileNameInput.value.trim();

    const subscribers = [];
    const inputGroups = storedEmailsContainer.querySelectorAll(".input-group");

    inputGroups.forEach((group) => {
      const nameInput = group.querySelector("input[type='text']:nth-of-type(1)");
      const emailInput = group.querySelector("input[type='text']:nth-of-type(2)");
      const countInput = group.querySelector("input[type='number']");
      const nameValue = nameInput.value.trim().split(" ");
      const firstName = nameValue[0];
      const lastName = nameValue.slice(1).join(" ");
      const emailValue = emailInput.value.trim();
      const countValue = parseInt(countInput.value.trim(), 10);

      if (emailValue && !isNaN(countValue)) {
        subscribers.push({
          first_name: firstName,
          last_name: lastName,
          email: emailValue,
          receive_limit: countValue,
        });
      }
    });

    const payload = {
      system_name: systemName,
      profile_name: profileName,
      emails: subscribers,
      vendor_name:"browser_plugin",
      break_time: breakInput.value.trim(), 
    };

    chrome.storage.local.set(
      {
        systemName,
        profileName,
        emails: subscribers,
        breakTime: breakInput.value.trim(), 
      }
    );

    chrome.runtime.sendMessage({ action: "saveData", payload }, (response) => {
      if (response.success) {
        alert("Data saved successfully!");
      } else {
        alert("Failed to save data: " + response.error);
      }
    });
  });

  // ==============================
  // ▶ Warmup Start Button
  // ==============================
  document.getElementById("goButton").addEventListener("click", () => {
    const goButton = document.getElementById("goButton");
    goButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
    goButton.style.backgroundColor = "#dc3545";
    goButton.disabled = true;

    chrome.tabs.create({ url: "https://mail.google.com/mail/" }, (tab) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          window.isProcessingPaused = false;
          if (typeof processUnreadEmails === "function") {
            processUnreadEmails();
          }
        },
      });
    });
  });

  // ==============================
  // 🚫 Manual Unsubscribe Button
  // ==============================
  const unsubscribeEmailList = document.getElementById("emailsToUnsubscribeList");
  const unsubscribeButton = document.getElementById("unsubscribeButton");

  chrome.storage.local.get(["unsubscribeEmails"], (result) => {
    const emails = result.unsubscribeEmails || [];
    if (emails.length > 0) {
      emails.forEach((email) => {
        const inputTextBox = document.createElement("input");
        inputTextBox.type = "text";
        inputTextBox.value = email;
        inputTextBox.className = "unsubscribe-email-input";
        unsubscribeEmailList.appendChild(inputTextBox);
      });
    }
  });

  unsubscribeButton.addEventListener("click", () => {
    const emailsToUnsubscribe = [];
    unsubscribeEmailList.querySelectorAll(".unsubscribe-email-input").forEach((input) => {
      emailsToUnsubscribe.push(input.value);
    });

    const systemName = document.getElementById("systemName").value;
    const profileName = document.getElementById("profileName").value;

    chrome.runtime.sendMessage({
      action: "unsubscribeEmails",
      emails: emailsToUnsubscribe,
      systemName,
      profileName
    });

    chrome.storage.local.remove("unsubscribeEmails");
    unsubscribeEmailList.innerHTML = "";
  });

  // ==============================
  // 🌍 Location Save
  // ==============================
  chrome.storage.local.get(['location', 'systemName'], function(result) {
    if (result.location) locationInput.value = result.location;
    if (result.systemName) systemNameInput.value = result.systemName;
  });

  locationInput.addEventListener('change', function() {
    chrome.storage.local.set({ location: this.value });
  });

  systemNameInput.addEventListener('change', function() {
    chrome.storage.local.set({ systemName: this.value });
  });
});

// ==============================
// 🤖 AI Chat Integration (Updated)
// ==============================
(function wireChat() {
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const chatSendBtn = document.getElementById("chatSendBtn");

  function add(sender, text) {
    if (!chatMessages) return;
    const p = document.createElement("p");
    p.innerHTML = `<b>${sender}:</b> ${text}`;
    chatMessages.appendChild(p);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChat(text, auto = false) {
    if (text) add("You", text);
    chrome.runtime.sendMessage({ action: "chatMessage", text, auto }, (response) => {
      if (!response) {
        add("System", "⚠️ No response from background (service worker not running?)");
        return;
      }
      if (response.success) add("AI", response.reply);
      else add("AI", response.reply || "⚠️ Failed to get AI reply");
    });
  }

  // === Manual Send ===
  if (chatSendBtn && chatInput) {
    chatSendBtn.addEventListener("click", () => {
      const text = (chatInput.value || "").trim();
      if (!text) return;
      chatInput.value = "";
      sendChat(text, false);
    });

    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        chatSendBtn.click();
      }
    });
  }

  // === Add Full AI Control button ===
  const aiBtn = document.createElement("button");
  aiBtn.textContent = "🤖 Full AI Control";
  aiBtn.style.marginTop = "6px";
  aiBtn.onclick = () => {
    add("System", "🤖 Full AI Control started...");
    sendChat("Okay start warmup", true);
  };
  chatMessages.parentElement.appendChild(aiBtn);
})();
