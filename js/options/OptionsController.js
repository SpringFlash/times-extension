import RedmineSettingsManager from "./RedmineSettingsManager.js";
import JiraSettingsManager from "./JiraSettingsManager.js";
import TempoSettingsManager from "./TempoSettingsManager.js";
// import TimeEntriesManager from "./TimeEntriesManager.js";
import TimeComparisonManager from "./TimeComparisonManager.js";
import SimpleTimeComparisonManager from "./SimpleTimeComparisonManager.js";
import NotificationManager from "./NotificationManager.js";

/**
 * Main options page controller
 */
export class OptionsController {
  constructor() {
    this.elements = {};

    // Initialize managers
    this.redmineManager = new RedmineSettingsManager();
    this.jiraManager = new JiraSettingsManager(this.redmineManager);
    this.tempoManager = new TempoSettingsManager();
    // this.timeEntriesManager = new TimeEntriesManager(this.redmineManager);

    // Комментируем старый менеджер
    // this.comparisonManager = new TimeComparisonManager(
    //   this.redmineManager,
    //   this.tempoManager,
    //   this.jiraManager
    // );

    // Используем новый простой менеджер
    this.simpleComparisonManager = new SimpleTimeComparisonManager(
      this.redmineManager,
      this.tempoManager,
      this.jiraManager
    );
  }

  /**
   * Initialize the options page
   */
  async init() {
    this.bindElements();
    this.attachEventListeners();
    this.setupModalHandlers();

    // Initialize all managers
    this.redmineManager.init();
    this.jiraManager.init();
    this.tempoManager.init();
    // this.timeEntriesManager.init();
    // this.comparisonManager.init(); // Закомментировали старый
    this.simpleComparisonManager.init(); // Используем новый

    // Load all settings and data
    await this.loadAllData();
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
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Settings modal handlers
    this.elements.openRedmineSettings?.addEventListener("click", () =>
      this.redmineManager.openModal()
    );
    this.elements.openJiraSettings?.addEventListener("click", () =>
      this.jiraManager.openModal()
    );
    this.elements.openTempoSettings?.addEventListener("click", () =>
      this.tempoManager.openModal()
    );
  }

  /**
   * Setup modal handlers
   */
  setupModalHandlers() {
    // Close modals on ESC key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAllModals();
      }
    });
  }

  /**
   * Load all settings and data
   */
  async loadAllData() {
    try {
      // Load settings in parallel
      await Promise.all([
        this.redmineManager.loadSettings(),
        this.jiraManager.loadSettings(),
        this.tempoManager.loadSettings(),
        // this.timeEntriesManager.loadTimeEntries(),
      ]);
    } catch (error) {
      console.error("Error loading data:", error);
      NotificationManager.error("Failed to load some data");
    }
  }

  /**
   * Close all modals
   */
  closeAllModals() {
    this.redmineManager.closeModal();
    this.jiraManager.closeModal();
    this.tempoManager.closeModal();
  }

  /**
   * Get manager instances (for global access)
   */
  getManagers() {
    return {
      redmine: this.redmineManager,
      jira: this.jiraManager,
      tempo: this.tempoManager,
      // timeEntries: this.timeEntriesManager,
      // comparison: this.comparisonManager, // Старый закомментирован
      simpleComparison: this.simpleComparisonManager, // Новый простой менеджер
    };
  }
}

export default OptionsController;
