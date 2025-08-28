import { Storage } from "../utils/storage.js";
import JiraAPI from "../api/jira.js";
import { CONFIG } from "../utils/constants.js";

/**
 * Popup controller for the extension
 */
class PopupController {
  constructor() {
    this.elements = {};
    this.currentTab = null;
    this.jiraTaskInfo = null;
    this.linkedRedmineTasks = [];
  }

  /**
   * Initialize the popup
   */
  async init() {
    this.bindElements();
    this.attachEventListeners();
    await this.loadCurrentTabInfo();
    await this.checkJiraPage();
    this.setupMessageListener();
  }

  /**
   * Bind DOM elements
   */
  bindElements() {
    this.elements.tasksContainer = document.getElementById("tasksContainer");
    this.elements.startFilling = document.getElementById("startFilling");
    this.elements.clearAll = document.getElementById("clearAll");
    this.elements.openOptions = document.getElementById("openOptions");
    this.elements.jiraActions = document.getElementById("jiraActions");
    this.elements.linkToRedmine = document.getElementById("linkToRedmine");
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    this.elements.startFilling?.addEventListener("click", () =>
      this.fillViaAPI()
    );
    this.elements.clearAll?.addEventListener("click", () =>
      this.clearAllData()
    );
    this.elements.openOptions?.addEventListener("click", () =>
      this.openOptions()
    );
    this.elements.linkToRedmine?.addEventListener("click", () =>
      this.linkToRedmine()
    );
  }

  /**
   * Setup message listener for background script communications
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "redmineLinksFound") {
        this.handleLinkedTasksFound(request.data);
      }
    });
  }

  /**
   * Load current tab information
   */
  async loadCurrentTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      this.currentTab = tab;
    } catch (error) {
      console.error("Error loading tab info:", error);
    }
  }

  /**
   * Check if current page is Jira and show relevant UI
   */
  async checkJiraPage() {
    try {
      if (!this.currentTab) return;

      // Check if we're on a Jira page
      const isJiraPage =
        this.currentTab.url.includes("atlassian.net") ||
        this.currentTab.url.includes("jira");

      if (isJiraPage) {
        // Get Jira task info
        const response = await chrome.runtime.sendMessage({
          action: "getJiraTaskInfo",
        });

        if (response && response.isJiraPage) {
          this.jiraTaskInfo = response;
          this.showJiraInterface();

          // Auto-check for linked Redmine tasks
          setTimeout(() => this.findLinkedRedmineTasks(), 500);
        }
      } else {
        this.showRegularInterface();
      }
    } catch (error) {
      console.error("Error checking Jira page:", error);
      this.showRegularInterface();
    }
  }

  /**
   * Show Jira-specific interface
   */
  showJiraInterface() {
    if (this.elements.jiraActions) {
      this.elements.jiraActions.style.display = "block";
    }

    // Update tasks container with Jira info
    if (this.elements.tasksContainer && this.jiraTaskInfo) {
      this.elements.tasksContainer.innerHTML = `
        <div class="jira-task-info">
          <div class="task-header">
            <h3>🎫 Current Jira Task</h3>
          </div>
          <div class="task-details">
            <div class="task-id">${
              this.jiraTaskInfo.taskId || "Loading..."
            }</div>
            <div class="task-title">${
              this.jiraTaskInfo.title || "Getting task info..."
            }</div>
          </div>
                     <div class="redmine-tasks" id="redmineTasksContainer">
             <div class="loading">🔍 Searching for linked Redmine tasks...</div>
           </div>
        </div>
      `;
    }
  }

  /**
   * Show regular interface for non-Jira pages
   */
  showRegularInterface() {
    if (this.elements.jiraActions) {
      this.elements.jiraActions.style.display = "none";
    }

    this.loadAndDisplayTimeEntries();
  }

  /**
   * Load and display time entries
   */
  async loadAndDisplayTimeEntries() {
    try {
      const timeEntries = await Storage.getTimeEntries();

      if (timeEntries.length === 0) {
        this.elements.tasksContainer.innerHTML = `
          <div class="no-entries">
            <p>No time entries yet.</p>
            <p>Open a Jira task or use the options page to add entries.</p>
          </div>
        `;
        return;
      }

      // Show recent entries (last 5)
      const recentEntries = timeEntries.slice(-5).reverse();

      this.elements.tasksContainer.innerHTML = `
        <div class="recent-entries">
          <h3>📝 Recent Time Entries</h3>
          ${recentEntries
            .map(
              (entry) => `
            <div class="entry-item">
              <div class="entry-date">${entry.date}</div>
              <div class="entry-task">${
                entry.task || entry.project || "N/A"
              }</div>
              <div class="entry-time">${entry.time}h</div>
            </div>
          `
            )
            .join("")}
          ${
            timeEntries.length > 5
              ? `<div class="more-entries">+${
                  timeEntries.length - 5
                } more entries</div>`
              : ""
          }
        </div>
      `;
    } catch (error) {
      console.error("Error loading time entries:", error);
      this.elements.tasksContainer.innerHTML =
        '<div class="error">Error loading entries</div>';
    }
  }

  /**
   * Find Redmine tasks linked to current Jira task
   */
  async findLinkedRedmineTasks() {
    try {
      if (!this.currentTab) return;

      const response = await chrome.runtime.sendMessage({
        action: "findRedmineLinks",
        tabId: this.currentTab.id,
      });

      this.handleLinkedTasksFound(response);
    } catch (error) {
      console.error("Error finding linked Redmine tasks:", error);
      this.updateRedmineTasksDisplay([], "Error searching for linked tasks");
    }
  }

  /**
   * Handle found linked Redmine tasks
   */
  handleLinkedTasksFound(linkData) {
    if (!linkData) return;

    if (linkData.success) {
      this.linkedRedmineTasks = linkData.redmineTasks || [];
      this.jiraTaskInfo = { ...this.jiraTaskInfo, ...linkData.jiraTask };

      this.updateRedmineTasksDisplay(
        this.linkedRedmineTasks,
        this.linkedRedmineTasks.length > 0
          ? null
          : "No linked Redmine tasks found"
      );
    } else {
      this.updateRedmineTasksDisplay([], `Error: ${linkData.error}`);
    }
  }

  /**
   * Update Redmine tasks display
   */
  updateRedmineTasksDisplay(tasks, errorMessage = null) {
    const container = document.getElementById("redmineTasksContainer");
    if (!container) return;

    if (errorMessage) {
      container.innerHTML = `<div class="no-tasks">${errorMessage}</div>`;
      return;
    }

    if (tasks.length === 0) {
      container.innerHTML =
        '<div class="no-tasks">No linked Redmine tasks found</div>';
      return;
    }

    container.innerHTML = `
      <div class="tasks-found">
        <h4>🔗 Found Linked Tasks (${tasks.length})</h4>
        ${tasks
          .map(
            (task) => `
          <div class="redmine-task">
            <div class="task-info">
              <span class="task-id">#${task.id}</span>
              <span class="task-subject">${task.subject}</span>
              <button class="task-btn" data-task-id="${task.id}" title="Create time entry">
                ⏱️
              </button>
              <button class="link-btn" data-task-id="${task.id}" title="Open in new tab">
                🔗
              </button>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;

    // Add click handlers
    container.querySelectorAll(".link-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const taskId = e.target.dataset.taskId;
        if (taskId) {
          const url = await this.getRedmineTaskUrl(taskId);
          chrome.tabs.create({ url });
        }
      });
    });

    container.querySelectorAll(".task-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const taskId = e.target.dataset.taskId;
        if (taskId) {
          this.createTimeEntryForTask(taskId);
        }
      });
    });
  }

  /**
   * Fill data via API
   */
  async fillViaAPI() {
    const button = this.elements.startFilling;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Processing...";
    button.disabled = true;

    try {
      // Check Redmine settings first
      const redmineSettings = await Storage.getRedmineSettings();
      if (!redmineSettings.url || !redmineSettings.apiKey) {
        throw new Error("Please configure Redmine settings first");
      }

      if (this.jiraTaskInfo && this.linkedRedmineTasks.length > 0) {
        // We have Jira task with linked Redmine tasks
        await this.processJiraToRedmineIntegration();
      } else {
        // Regular API filling
        this.showNotification(
          "ℹ️ Open a Jira task with Redmine links for full integration",
          "info"
        );
        chrome.runtime.openOptionsPage();
      }
    } catch (error) {
      console.error("Error filling via API:", error);
      this.showNotification(`❌ Error: ${error.message}`, "error");
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Process Jira to Redmine integration
   */
  async processJiraToRedmineIntegration() {
    try {
      const today = new Date().toISOString().split("T")[0];

      // Create time entry for each linked Redmine task found
      const results = [];

      for (const task of this.linkedRedmineTasks) {
        const timeEntryData = {
          date: today,
          task: task.id.toString(),
          time: 8, // Default 8 hours, user can change later
          comment: `From Jira task: ${this.jiraTaskInfo.taskId}`,
          isResearch: false,
        };

        const result = await chrome.runtime.sendMessage({
          action: "createTimeEntry",
          data: timeEntryData,
        });

        results.push({ task, result });
      }

      const successful = results.filter((r) => r.result.success).length;
      const failed = results.length - successful;

      if (successful > 0) {
        this.showNotification(
          `✅ Created ${successful} time entries`,
          "success"
        );
      }

      if (failed > 0) {
        this.showNotification(
          `⚠️ ${failed} entries failed to create`,
          "warning"
        );
      }
    } catch (error) {
      console.error("Error processing Jira-Redmine integration:", error);
      this.showNotification(`❌ Integration error: ${error.message}`, "error");
    }
  }

  /**
   * Link to Redmine action
   */
  async linkToRedmine() {
    if (this.linkedRedmineTasks.length > 0) {
      // Open all linked Redmine tasks
      for (const task of this.linkedRedmineTasks) {
        const url = await this.getRedmineTaskUrl(task.id);
        chrome.tabs.create({ url });
      }
    } else {
      this.findLinkedRedmineTasks();
    }
  }

  /**
   * Get Redmine task URL
   */
  async getRedmineTaskUrl(taskId) {
    try {
      const redmineSettings = await Storage.getRedmineSettings();
      if (redmineSettings.url) {
        return `${redmineSettings.url}/issues/${taskId}`;
      }
    } catch (error) {
      console.error("Error getting Redmine settings:", error);
    }
    return `#${taskId}`; // Fallback
  }

  /**
   * Create time entry for specific task
   */
  async createTimeEntryForTask(taskId) {
    try {
      const today = new Date().toISOString().split("T")[0];

      const timeEntryData = {
        date: today,
        task: taskId.toString(),
        time: 8, // Default 8 hours
        comment: `From Jira task: ${this.jiraTaskInfo.taskId}`,
        isResearch: false,
      };

      const result = await chrome.runtime.sendMessage({
        action: "createTimeEntry",
        data: timeEntryData,
      });

      if (result.success) {
        this.showNotification(
          `✅ Created time entry for task #${taskId}`,
          "success"
        );
      } else {
        this.showNotification(
          `❌ Failed to create time entry: ${result.error}`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error creating time entry:", error);
      this.showNotification(`❌ Error: ${error.message}`, "error");
    }
  }

  /**
   * Clear all data
   */
  async clearAllData() {
    if (!confirm("Clear all time entries? This cannot be undone.")) {
      return;
    }

    try {
      await Storage.setTimeEntries([]);
      this.showNotification("✅ All data cleared!", "success");

      // Refresh display
      if (this.jiraTaskInfo) {
        this.showJiraInterface();
      } else {
        this.showRegularInterface();
      }
    } catch (error) {
      console.error("Error clearing data:", error);
      this.showNotification(
        `❌ Error clearing data: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Open options page
   */
  openOptions() {
    chrome.runtime.openOptionsPage();
    window.close(); // Close popup
  }

  /**
   * Show notification
   */
  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `popup-notification notification-${type}`;
    notification.textContent = message;

    // Add to popup
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add("show"), 10);

    // Remove after delay
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.remove("show");
        setTimeout(() => {
          if (notification.parentNode) {
            document.body.removeChild(notification);
          }
        }, 300);
      }
    }, 3000);
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const popupController = new PopupController();
  popupController.init();
});
