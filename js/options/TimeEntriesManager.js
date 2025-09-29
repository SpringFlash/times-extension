import { Storage } from "../utils/storage.js";
import JiraAPI from "../api/jira.js";
import NotificationManager from "./NotificationManager.js";

/**
 * Manages time entries in the options page
 */
export class TimeEntriesManager {
  constructor(redmineSettingsManager) {
    this.elements = {};
    this.timeEntries = [];
    this.currentEditIndex = -1;
    this.redmineSettingsManager = redmineSettingsManager;
  }

  /**
   * Initialize time entries manager
   */
  init() {
    this.bindElements();
    this.attachEventListeners();
  }

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Table elements
    this.elements.timesTable = document.getElementById("timesTable");
    this.elements.noTasksMessage = document.getElementById("noTasksMessage");

    // Action buttons
    this.elements.toggleAddEntry = document.getElementById("toggleAddEntry");
    this.elements.fillViaAPI = document.getElementById("fillViaAPI");
    this.elements.clearAll = document.getElementById("clearAll");
    this.elements.exportBtn = document.getElementById("exportBtn");
    this.elements.importBtn = document.getElementById("importBtn");
    this.elements.importFile = document.getElementById("importFile");
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    this.elements.fillViaAPI?.addEventListener("click", () =>
      this.fillViaAPI()
    );
    this.elements.clearAll?.addEventListener("click", () =>
      this.clearAllData()
    );
    this.elements.exportBtn?.addEventListener("click", () => this.exportData());
    this.elements.importBtn?.addEventListener("click", () =>
      this.elements.importFile?.click()
    );
    this.elements.importFile?.addEventListener("change", (e) =>
      this.importData(e)
    );
  }

  /**
   * Load time entries from storage
   */
  async loadTimeEntries() {
    try {
      this.timeEntries = await Storage.getTimeEntries();
      this.renderTimeEntries();
    } catch (error) {
      console.error("Error loading time entries:", error);
      NotificationManager.error("Failed to load time entries");
    }
  }

  /**
   * Render time entries table
   */
  renderTimeEntries() {
    if (!this.elements.timesTable || !this.elements.noTasksMessage) return;

    if (this.timeEntries.length === 0) {
      this.elements.timesTable.innerHTML = "";
      this.elements.noTasksMessage.style.display = "block";
      return;
    }

    this.elements.noTasksMessage.style.display = "none";

    this.elements.timesTable.innerHTML = this.timeEntries
      .map(
        (entry, index) => `
      <tr>
        <td>${entry.date}</td>
        <td>${entry.task || entry.project || "N/A"}</td>
        <td>${entry.time}h</td>
        <td>${entry.comment || "-"}</td>
        <td>${entry.isResearch ? "✅" : "❌"}</td>
        <td>
          <button onclick="timeEntriesManager.editEntry(${index})" class="btn-small">✏️</button>
          <button onclick="timeEntriesManager.deleteEntry(${index})" class="btn-small btn-danger">🗑️</button>
        </td>
      </tr>
    `
      )
      .join("");
  }

  /**
   * Fill data via API
   */
  async fillViaAPI() {
    const button = this.elements.fillViaAPI;
    if (!button) return;

    button.disabled = true;
    button.textContent = "🔄 Processing...";

    try {
      const redmineSettings = this.redmineSettingsManager.getSettings();
      if (!redmineSettings || !redmineSettings.url || !redmineSettings.apiKey) {
        throw new Error("Please configure Redmine settings first");
      }

      // Check if we're on a Jira page and try to find Redmine links
      const isJiraPage = await JiraAPI.isJiraTaskPage();

      if (isJiraPage) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const linkData = await JiraAPI.findRedmineLinks(tab.id);

        if (linkData.success && linkData.hasRedmineLinks) {
          NotificationManager.success(
            `Found ${linkData.redmineLinks.length} Redmine links in Jira task!`
          );
          // TODO: Process the found links
        } else {
          NotificationManager.warning(
            "No Redmine links found in current Jira task"
          );
        }
      } else {
        NotificationManager.info("Open a Jira task to find Redmine links");
      }
    } catch (error) {
      console.error("Error filling via API:", error);
      NotificationManager.error(`Error: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "Fill via API";
    }
  }

  /**
   * Clear all data
   */
  async clearAllData() {
    if (
      !confirm(
        "Are you sure you want to clear all data? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      await Storage.setTimeEntries([]);
      this.timeEntries = [];
      this.renderTimeEntries();
      NotificationManager.success("✅ All data cleared successfully!");
    } catch (error) {
      console.error("Error clearing data:", error);
      NotificationManager.error(`❌ Error clearing data: ${error.message}`);
    }
  }

  /**
   * Export data to JSON
   */
  async exportData() {
    try {
      const redmineSettings = this.redmineSettingsManager.getSettings();
      const data = {
        timeEntries: this.timeEntries,
        redmineSettings: { ...redmineSettings, apiKey: "[HIDDEN]" }, // Don't export API key
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `times-set-backup-${
        new Date().toISOString().split("T")[0]
      }.json`;
      a.click();

      URL.revokeObjectURL(url);

      NotificationManager.success("✅ Data exported successfully!");
    } catch (error) {
      console.error("Error exporting data:", error);
      NotificationManager.error(`❌ Error exporting data: ${error.message}`);
    }
  }

  /**
   * Import data from JSON file
   */
  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.timeEntries && Array.isArray(data.timeEntries)) {
        if (
          confirm(
            `Import ${data.timeEntries.length} time entries? This will replace current data.`
          )
        ) {
          await Storage.setTimeEntries(data.timeEntries);
          this.timeEntries = data.timeEntries;
          this.renderTimeEntries();
          NotificationManager.success("✅ Data imported successfully!");
        }
      } else {
        throw new Error("Invalid file format");
      }
    } catch (error) {
      console.error("Error importing data:", error);
      NotificationManager.error(`❌ Error importing data: ${error.message}`);
    } finally {
      event.target.value = ""; // Clear file input
    }
  }

  /**
   * Edit time entry
   */
  editEntry(index) {
    // TODO: Implement edit functionality
    console.log("Edit entry:", index);
  }

  /**
   * Delete time entry
   */
  async deleteEntry(index) {
    if (!confirm("Delete this time entry?")) return;

    try {
      this.timeEntries.splice(index, 1);
      await Storage.setTimeEntries(this.timeEntries);
      this.renderTimeEntries();
      NotificationManager.success("✅ Entry deleted successfully!");
    } catch (error) {
      console.error("Error deleting entry:", error);
      NotificationManager.error(`❌ Error deleting entry: ${error.message}`);
    }
  }

  /**
   * Get time entries
   */
  getTimeEntries() {
    return this.timeEntries;
  }
}

export default TimeEntriesManager;


