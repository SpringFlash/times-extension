import {
  extractRedmineLinks,
  extractJiraTaskIds,
} from "../utils/validation.js";
import { CONFIG } from "../utils/constants.js";

/**
 * Jira API utility functions
 */
export class JiraAPI {
  /**
   * Get current page info from Jira
   * @returns {Promise<Object>} - Page info object
   */
  static async getCurrentPageInfo() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab) throw new Error("No active tab found");

      // Check if we're on a Jira page
      if (!tab.url.includes("atlassian.net") && !tab.url.includes("jira")) {
        return { isJiraPage: false };
      }

      // Extract task ID from URL
      const taskMatch = tab.url.match(/\/browse\/([A-Z]+-\d+)/);
      const taskId = taskMatch ? taskMatch[1] : null;

      return {
        isJiraPage: true,
        url: tab.url,
        title: tab.title,
        taskId,
        tabId: tab.id,
      };
    } catch (error) {
      console.error("Error getting current page info:", error);
      return { isJiraPage: false, error: error.message };
    }
  }

  /**
   * Extract task details from Jira page
   * @param {number} tabId - Tab ID
   * @returns {Promise<Object>} - Task details
   */
  static async extractTaskDetails(tabId) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        function: () => {
          // Try different selectors for task description
          const descriptionSelectors = [
            '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
            ".user-content-block",
            '[data-testid="issue.views.field.description.readonly"]',
            ".description-wrap .user-content",
            "#descriptionmodule .user-content",
          ];

          let description = "";
          for (const selector of descriptionSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              description = element.textContent || element.innerText || "";
              break;
            }
          }

          // Try to get task title/summary
          const titleSelectors = [
            'h1[data-test-id="issue.views.issue-base.foundation.summary.heading"]',
            'h1[data-testid="issue.views.issue-base.foundation.summary.heading"]',
            '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
            ".issue-header-content h1",
            "#summary-val",
          ];

          let title = "";
          for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              title = element.textContent || element.innerText || "";
              break;
            }
          }

          // Get task ID from page
          const taskIdSelectors = [
            '[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"]',
            ".issue-link",
            ".aui-nav-breadcrumbs .trigger-label",
          ];

          let taskId = "";
          for (const selector of taskIdSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              taskId = element.textContent || element.innerText || "";
              break;
            }
          }

          return {
            title: title.trim(),
            description: description.trim(),
            taskId: taskId.trim(),
            url: window.location.href,
          };
        },
      });

      return result.result || {};
    } catch (error) {
      console.error("Error extracting task details:", error);
      return { error: error.message };
    }
  }

  /**
   * Find Redmine tasks that reference this Jira task
   * @param {number} tabId - Tab ID
   * @param {Object} redmineSettings - Redmine API settings
   * @param {Function} searchIssues - Search function from redmine.js
   * @returns {Promise<Object>} - Found Redmine tasks and Jira task info
   */
  static async findLinkedRedmineTasks(tabId, redmineSettings, searchIssues) {
    try {
      const taskDetails = await this.extractTaskDetails(tabId);
      if (taskDetails.error) throw new Error(taskDetails.error);

      // Get current Jira task URL
      const jiraUrl = taskDetails.url;
      const jiraTaskId = taskDetails.taskId;

      if (!jiraUrl || !jiraTaskId) {
        throw new Error("Could not extract Jira task URL or ID");
      }

      // Search in Redmine for tasks that contain this Jira URL in description
      // Note: searchIssues should be passed as parameter to avoid import issues in service worker

      // Try searching by full URL first
      let searchResult = await searchIssues(jiraUrl, redmineSettings);

      // If no results, try searching by task ID
      if (!searchResult.success || searchResult.issues.length === 0) {
        searchResult = await searchIssues(jiraTaskId, redmineSettings);
      }

      const linkedRedmineTasks = searchResult.success
        ? searchResult.issues
        : [];

      return {
        success: true,
        jiraTask: taskDetails,
        redmineTasks: linkedRedmineTasks,
        hasLinkedTasks: linkedRedmineTasks.length > 0,
        searchQuery: jiraUrl,
        fallbackQuery: jiraTaskId,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Show notification about found links
   * @param {Object} linkData - Link data from findRedmineLinks
   */
  static async showLinkNotification(linkData) {
    try {
      if (!linkData.success) {
        await chrome.notifications.create({
          type: "basic",
          iconUrl: "images/icon48.png",
          title: "Jira Integration Error",
          message: linkData.error,
        });
        return;
      }

      if (linkData.hasLinkedTasks) {
        const taskCount = linkData.redmineTasks.length;
        const taskIds = linkData.redmineTasks
          .map((task) => `#${task.id}`)
          .join(", ");

        await chrome.notifications.create({
          type: "basic",
          iconUrl: "images/icon48.png",
          title: "Linked Redmine Tasks Found!",
          message: `Found ${taskCount} Redmine task(s): ${taskIds}`,
        });
      } else {
        await chrome.notifications.create({
          type: "basic",
          iconUrl: "images/icon48.png",
          title: "No Linked Tasks Found",
          message: `No Redmine tasks found that reference ${linkData.jiraTask.taskId}`,
        });
      }
    } catch (error) {
      console.error("Error showing notification:", error);
    }
  }

  /**
   * Check if current tab is a Jira task page
   * @returns {Promise<boolean>} - True if on Jira task page
   */
  static async isJiraTaskPage() {
    const pageInfo = await this.getCurrentPageInfo();
    return pageInfo.isJiraPage && pageInfo.taskId;
  }
}

export default JiraAPI;
