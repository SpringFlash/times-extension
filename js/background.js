import JiraAPI from "./api/jira.js";
import { Storage } from "./utils/storage.js";
import { CONFIG } from "./utils/constants.js";
import { searchIssues, createTimeEntry, createIssue } from "./api/redmine.js";

/**
 * Background service worker for the extension
 */
class BackgroundService {
  constructor() {
    this.init();
  }

  /**
   * Initialize background service
   */
  init() {
    this.setupEventListeners();
    this.setupContextMenus();
    console.log("Times Set Helper background service initialized");
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Extension installation/update
    chrome.runtime.onInstalled.addListener((details) => {
      this.onInstalled(details);
    });

    // Tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.onTabUpdated(tabId, changeInfo, tab);
    });

    // Messages from content scripts or popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Notification clicks
    chrome.notifications.onClicked.addListener((notificationId) => {
      this.onNotificationClicked(notificationId);
    });
  }

  /**
   * Setup context menus
   */
  async setupContextMenus() {
    try {
      // Check if contextMenus API is available
      if (!chrome.contextMenus) {
        console.warn("contextMenus API not available");
        return;
      }

      // Remove all existing context menus
      chrome.contextMenus.removeAll();

      // Add context menu for Jira pages
      chrome.contextMenus.create({
        id: "findRedmineLinks",
        title: "Find Redmine Links",
        contexts: ["page"],
        documentUrlPatterns: ["*://*.atlassian.net/*", "*://*/jira/*"],
      });

      // Add context menu for selected text
      chrome.contextMenus.create({
        id: "searchInRedmine",
        title: 'Search "%s" in Redmine',
        contexts: ["selection"],
      });

      // Handle context menu clicks
      chrome.contextMenus.onClicked.addListener((info, tab) => {
        this.handleContextMenuClick(info, tab);
      });
    } catch (error) {
      console.error("Error setting up context menus:", error);
    }
  }

  /**
   * Handle extension installation/update
   */
  onInstalled(details) {
    console.log("Extension installed/updated:", details.reason);

    if (details.reason === "install") {
      // First install - open options page
      chrome.runtime.openOptionsPage();
    }
  }

  /**
   * Handle tab updates
   */
  async onTabUpdated(tabId, changeInfo, tab) {
    // Only process complete page loads
    if (changeInfo.status !== "complete" || !tab.url) return;

    try {
      // Check if this is a Jira page
      const isJiraPage =
        tab.url.includes("atlassian.net") || tab.url.includes("jira");

      if (isJiraPage) {
        // Auto-detect Jira task and check for Redmine links
        const taskMatch = tab.url.match(/\/browse\/([A-Z]+-\d+)/);

        if (taskMatch) {
          // This is a Jira task page - check for auto-link detection setting
          const jiraSettings = await Storage.getJiraSettings();

          if (jiraSettings.autoDetect) {
            // Auto-detect Redmine links
            setTimeout(() => this.autoDetectRedmineLinks(tabId), 1000);
          }
        }
      }
    } catch (error) {
      console.error("Error handling tab update:", error);
    }
  }

  /**
   * Handle messages from other parts of the extension
   */
  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case "findRedmineLinks":
          const result = await this.findRedmineLinksInTab(
            request.tabId || sender.tab?.id
          );
          sendResponse(result);
          break;

        case "getJiraTaskInfo":
          const taskInfo = await JiraAPI.getCurrentPageInfo();
          sendResponse(taskInfo);
          break;

        case "searchInRedmine":
          const searchResult = await this.searchInRedmine(request.query);
          sendResponse(searchResult);
          break;

        case "createTimeEntry":
          const createResult = await this.createTimeEntry(request.data);
          sendResponse(createResult);
          break;

        case "createRedmineIssue":
          const issueResult = await this.createRedmineIssue(request.data);
          sendResponse(issueResult);
          break;

        case "openOptions":
          chrome.runtime.openOptionsPage();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ error: "Unknown action" });
      }
    } catch (error) {
      console.error("Error handling message:", error);
      sendResponse({ error: error.message });
    }
  }

  /**
   * Handle context menu clicks
   */
  async handleContextMenuClick(info, tab) {
    try {
      switch (info.menuItemId) {
        case "findRedmineLinks":
          await this.findRedmineLinksInTab(tab.id);
          break;

        case "searchInRedmine":
          const selectedText = info.selectionText;
          if (selectedText) {
            await this.searchInRedmine(selectedText);
          }
          break;
      }
    } catch (error) {
      console.error("Error handling context menu click:", error);
    }
  }

  /**
   * Handle notification clicks
   */
  onNotificationClicked(notificationId) {
    // Clear the notification
    chrome.notifications.clear(notificationId);

    // Handle specific notification types
    if (notificationId.startsWith("redmine-links-")) {
      // Open options page to manage the found links
      chrome.runtime.openOptionsPage();
    }
  }

  /**
   * Auto-detect Redmine links in current Jira page
   */
  async autoDetectRedmineLinks(tabId) {
    try {
      const redmineSettings = await Storage.getRedmineSettings();
      if (!redmineSettings.url || !redmineSettings.apiKey) {
        return; // Can't search without Redmine settings
      }

      const linkData = await JiraAPI.findLinkedRedmineTasks(
        tabId,
        redmineSettings,
        searchIssues
      );

      if (linkData.success && linkData.hasLinkedTasks) {
        // Show notification about found links
        await JiraAPI.showLinkNotification(linkData);

        // Store the link data for later use
        const storageKey = `jira-redmine-links-${Date.now()}`;
        await Storage.set(storageKey, linkData);

        // Send message to popup if it's open
        try {
          chrome.runtime.sendMessage({
            action: "redmineLinksFound",
            data: linkData,
          });
        } catch (e) {
          // Popup might not be open, that's fine
        }
      }
    } catch (error) {
      console.error("Error auto-detecting Redmine links:", error);
    }
  }

  /**
   * Find Redmine links in specified tab
   */
  async findRedmineLinksInTab(tabId) {
    if (!tabId) throw new Error("No tab ID provided");

    const redmineSettings = await Storage.getRedmineSettings();
    if (!redmineSettings.url || !redmineSettings.apiKey) {
      throw new Error("Redmine settings not configured");
    }

    const linkData = await JiraAPI.findLinkedRedmineTasks(
      tabId,
      redmineSettings,
      searchIssues
    );

    if (linkData.success) {
      await JiraAPI.showLinkNotification(linkData);
    }

    return linkData;
  }

  /**
   * Search for text in Redmine
   */
  async searchInRedmine(query) {
    try {
      const redmineSettings = await Storage.getRedmineSettings();

      if (!redmineSettings.url || !redmineSettings.apiKey) {
        throw new Error("Redmine settings not configured");
      }

      // Use the statically imported search function
      const result = await searchIssues(query, redmineSettings);

      // Show notification with results
      const message =
        result.success && result.issues.length > 0
          ? `Found ${result.issues.length} issues for "${query}"`
          : `No issues found for "${query}"`;

      chrome.notifications.create({
        type: "basic",
        iconUrl: "images/icon48.png",
        title: "Redmine Search",
        message: message,
      });

      return result;
    } catch (error) {
      console.error("Error searching in Redmine:", error);

      chrome.notifications.create({
        type: "basic",
        iconUrl: "images/icon48.png",
        title: "Search Error",
        message: `Error: ${error.message}`,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Create time entry
   */
  async createTimeEntry(data) {
    try {
      const redmineSettings = await Storage.getRedmineSettings();

      if (!redmineSettings.url || !redmineSettings.apiKey) {
        throw new Error("Redmine settings not configured");
      }

      // Use the statically imported create function
      const result = await createTimeEntry(data, redmineSettings);

      if (result.success) {
        // Update local storage
        const timeEntries = await Storage.getTimeEntries();
        timeEntries.push(data);
        await Storage.setTimeEntries(timeEntries);

        // Show success notification
        chrome.notifications.create({
          type: "basic",
          iconUrl: "images/icon48.png",
          title: "Time Entry Created",
          message: `Created ${data.time}h entry for ${data.date}`,
        });
      }

      return result;
    } catch (error) {
      console.error("Error creating time entry:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Redmine issue
   */
  async createRedmineIssue(data) {
    try {
      const redmineSettings = await Storage.getRedmineSettings();

      if (!redmineSettings.url || !redmineSettings.apiKey) {
        throw new Error("Redmine settings not configured");
      }

      // Use the statically imported create function
      const result = await createIssue(data, redmineSettings);

      if (result.success) {
        // Show success notification
        chrome.notifications.create({
          type: "basic",
          iconUrl: "images/icon48.png",
          title: "Redmine Task Created",
          message: `Created task #${result.issue.id}: ${result.issue.subject}`,
        });
      }

      return result;
    } catch (error) {
      console.error("Error creating Redmine issue:", error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize background service
new BackgroundService();
