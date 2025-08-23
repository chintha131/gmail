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
  
  // Function to display emails waiting to be unsubscribed
  const displayUnsubscribeEmails = () => {
    chrome.storage.local.get(["unsubscribeEmails"], (result) => {
      const emails = result.unsubscribeEmails || [];
      const emailsListDiv = document.getElementById("emailsToUnsubscribeList");
      
      // Clear existing list
      emailsListDiv.innerHTML = "";
      
      // Add each email
      emails.forEach(email => {
        const emailDiv = document.createElement("div");
        emailDiv.className = "email-item";
        emailDiv.textContent = email;
        emailsListDiv.appendChild(emailDiv);
      });
    });
  };

  // Function to check if there are emails in unsubscribe list and auto-click button
  const autoUnsubscribeIfEmailsFound = () => {
    if (isProcessingUnsubscribe) {
      console.log("Already processing unsubscribe, skipping");
      return;
    }

    isProcessingUnsubscribe = true;

    // First get system name and profile name from storage
    chrome.storage.local.get(["systemName", "profileName"], (result) => {
      const systemName = result.systemName || "";
      const profileName = result.profileName || "";
      
      // Then get unsubscribe emails
      chrome.storage.local.get(["unsubscribeEmails"], (result) => {
        const emails = result.unsubscribeEmails || [];
        console.log("Checking unsubscribe emails:", emails);
        
        if (emails.length > 0) {
          console.log("Found emails to unsubscribe, processing now");
          
          // Process emails directly without showing UI
          chrome.runtime.sendMessage({
            action: "unsubscribeEmails",
            emails: emails,
            systemName: systemName,
            profileName: profileName
          }, (response) => {
            if (response && response.success) {
              // Display unsubscribed emails
              const unsubscribedEmailsDiv = document.getElementById("unsubscribedEmails");
              unsubscribedEmailsDiv.style.display = "block";
              
              // Clear existing unsubscribed emails
              unsubscribedEmailsDiv.innerHTML = "<h3>Unsubscribed Emails</h3>";
              
              // Add each unsubscribed email
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
          
          // Clear the stored emails
          chrome.storage.local.remove("unsubscribeEmails", (result) => {
            if (chrome.runtime.lastError) {
              console.error(`Error clearing emails from storage: ${chrome.runtime.lastError}`);
            } else {
              console.log("Cleared stored emails from chrome.storage.local.");
            }
          });
        }
        
        // Reset the flag after processing
        isProcessingUnsubscribe = false;
      });
    });
  };

  // Function to display unsubscribed emails history
  const displayUnsubscribedHistory = () => {
    chrome.storage.local.get(["unsubscribedEmailsHistory"], (result) => {
      const history = result.unsubscribedEmailsHistory || [];
      const unsubscribedEmailsDiv = document.getElementById("unsubscribedEmails");
      
      // Clear existing content
      unsubscribedEmailsDiv.innerHTML = "";
      
      // Add header
      const header = document.createElement("h3");
      header.textContent = "Unsubscribed Emails History";
      unsubscribedEmailsDiv.appendChild(header);
      
      // Add each unsubscribed email
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
      
      // Show the section if there are any entries
      unsubscribedEmailsDiv.style.display = history.length > 0 ? "block" : "none";
    });
  };

  // Update the display when the popup loads
  displayUnsubscribeEmails();
  displayUnsubscribedHistory();

  // Check for emails to unsubscribe immediately on popup load
  autoUnsubscribeIfEmailsFound();

  const updateCounts = () => {
    const inputGroups = storedEmailsContainer.querySelectorAll(".input-group");
    const totalCount = inputGroups.length;
    let activeAccountsCount = 0;
    let inactiveAccountsCount = 0;
  
    inputGroups.forEach((group) => {
      const emailInput = group.querySelector("input[type='text']:nth-of-type(2)");
      const emailValue = emailInput.value.trim();
  
      if (emailValue !== "") {
        activeAccountsCount++;
      } else {
        inactiveAccountsCount++;
      }
    });
  
    // Update UI
    document.getElementById("activeCount").textContent = activeAccountsCount;
    document.getElementById("inactiveCount").textContent = inactiveAccountsCount;
    document.getElementById("totalCount").textContent = totalCount;
  
    // Send active and total counts to background.js
    chrome.storage.local.set({
      activeAccounts: activeAccountsCount,
      totalAccounts: totalCount
  });

  };
  
  
  chrome.storage.local.get(
      { emails: [], systemName: "", profileName: "", inactiveEmails: [], breakTime: 0 },
      (data) => {
          const allEmails = [...data.emails, ...data.inactiveEmails];
  
          // Loop through the emails and create input elements for each
          allEmails.forEach((entry) => {
              const inputGroup = document.createElement("div");
              inputGroup.classList.add("input-group");
  
              // Name input
              const nameInput = document.createElement("input");
              nameInput.type = "text";
              nameInput.value = `${entry.first_name} ${entry.last_name}`;
              nameInput.readOnly = true;
              nameInput.style.width = "200px";
  
              // Email input
              const emailInput = document.createElement("input");
              emailInput.type = "text";
              emailInput.value = entry.email;
              emailInput.readOnly = true;
              emailInput.style.width = "200px";
  
              // Count input for email receive per day
              const countInput = document.createElement("input");
              countInput.type = "number";
              countInput.style.width = "100px";
              countInput.placeholder = "Emails receive per day";
              if (entry.receive_limit) {
                  countInput.value = entry.receive_limit;
              }
  
              // Delete Button
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
              systemName: systemName,
              profileName: profileName,
              emails: subscribers,
              breakTime: breakInput.value.trim(), 
          },
          () => {
              console.log("System name, profile name, subscriber data, and break time saved.");
          }
      );
  
      chrome.runtime.sendMessage(
          { action: "saveData", payload: payload },
          (response) => {
              if (response.success) {
                  alert("Data saved successfully!");
              } else {
                  alert("Failed to save data: " + response.error);
              }
          });
  
      systemNameInput.value = systemName;
      profileNameInput.value = profileName;
  });
  
  

  document.getElementById("goButton").addEventListener("click", () => {
    const goButton = document.getElementById("goButton");

    goButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
    goButton.style.backgroundColor = "#dc3545";
    goButton.disabled = true;

    chrome.tabs.create({ url: "https://mail.google.com/mail/" }, (tab) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: startProcessing,
      });
    });
  });

  function startProcessing() {
    window.isProcessingPaused = false;
    processUnreadEmails();
  }

  const unsubscribeEmailList = document.getElementById("unsubscribeEmailList");
  const unsubscribeButton = document.getElementById("unsubscribeButton");

  // Retrieve the stored emails and display them in the unsubscribe list as input text boxes
  chrome.storage.local.get(["unsubscribeEmails"], (result) => {
    if (chrome.runtime.lastError) {
      console.error(`Error retrieving emails: ${chrome.runtime.lastError}`);
    } else {
      const emails = result.unsubscribeEmails || [];
      if (emails.length > 0) {
        emails.forEach((email) => {
          const inputTextBox = document.createElement("input");
          inputTextBox.type = "text";
          inputTextBox.value = email;
          inputTextBox.className = "unsubscribe-email-input";
          unsubscribeEmailList.appendChild(inputTextBox);
        });
        console.log(
          `Displayed emails for unsubscription: ${emails.join(", ")}`
        );
      } else {
        console.log("No emails found to unsubscribe.");
      }
    }
  });

  unsubscribeButton.addEventListener("click", () => {
    // Collect all emails from the input text boxes
    const emailsToUnsubscribe = [];
    unsubscribeEmailList
      .querySelectorAll(".unsubscribe-email-input")
      .forEach((input) => {
        emailsToUnsubscribe.push(input.value);
      });

    console.log(`Emails to unsubscribe: ${emailsToUnsubscribe.join(", ")}`);

    // Get system name and profile name
    const systemName = document.getElementById("systemName").value;
    const profileName = document.getElementById("profileName").value;

    // Send a message to background.js to handle unsubscribing
    chrome.runtime.sendMessage({
      action: "unsubscribeEmails",
      emails: emailsToUnsubscribe,
      systemName: systemName,
      profileName: profileName
    });

    // Clear the stored emails from chrome.storage.local
    chrome.storage.local.remove("unsubscribeEmails", () => {
      if (chrome.runtime.lastError) {
        console.error(
          `Error clearing emails from storage: ${chrome.runtime.lastError}`
        );
      } else {
        console.log("Cleared stored emails from chrome.storage.local.");
      }
    });

    // Clear the input text boxes
    unsubscribeEmailList.innerHTML = "";
  });

  // Load saved location and system name
  chrome.storage.local.get(['location', 'systemName'], function(result) {
    if (result.location) {
      locationInput.value = result.location;
    }
    if (result.systemName) {
      systemNameInput.value = result.systemName;
    }
  });

  // Save location when it changes
  locationInput.addEventListener('change', function() {
    chrome.storage.local.set({ location: this.value });
  });

  // Save system name when it changes
  systemNameInput.addEventListener('change', function() {
    chrome.storage.local.set({ systemName: this.value });
  });

});
