import OptionsController from "./OptionsController.js";

// Initialize when DOM is ready
const optionsController = new OptionsController();

document.addEventListener("DOMContentLoaded", () => {
  optionsController.init();
});

// Make managers available globally for HTML onclick handlers
const managers = optionsController.getManagers();
window.redmineSettingsManager = managers.redmine;
window.jiraSettingsManager = managers.jira;
window.tempoSettingsManager = managers.tempo;
window.timeEntriesManager = managers.timeEntries;
