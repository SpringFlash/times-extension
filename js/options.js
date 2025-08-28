import { Storage } from "./utils/storage.js";
import { testConnection, fetchProjects } from "./api/redmine.js";
import JiraAPI from "./api/jira.js";
import {
  testConnection as testTempoConnection,
  getCurrentUserWorklogsForMonth,
  exportWorklogs,
} from "./api/tempo.js";
import { sanitizeUrl, isValidApiKey } from "./utils/validation.js";
import { CONFIG } from "./utils/constants.js";

/**
 * Options page controller
 */
class OptionsController {
  constructor() {
    this.elements = {};
    this.currentEditIndex = -1;
    this.timeEntries = [];
    this.redmineSettings = null;
    this.jiraSettings = null;
    this.tempoSettings = null;
  }

  /**
   * Initialize the options page
   */
  async init() {
    this.bindElements();
    this.attachEventListeners();
    await this.loadSettings();
    await this.loadTimeEntries();
    this.setupModalHandlers();
  }

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Settings buttons
    this.elements.openRedmineSettings = document.getElementById(
      "openRedmineSettings"
    );
    this.elements.openJiraSettings =
      document.getElementById("openJiraSettings");
    this.elements.openTempoSettings =
      document.getElementById("openTempoSettings");

    // Redmine modal elements
    this.elements.redmineModal = document.getElementById("redmineModal");
    this.elements.closeRedmineModal =
      document.getElementById("closeRedmineModal");
    this.elements.redmineUrl = document.getElementById("redmineUrl");
    this.elements.redmineApiKey = document.getElementById("redmineApiKey");
    this.elements.redmineProjectId =
      document.getElementById("redmineProjectId");
    this.elements.redmineActivityId =
      document.getElementById("redmineActivityId");
    this.elements.redmineResearchActivityId = document.getElementById(
      "redmineResearchActivityId"
    );
    this.elements.testRedmineConnection = document.getElementById(
      "testRedmineConnection"
    );
    this.elements.saveRedmineSettings = document.getElementById(
      "saveRedmineSettings"
    );
    this.elements.cancelRedmineSettings = document.getElementById(
      "cancelRedmineSettings"
    );

    // Advanced settings toggle
    this.elements.toggleAdvanced = document.getElementById("toggleAdvanced");
    this.elements.advancedSettings =
      document.getElementById("advancedSettings");

    // Jira modal elements
    this.elements.jiraModal = document.getElementById("jiraModal");
    this.elements.closeJiraModal = document.getElementById("closeJiraModal");
    this.elements.jiraUrl = document.getElementById("jiraUrl");
    this.elements.jiraProject = document.getElementById("jiraProject");
    this.elements.jiraDefaultProject =
      document.getElementById("jiraDefaultProject");
    this.elements.jiraAutoDetect = document.getElementById("jiraAutoDetect");
    this.elements.refreshJiraProjects = document.getElementById(
      "refreshJiraProjects"
    );
    this.elements.saveJiraSettings =
      document.getElementById("saveJiraSettings");
    this.elements.cancelJiraSettings =
      document.getElementById("cancelJiraSettings");

    // Tempo modal elements
    this.elements.tempoModal = document.getElementById("tempoModal");
    this.elements.closeTempoModal = document.getElementById("closeTempoModal");
    this.elements.tempoApiToken = document.getElementById("tempoApiToken");
    this.elements.tempoAutoExport = document.getElementById("tempoAutoExport");
    this.elements.tempoExportFormat =
      document.getElementById("tempoExportFormat");
    this.elements.testTempoConnection = document.getElementById(
      "testTempoConnection"
    );
    this.elements.exportTempoData = document.getElementById("exportTempoData");
    this.elements.saveTempoSettings =
      document.getElementById("saveTempoSettings");
    this.elements.cancelTempoSettings = document.getElementById(
      "cancelTempoSettings"
    );

    // Time entries
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
    // Settings modal handlers
    this.elements.openRedmineSettings?.addEventListener("click", () =>
      this.openRedmineModal()
    );
    this.elements.closeRedmineModal?.addEventListener("click", () =>
      this.closeRedmineModal()
    );
    this.elements.cancelRedmineSettings?.addEventListener("click", () =>
      this.closeRedmineModal()
    );

    // Redmine settings handlers
    this.elements.testRedmineConnection?.addEventListener("click", () =>
      this.testRedmineConnection()
    );
    this.elements.saveRedmineSettings?.addEventListener("click", () =>
      this.saveRedmineSettings()
    );

    this.elements.openJiraSettings?.addEventListener("click", () =>
      this.openJiraModal()
    );
    this.elements.closeJiraModal?.addEventListener("click", () =>
      this.closeJiraModal()
    );
    this.elements.cancelJiraSettings?.addEventListener("click", () =>
      this.closeJiraModal()
    );
    this.elements.refreshJiraProjects?.addEventListener("click", () =>
      this.refreshJiraProjects()
    );
    this.elements.saveJiraSettings?.addEventListener("click", () =>
      this.saveJiraSettings()
    );

    // Tempo settings handlers
    this.elements.openTempoSettings?.addEventListener("click", () =>
      this.openTempoModal()
    );
    this.elements.closeTempoModal?.addEventListener("click", () =>
      this.closeTempoModal()
    );
    this.elements.cancelTempoSettings?.addEventListener("click", () =>
      this.closeTempoModal()
    );
    this.elements.testTempoConnection?.addEventListener("click", () =>
      this.testTempoConnection()
    );
    this.elements.exportTempoData?.addEventListener("click", () =>
      this.exportTempoData()
    );
    this.elements.saveTempoSettings?.addEventListener("click", () =>
      this.saveTempoSettings()
    );

    // Advanced settings toggle
    this.elements.toggleAdvanced?.addEventListener("click", () =>
      this.toggleAdvancedSettings()
    );

    // Action buttons
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

    // Modal click outside to close
    window.addEventListener("click", (e) => {
      if (e.target === this.elements.redmineModal) {
        this.closeRedmineModal();
      }
      if (e.target === this.elements.jiraModal) {
        this.closeJiraModal();
      }
      if (e.target === this.elements.tempoModal) {
        this.closeTempoModal();
      }
    });
  }

  /**
   * Setup modal handlers
   */
  setupModalHandlers() {
    // Закрытие по ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAllModals();
      }
    });
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      this.redmineSettings = await Storage.getRedmineSettings();
      this.jiraSettings = await Storage.getJiraSettings();
      this.tempoSettings = await Storage.getTempoSettings();
      this.populateRedmineForm();
      this.populateJiraForm();
      this.populateTempoForm();
    } catch (error) {
      console.error("Error loading settings:", error);
      this.showNotification("Failed to load settings", "error");
    }
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
      this.showNotification("Failed to load time entries", "error");
    }
  }

  /**
   * Populate Redmine form with saved settings
   */
  populateRedmineForm() {
    if (this.elements.redmineUrl)
      this.elements.redmineUrl.value = this.redmineSettings.url || "";
    if (this.elements.redmineApiKey)
      this.elements.redmineApiKey.value = this.redmineSettings.apiKey || "";
    if (this.elements.redmineProjectId)
      this.elements.redmineProjectId.value =
        this.redmineSettings.projectId || "";
    if (this.elements.redmineActivityId)
      this.elements.redmineActivityId.value =
        this.redmineSettings.activityId || CONFIG.REDMINE.DEFAULT_ACTIVITY_ID;
    if (this.elements.redmineResearchActivityId)
      this.elements.redmineResearchActivityId.value =
        this.redmineSettings.researchActivityId ||
        CONFIG.REDMINE.DEFAULT_RESEARCH_ACTIVITY_ID;
  }

  /**
   * Open Redmine settings modal
   */
  openRedmineModal() {
    if (this.elements.redmineModal) {
      this.elements.redmineModal.style.display = "block";
    }
  }

  /**
   * Close Redmine settings modal
   */
  closeRedmineModal() {
    if (this.elements.redmineModal) {
      this.elements.redmineModal.style.display = "none";
    }
  }

  /**
   * Open Jira settings modal
   */
  openJiraModal() {
    if (this.elements.jiraModal) {
      this.elements.jiraModal.style.display = "block";
    }
  }

  /**
   * Close Jira settings modal
   */
  closeJiraModal() {
    if (this.elements.jiraModal) {
      this.elements.jiraModal.style.display = "none";
    }
  }

  /**
   * Close all modals
   */
  closeAllModals() {
    this.closeRedmineModal();
    this.closeJiraModal();
    this.closeTempoModal();
  }

  /**
   * Toggle advanced settings visibility
   */
  toggleAdvancedSettings() {
    const isExpanded = this.elements.advancedSettings?.style.display !== "none";

    if (this.elements.advancedSettings) {
      this.elements.advancedSettings.style.display = isExpanded
        ? "none"
        : "block";
    }

    if (this.elements.toggleAdvanced) {
      const icon = this.elements.toggleAdvanced.querySelector(".toggle-icon");
      if (icon) {
        icon.textContent = isExpanded ? "▶" : "▼";
      }
    }
  }

  /**
   * Test Redmine connection
   */
  async testRedmineConnection() {
    const button = this.elements.testRedmineConnection;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Testing...";
    button.disabled = true;

    try {
      const settings = this.getRedmineFormData();
      if (!settings.url || !settings.apiKey) {
        throw new Error("URL and API key are required");
      }

      const result = await testConnection(settings);

      if (result.success) {
        this.showNotification(
          `✅ Connected successfully! User: ${result.user.firstname} ${result.user.lastname}`,
          "success"
        );
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      this.showNotification(`❌ Connection failed: ${error.message}`, "error");
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Get Redmine form data
   */
  getRedmineFormData() {
    return {
      url: this.elements.redmineUrl?.value.trim() || "",
      apiKey: this.elements.redmineApiKey?.value.trim() || "",
      projectId: this.elements.redmineProjectId?.value.trim() || "",
      activityId:
        parseInt(this.elements.redmineActivityId?.value) ||
        CONFIG.REDMINE.DEFAULT_ACTIVITY_ID,
      researchActivityId:
        parseInt(this.elements.redmineResearchActivityId?.value) ||
        CONFIG.REDMINE.DEFAULT_RESEARCH_ACTIVITY_ID,
    };
  }

  /**
   * Save Redmine settings
   */
  async saveRedmineSettings() {
    try {
      const settings = this.getRedmineFormData();

      // Validate settings
      if (!settings.url || !settings.apiKey) {
        throw new Error("URL and API key are required");
      }

      settings.url = sanitizeUrl(settings.url);

      if (!isValidApiKey(settings.apiKey)) {
        throw new Error("Invalid API key format");
      }

      await Storage.setRedmineSettings(settings);
      this.redmineSettings = settings;

      this.showNotification(
        "✅ Redmine settings saved successfully!",
        "success"
      );
      this.closeRedmineModal();
    } catch (error) {
      console.error("Error saving Redmine settings:", error);
      this.showNotification(
        `❌ Error saving settings: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Populate Jira form with saved settings
   */
  async populateJiraForm() {
    if (this.elements.jiraUrl)
      this.elements.jiraUrl.value = this.jiraSettings.url || "";
    if (this.elements.jiraProject)
      this.elements.jiraProject.value = this.jiraSettings.linkedProject || "";
    if (this.elements.jiraAutoDetect)
      this.elements.jiraAutoDetect.checked =
        this.jiraSettings.autoDetect || false;

    // Load Redmine projects for default project selection
    await this.refreshRedmineProjectsForJira();

    if (this.elements.jiraDefaultProject && this.jiraSettings.defaultProject)
      this.elements.jiraDefaultProject.value = this.jiraSettings.defaultProject;
  }

  /**
   * Get Jira form data
   */
  getJiraFormData() {
    return {
      url: this.elements.jiraUrl?.value.trim() || "",
      linkedProject: this.elements.jiraProject?.value.trim() || "",
      defaultProject: this.elements.jiraDefaultProject?.value.trim() || "",
      autoDetect: this.elements.jiraAutoDetect?.checked || false,
      enabled: true,
    };
  }

  /**
   * Refresh Jira projects (load Redmine projects for linking)
   */
  async refreshJiraProjects() {
    const button = this.elements.refreshJiraProjects;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Loading...";
    button.disabled = true;

    try {
      if (
        !this.redmineSettings ||
        !this.redmineSettings.url ||
        !this.redmineSettings.apiKey
      ) {
        throw new Error("Please configure Redmine settings first");
      }

      const result = await fetchProjects(this.redmineSettings);

      if (result.success && this.elements.jiraProject) {
        // Clear existing options
        this.elements.jiraProject.innerHTML =
          '<option value="">Select Redmine project...</option>';

        // Add projects as options
        result.projects.forEach((project) => {
          const option = document.createElement("option");
          option.value = project.id;
          option.textContent = `${project.name} (ID: ${project.id})`;
          this.elements.jiraProject.appendChild(option);
        });

        this.showNotification(
          `✅ Loaded ${result.projects.length} projects`,
          "success"
        );
      } else {
        throw new Error(result.error || "Failed to fetch projects");
      }
    } catch (error) {
      console.error("Error refreshing projects:", error);
      this.showNotification(
        `❌ Error loading projects: ${error.message}`,
        "error"
      );
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Refresh Redmine projects for default project selection
   */
  async refreshRedmineProjectsForJira() {
    try {
      if (!this.redmineSettings?.url || !this.redmineSettings?.apiKey) {
        if (this.elements.jiraDefaultProject) {
          this.elements.jiraDefaultProject.innerHTML =
            '<option value="">Configure Redmine first</option>';
        }
        return;
      }

      const result = await fetchProjects(this.redmineSettings);

      if (result.success && this.elements.jiraDefaultProject) {
        // Clear existing options
        this.elements.jiraDefaultProject.innerHTML =
          '<option value="">Select project...</option>';

        // Add projects as options
        result.projects.forEach((project) => {
          const option = document.createElement("option");
          option.value = project.id;
          option.textContent = `${project.name} (ID: ${project.id})`;
          this.elements.jiraDefaultProject.appendChild(option);
        });
      } else if (this.elements.jiraDefaultProject) {
        this.elements.jiraDefaultProject.innerHTML =
          '<option value="">Failed to load projects</option>';
      }
    } catch (error) {
      console.error("Error refreshing Redmine projects for Jira:", error);
      if (this.elements.jiraDefaultProject) {
        this.elements.jiraDefaultProject.innerHTML =
          '<option value="">Error loading projects</option>';
      }
    }
  }

  /**
   * Save Jira settings
   */
  async saveJiraSettings() {
    try {
      const settings = this.getJiraFormData();

      // Validate settings
      if (settings.url) {
        settings.url = sanitizeUrl(settings.url);
      }

      await Storage.setJiraSettings(settings);
      this.jiraSettings = settings;

      this.showNotification("✅ Jira settings saved successfully!", "success");
      this.closeJiraModal();
    } catch (error) {
      console.error("Error saving Jira settings:", error);
      this.showNotification(
        `❌ Error saving settings: ${error.message}`,
        "error"
      );
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
          <button onclick="optionsController.editEntry(${index})" class="btn-small">✏️</button>
          <button onclick="optionsController.deleteEntry(${index})" class="btn-small btn-danger">🗑️</button>
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
      if (
        !this.redmineSettings ||
        !this.redmineSettings.url ||
        !this.redmineSettings.apiKey
      ) {
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
          this.showNotification(
            `Found ${linkData.redmineLinks.length} Redmine links in Jira task!`,
            "success"
          );
          // TODO: Process the found links
        } else {
          this.showNotification(
            "No Redmine links found in current Jira task",
            "warning"
          );
        }
      } else {
        this.showNotification("Open a Jira task to find Redmine links", "info");
      }
    } catch (error) {
      console.error("Error filling via API:", error);
      this.showNotification(`Error: ${error.message}`, "error");
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
      this.showNotification("✅ All data cleared successfully!", "success");
    } catch (error) {
      console.error("Error clearing data:", error);
      this.showNotification(
        `❌ Error clearing data: ${error.message}`,
        "error"
      );
    }
  }

  /**
   * Export data to JSON
   */
  async exportData() {
    try {
      const data = {
        timeEntries: this.timeEntries,
        redmineSettings: { ...this.redmineSettings, apiKey: "[HIDDEN]" }, // Don't export API key
        jiraSettings: this.jiraSettings,
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

      this.showNotification("✅ Data exported successfully!", "success");
    } catch (error) {
      console.error("Error exporting data:", error);
      this.showNotification(
        `❌ Error exporting data: ${error.message}`,
        "error"
      );
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
          this.showNotification("✅ Data imported successfully!", "success");
        }
      } else {
        throw new Error("Invalid file format");
      }
    } catch (error) {
      console.error("Error importing data:", error);
      this.showNotification(
        `❌ Error importing data: ${error.message}`,
        "error"
      );
    } finally {
      event.target.value = ""; // Clear file input
    }
  }

  /**
   * Show notification
   */
  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add("show"), 10);

    // Remove after delay
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => document.body.removeChild(notification), 300);
    }, CONFIG.UI.NOTIFICATION_DURATION);
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
      this.showNotification("✅ Entry deleted successfully!", "success");
    } catch (error) {
      console.error("Error deleting entry:", error);
      this.showNotification(
        `❌ Error deleting entry: ${error.message}`,
        "error"
      );
    }
  }

  // ===== TEMPO SETTINGS METHODS =====

  /**
   * Populate Tempo form with saved settings
   */
  populateTempoForm() {
    if (this.elements.tempoApiToken)
      this.elements.tempoApiToken.value = this.tempoSettings.apiToken || "";
    if (this.elements.tempoAutoExport)
      this.elements.tempoAutoExport.checked =
        this.tempoSettings.autoExport || false;
    if (this.elements.tempoExportFormat)
      this.elements.tempoExportFormat.value =
        this.tempoSettings.exportFormat || "json";
  }

  /**
   * Open Tempo settings modal
   */
  openTempoModal() {
    if (this.elements.tempoModal) {
      this.elements.tempoModal.style.display = "block";
    }
  }

  /**
   * Close Tempo settings modal
   */
  closeTempoModal() {
    if (this.elements.tempoModal) {
      this.elements.tempoModal.style.display = "none";
    }
  }

  /**
   * Get Tempo form data
   */
  getTempoFormData() {
    return {
      apiToken: this.elements.tempoApiToken?.value.trim() || "",
      autoExport: this.elements.tempoAutoExport?.checked || false,
      exportFormat: this.elements.tempoExportFormat?.value || "json",
      enabled: true,
    };
  }

  /**
   * Test Tempo connection
   */
  async testTempoConnection() {
    const button = this.elements.testTempoConnection;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Testing...";
    button.disabled = true;

    try {
      const settings = this.getTempoFormData();
      if (!settings.apiToken) {
        throw new Error("API token is required");
      }

      const result = await testTempoConnection(settings);

      if (result.success) {
        this.showNotification(
          `✅ Connected successfully! Found ${result.totalWorklogs} total worklogs`,
          "success"
        );
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Tempo connection test failed:", error);
      this.showNotification(`❌ Connection failed: ${error.message}`, "error");
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Export current month Tempo data
   */
  async exportTempoData() {
    const button = this.elements.exportTempoData;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "📤 Exporting...";
    button.disabled = true;

    try {
      const settings = this.getTempoFormData();
      if (!settings.apiToken) {
        throw new Error("Please configure Tempo settings first");
      }

      // Get current month data
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const result = await getCurrentUserWorklogsForMonth(
        year,
        month,
        settings
      );

      if (result.success) {
        // Export the data
        const exportResult = await exportWorklogs(
          result.worklogs,
          settings.exportFormat
        );

        if (exportResult.success) {
          // Create download
          const blob = new Blob([exportResult.data], {
            type:
              settings.exportFormat === "csv" ? "text/csv" : "application/json",
          });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = `tempo-worklogs-${year}-${month
            .toString()
            .padStart(2, "0")}.${settings.exportFormat}`;
          a.click();

          URL.revokeObjectURL(url);

          this.showNotification(
            `✅ Exported ${result.total} worklogs (${result.totalHours}h total)`,
            "success"
          );
        } else {
          throw new Error(exportResult.error);
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error exporting Tempo data:", error);
      this.showNotification(`❌ Export failed: ${error.message}`, "error");
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Save Tempo settings
   */
  async saveTempoSettings() {
    try {
      const settings = this.getTempoFormData();

      // Validate settings
      if (!settings.apiToken) {
        throw new Error("API token is required");
      }

      await Storage.setTempoSettings(settings);
      this.tempoSettings = settings;

      this.showNotification("✅ Tempo settings saved successfully!", "success");
      this.closeTempoModal();
    } catch (error) {
      console.error("Error saving Tempo settings:", error);
      this.showNotification(
        `❌ Error saving settings: ${error.message}`,
        "error"
      );
    }
  }
}

// Initialize when DOM is ready
const optionsController = new OptionsController();

document.addEventListener("DOMContentLoaded", () => {
  optionsController.init();
});

// Make available globally for HTML onclick handlers
window.optionsController = optionsController;
