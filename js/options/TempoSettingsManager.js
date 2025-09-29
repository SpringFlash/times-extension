import { Storage } from "../utils/storage.js";
import {
  testConnection as testTempoConnection,
  getCurrentUserWorklogsForMonth,
  exportWorklogs,
} from "../api/tempo.js";
import NotificationManager from "./NotificationManager.js";

/**
 * Manages Tempo settings in the options page
 */
export class TempoSettingsManager {
  constructor() {
    this.elements = {};
    this.settings = null;
  }

  /**
   * Initialize Tempo settings manager
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
    this.elements.modal = document.getElementById("tempoModal");
    this.elements.closeModal = document.getElementById("closeTempoModal");

    // Form elements
    this.elements.apiToken = document.getElementById("tempoApiToken");
    this.elements.autoExport = document.getElementById("tempoAutoExport");
    this.elements.exportFormat = document.getElementById("tempoExportFormat");

    // Button elements
    this.elements.testConnection = document.getElementById(
      "testTempoConnection"
    );
    this.elements.exportData = document.getElementById("exportTempoData");
    this.elements.saveSettings = document.getElementById("saveTempoSettings");
    this.elements.cancelSettings = document.getElementById(
      "cancelTempoSettings"
    );
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
    this.elements.exportData?.addEventListener("click", () =>
      this.exportData()
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
      this.settings = await Storage.getTempoSettings();
      this.populateForm();
    } catch (error) {
      console.error("Error loading Tempo settings:", error);
      NotificationManager.error("Failed to load Tempo settings");
    }
  }

  /**
   * Populate form with saved settings
   */
  populateForm() {
    if (this.elements.apiToken)
      this.elements.apiToken.value = this.settings.apiToken || "";
    if (this.elements.autoExport)
      this.elements.autoExport.checked = this.settings.autoExport || false;
    if (this.elements.exportFormat)
      this.elements.exportFormat.value = this.settings.exportFormat || "json";
  }

  /**
   * Open Tempo settings modal
   */
  openModal() {
    if (this.elements.modal) {
      this.elements.modal.style.display = "flex";
    }
  }

  /**
   * Close Tempo settings modal
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
      apiToken: this.elements.apiToken?.value.trim() || "",
      autoExport: this.elements.autoExport?.checked || false,
      exportFormat: this.elements.exportFormat?.value || "json",
      enabled: true,
    };
  }

  /**
   * Test Tempo connection
   */
  async testConnection() {
    const button = this.elements.testConnection;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Testing...";
    button.disabled = true;

    try {
      const settings = this.getFormData();
      if (!settings.apiToken) {
        throw new Error("API token is required");
      }

      const result = await testTempoConnection(settings);

      if (result.success) {
        NotificationManager.success(
          `✅ Connected successfully! Found ${result.totalWorklogs} total worklogs`
        );
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Tempo connection test failed:", error);
      NotificationManager.error(`❌ Connection failed: ${error.message}`);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Export current month Tempo data
   */
  async exportData() {
    const button = this.elements.exportData;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "📤 Exporting...";
    button.disabled = true;

    try {
      const settings = this.getFormData();
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

          NotificationManager.success(
            `✅ Exported ${result.total} worklogs (${result.totalHours}h total)`
          );
        } else {
          throw new Error(exportResult.error);
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error exporting Tempo data:", error);
      NotificationManager.error(`❌ Export failed: ${error.message}`);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Save Tempo settings
   */
  async saveSettings() {
    try {
      const settings = this.getFormData();

      // Validate settings
      if (!settings.apiToken) {
        throw new Error("API token is required");
      }

      await Storage.setTempoSettings(settings);
      this.settings = settings;

      NotificationManager.success("✅ Tempo settings saved successfully!");
      this.closeModal();
    } catch (error) {
      console.error("Error saving Tempo settings:", error);
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

export default TempoSettingsManager;
