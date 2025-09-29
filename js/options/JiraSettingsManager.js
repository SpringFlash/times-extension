import { Storage } from "../utils/storage.js";
import { fetchProjects } from "../api/redmine.js";
import JiraRestAPI from "../api/jira-rest.js";
import { sanitizeUrl } from "../utils/validation.js";
import NotificationManager from "./NotificationManager.js";
import JiraProjectMappingsManager from "./JiraProjectMappingsManager.js";

/**
 * Manages Jira REST API settings in the options page
 */
export class JiraSettingsManager {
  constructor(redmineSettingsManager) {
    this.elements = {};
    this.settings = null;
    this.redmineSettingsManager = redmineSettingsManager;
    this.mappingsManager = new JiraProjectMappingsManager(
      redmineSettingsManager
    );
  }

  /**
   * Initialize Jira settings manager
   */
  init() {
    this.bindElements();
    this.attachEventListeners();
    this.mappingsManager.init();
  }

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Modal elements
    this.elements.modal = document.getElementById("jiraModal");
    this.elements.closeModal = document.getElementById("closeJiraModal");

    // Form elements
    this.elements.url = document.getElementById("jiraUrl");
    this.elements.email = document.getElementById("jiraEmail");
    this.elements.apiToken = document.getElementById("jiraApiToken");
    this.elements.enabled = document.getElementById("jiraEnabled");
    this.elements.defaultProject =
      document.getElementById("jiraDefaultProject");

    // Status elements
    this.elements.connectionStatus = document.getElementById(
      "jiraConnectionStatus"
    );

    // Button elements
    this.elements.testConnection =
      document.getElementById("testJiraConnection");
    this.elements.saveSettings = document.getElementById("saveJiraSettings");
    this.elements.cancelSettings =
      document.getElementById("cancelJiraSettings");
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    this.elements.closeModal?.addEventListener("click", () =>
      this.closeModal()
    );
    this.elements.cancelSettings?.addEventListener("click", () =>
      this.closeModal()
    );
    this.elements.testConnection?.addEventListener("click", () =>
      this.testConnection()
    );
    this.elements.saveSettings?.addEventListener("click", () =>
      this.saveSettings()
    );

    // Modal click outside to close
    window.addEventListener("click", (e) => {
      if (e.target === this.elements.modal) {
        this.closeModal();
      }
    });
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      this.settings = await Storage.getJiraSettings();
      await this.populateForm();
      await this.mappingsManager.loadMappings();
    } catch (error) {
      console.error("Error loading Jira settings:", error);
      NotificationManager.error("Failed to load Jira settings");
    }
  }

  /**
   * Populate form with saved settings
   */
  async populateForm() {
    if (this.elements.url) this.elements.url.value = this.settings.url || "";
    if (this.elements.email)
      this.elements.email.value = this.settings.email || "";
    if (this.elements.apiToken)
      this.elements.apiToken.value = this.settings.apiToken || "";
    if (this.elements.enabled)
      this.elements.enabled.checked = this.settings.enabled || false;

    // Load Redmine projects for default project selection
    await this.refreshRedmineProjects();

    if (this.elements.defaultProject && this.settings.defaultProject) {
      this.elements.defaultProject.value = this.settings.defaultProject;
    }

    // Update connection status
    this.updateConnectionStatus("⚪", "Not tested");
  }

  /**
   * Open Jira settings modal
   */
  openModal() {
    if (this.elements.modal) {
      this.elements.modal.style.display = "flex";
    }
  }

  /**
   * Close Jira settings modal
   */
  closeModal() {
    if (this.elements.modal) {
      this.elements.modal.style.display = "none";
    }
  }

  /**
   * Get form data
   */
  getFormData() {
    return {
      url: this.elements.url?.value.trim() || "",
      email: this.elements.email?.value.trim() || "",
      apiToken: this.elements.apiToken?.value.trim() || "",
      enabled: this.elements.enabled?.checked || false,
      defaultProject: this.elements.defaultProject?.value.trim() || "",
    };
  }

  /**
   * Test Jira connection
   */
  async testConnection() {
    const button = this.elements.testConnection;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Testing...";
    button.disabled = true;

    try {
      const settings = this.getFormData();

      // Validate required fields
      if (!settings.url) {
        throw new Error("Jira URL is required");
      }
      if (!settings.email) {
        throw new Error("Email address is required");
      }
      if (!settings.apiToken) {
        throw new Error("API token is required");
      }

      // Sanitize URL
      settings.url = sanitizeUrl(settings.url);

      // Test connection
      console.log("🔍 Testing Jira connection...");
      const result = await JiraRestAPI.testConnection(settings);

      if (result.success) {
        this.updateConnectionStatus(
          "🟢",
          `Connected as ${result.user.displayName}`
        );
        NotificationManager.success(
          `✅ Connected to Jira as ${result.user.displayName} (${result.user.emailAddress})`
        );
      } else {
        this.updateConnectionStatus("🔴", "Connection failed");
        throw new Error(result.error || "Connection test failed");
      }
    } catch (error) {
      console.error("❌ Jira connection test failed:", error);
      this.updateConnectionStatus("🔴", `Error: ${error.message}`);
      NotificationManager.error(`❌ Connection failed: ${error.message}`);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Update connection status display
   */
  updateConnectionStatus(indicator, text) {
    if (!this.elements.connectionStatus) return;

    const statusIndicator =
      this.elements.connectionStatus.querySelector(".status-indicator");
    const statusText =
      this.elements.connectionStatus.querySelector(".status-text");

    if (statusIndicator) statusIndicator.textContent = indicator;
    if (statusText) statusText.textContent = text;
  }

  /**
   * Refresh Redmine projects for default project selection
   */
  async refreshRedmineProjects() {
    try {
      const redmineSettings = this.redmineSettingsManager.getSettings();
      if (!redmineSettings?.url || !redmineSettings?.apiKey) {
        if (this.elements.defaultProject) {
          this.elements.defaultProject.innerHTML =
            '<option value="">Configure Redmine first</option>';
        }
        return;
      }

      const result = await fetchProjects(redmineSettings);

      if (result.success && this.elements.defaultProject) {
        // Clear existing options
        this.elements.defaultProject.innerHTML =
          '<option value="">Select project...</option>';

        // Add projects as options
        result.projects.forEach((project) => {
          const option = document.createElement("option");
          option.value = project.id;
          option.textContent = `${project.name} (ID: ${project.id})`;
          this.elements.defaultProject.appendChild(option);
        });
      } else if (this.elements.defaultProject) {
        this.elements.defaultProject.innerHTML =
          '<option value="">Failed to load projects</option>';
      }
    } catch (error) {
      console.error("Error refreshing Redmine projects for Jira:", error);
      if (this.elements.defaultProject) {
        this.elements.defaultProject.innerHTML =
          '<option value="">Error loading projects</option>';
      }
    }
  }

  /**
   * Save Jira settings
   */
  async saveSettings() {
    try {
      const settings = this.getFormData();

      // Validate settings
      if (settings.enabled) {
        if (!settings.url) {
          throw new Error("Jira URL is required when integration is enabled");
        }
        if (!settings.email) {
          throw new Error(
            "Email address is required when integration is enabled"
          );
        }
        if (!settings.apiToken) {
          throw new Error("API token is required when integration is enabled");
        }

        // Sanitize URL
        settings.url = sanitizeUrl(settings.url);
      }

      await Storage.setJiraSettings(settings);
      this.settings = settings;

      NotificationManager.success("✅ Jira settings saved successfully!");
      this.closeModal();
    } catch (error) {
      console.error("Error saving Jira settings:", error);
      NotificationManager.error(`❌ Error saving settings: ${error.message}`);
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return this.settings;
  }

  /**
   * Check if Jira integration is enabled and configured
   */
  isEnabled() {
    return (
      this.settings?.enabled &&
      this.settings?.url &&
      this.settings?.email &&
      this.settings?.apiToken
    );
  }

  /**
   * Get Jira projects (for future use)
   */
  async getJiraProjects() {
    if (!this.isEnabled()) {
      return { success: false, error: "Jira integration not configured" };
    }

    try {
      return await JiraRestAPI.getProjects(this.settings);
    } catch (error) {
      console.error("Error getting Jira projects:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search Jira issues (for future use)
   */
  async searchJiraIssues(jql, options = {}) {
    if (!this.isEnabled()) {
      return { success: false, error: "Jira integration not configured" };
    }

    try {
      return await JiraRestAPI.searchIssues(jql, this.settings, options);
    } catch (error) {
      console.error("Error searching Jira issues:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get linked Redmine project ID for current JIRA URL
   * @param {string} jiraUrl - Current JIRA URL
   * @returns {Promise<string|null>} - Redmine project ID or null
   */
  async getLinkedProject(jiraUrl) {
    try {
      const linkedProject =
        await this.mappingsManager.findRedmineProjectByJiraUrl(jiraUrl);
      return linkedProject || this.settings?.defaultProject || null;
    } catch (error) {
      console.error("Error getting linked project:", error);
      return this.settings?.defaultProject || null;
    }
  }

  /**
   * Get mappings manager
   */
  getMappingsManager() {
    return this.mappingsManager;
  }
}

export default JiraSettingsManager;
