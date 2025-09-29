import { Storage } from "../utils/storage.js";
import { testConnection, fetchProjects } from "../api/redmine.js";
import { sanitizeUrl, isValidApiKey } from "../utils/validation.js";
import { CONFIG } from "../utils/constants.js";
import NotificationManager from "./NotificationManager.js";

/**
 * Manages Redmine settings in the options page
 */
export class RedmineSettingsManager {
  constructor() {
    this.elements = {};
    this.settings = null;
  }

  /**
   * Initialize Redmine settings manager
   */
  init() {
    this.bindElements();
    this.attachEventListeners();
  }

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Modal elements
    this.elements.modal = document.getElementById("redmineModal");
    this.elements.closeModal = document.getElementById("closeRedmineModal");

    // Form elements
    this.elements.url = document.getElementById("redmineUrl");
    this.elements.apiKey = document.getElementById("redmineApiKey");
    this.elements.projectId = document.getElementById("redmineProjectId");
    this.elements.activityId = document.getElementById("redmineActivityId");
    this.elements.researchActivityId = document.getElementById(
      "redmineResearchActivityId"
    );

    // Button elements
    this.elements.testConnection = document.getElementById(
      "testRedmineConnection"
    );
    this.elements.saveSettings = document.getElementById("saveRedmineSettings");
    this.elements.cancelSettings = document.getElementById(
      "cancelRedmineSettings"
    );

    // Advanced settings
    this.elements.toggleAdvanced = document.getElementById("toggleAdvanced");
    this.elements.advancedSettings =
      document.getElementById("advancedSettings");
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
    this.elements.toggleAdvanced?.addEventListener("click", () =>
      this.toggleAdvancedSettings()
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
      this.settings = await Storage.getRedmineSettings();
      this.populateForm();
    } catch (error) {
      console.error("Error loading Redmine settings:", error);
      NotificationManager.error("Failed to load Redmine settings");
    }
  }

  /**
   * Populate form with saved settings
   */
  populateForm() {
    if (this.elements.url) this.elements.url.value = this.settings.url || "";
    if (this.elements.apiKey)
      this.elements.apiKey.value = this.settings.apiKey || "";
    if (this.elements.projectId)
      this.elements.projectId.value = this.settings.projectId || "";
    if (this.elements.activityId)
      this.elements.activityId.value =
        this.settings.activityId || CONFIG.REDMINE.DEFAULT_ACTIVITY_ID;
    if (this.elements.researchActivityId)
      this.elements.researchActivityId.value =
        this.settings.researchActivityId ||
        CONFIG.REDMINE.DEFAULT_RESEARCH_ACTIVITY_ID;
  }

  /**
   * Open Redmine settings modal
   */
  openModal() {
    if (this.elements.modal) {
      this.elements.modal.style.display = "flex";
    }
  }

  /**
   * Close Redmine settings modal
   */
  closeModal() {
    if (this.elements.modal) {
      this.elements.modal.style.display = "none";
    }
  }

  /**
   * Toggle advanced settings visibility
   */
  toggleAdvancedSettings() {
    const { display } = this.elements.advancedSettings?.style || {};
    const isExpanded = display && display !== "none";

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
   * Get form data
   */
  getFormData() {
    return {
      url: this.elements.url?.value.trim() || "",
      apiKey: this.elements.apiKey?.value.trim() || "",
      projectId: this.elements.projectId?.value.trim() || "",
      activityId:
        parseInt(this.elements.activityId?.value) ||
        CONFIG.REDMINE.DEFAULT_ACTIVITY_ID,
      researchActivityId:
        parseInt(this.elements.researchActivityId?.value) ||
        CONFIG.REDMINE.DEFAULT_RESEARCH_ACTIVITY_ID,
    };
  }

  /**
   * Test Redmine connection
   */
  async testConnection() {
    const button = this.elements.testConnection;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Testing...";
    button.disabled = true;

    try {
      const settings = this.getFormData();
      if (!settings.url || !settings.apiKey) {
        throw new Error("URL and API key are required");
      }

      const result = await testConnection(settings);

      if (result.success) {
        NotificationManager.success(
          `✅ Connected successfully! User: ${result.user.firstname} ${result.user.lastname}`
        );
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Connection test failed:", error);
      NotificationManager.error(`❌ Connection failed: ${error.message}`);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Save Redmine settings
   */
  async saveSettings() {
    try {
      const settings = this.getFormData();

      // Validate settings
      if (!settings.url || !settings.apiKey) {
        throw new Error("URL and API key are required");
      }

      settings.url = sanitizeUrl(settings.url);

      if (!isValidApiKey(settings.apiKey)) {
        throw new Error("Invalid API key format");
      }

      await Storage.setRedmineSettings(settings);
      this.settings = settings;

      NotificationManager.success("✅ Redmine settings saved successfully!");
      this.closeModal();
    } catch (error) {
      console.error("Error saving Redmine settings:", error);
      NotificationManager.error(`❌ Error saving settings: ${error.message}`);
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return this.settings;
  }
}

export default RedmineSettingsManager;
