import { CONFIG } from "./constants.js";

/**
 * Storage utility class for Chrome extension
 */
export class Storage {
  /**
   * Get value from storage
   * @param {string} key - Storage key
   * @param {any} defaultValue - Default value if key not found
   * @returns {Promise<any>} - Stored value
   */
  static async get(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
      console.error(`Error getting storage key ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Set value in storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @returns {Promise<boolean>} - Success status
   */
  static async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.error(`Error setting storage key ${key}:`, error);
      return false;
    }
  }

  /**
   * Remove key from storage
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} - Success status
   */
  static async remove(key) {
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (error) {
      console.error(`Error removing storage key ${key}:`, error);
      return false;
    }
  }

  /**
   * Clear all storage
   * @returns {Promise<boolean>} - Success status
   */
  static async clear() {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (error) {
      console.error("Error clearing storage:", error);
      return false;
    }
  }

  /**
   * Get Redmine settings
   * @returns {Promise<Object>} - Redmine settings object
   */
  static async getRedmineSettings() {
    return await this.get(CONFIG.STORAGE.REDMINE_SETTINGS, {
      url: "",
      apiKey: "",
      projectId: "",
      activityId: CONFIG.REDMINE.DEFAULT_ACTIVITY_ID,
      researchActivityId: CONFIG.REDMINE.DEFAULT_RESEARCH_ACTIVITY_ID,
    });
  }

  /**
   * Set Redmine settings
   * @param {Object} settings - Redmine settings object
   * @returns {Promise<boolean>} - Success status
   */
  static async setRedmineSettings(settings) {
    return await this.set(CONFIG.STORAGE.REDMINE_SETTINGS, settings);
  }

  /**
   * Get Jira settings
   * @returns {Promise<Object>} - Jira settings object
   */
  static async getJiraSettings() {
    return await this.get(CONFIG.STORAGE.JIRA_SETTINGS, {
      url: "",
      email: "",
      apiToken: "",
      enabled: false,
      defaultProject: "",
    });
  }

  /**
   * Set Jira settings
   * @param {Object} settings - Jira settings object
   * @returns {Promise<boolean>} - Success status
   */
  static async setJiraSettings(settings) {
    return await this.set(CONFIG.STORAGE.JIRA_SETTINGS, settings);
  }

  /**
   * Get Tempo settings
   * @returns {Promise<Object>} - Tempo settings object
   */
  static async getTempoSettings() {
    return await this.get(CONFIG.STORAGE.TEMPO_SETTINGS, {
      apiToken: "",
      autoExport: false,
      exportFormat: "json",
      enabled: false,
    });
  }

  /**
   * Set Tempo settings
   * @param {Object} settings - Tempo settings object
   * @returns {Promise<boolean>} - Success status
   */
  static async setTempoSettings(settings) {
    return await this.set(CONFIG.STORAGE.TEMPO_SETTINGS, settings);
  }

  /**
   * Get time entries
   * @returns {Promise<Array>} - Array of time entries
   */
  static async getTimeEntries() {
    return await this.get(CONFIG.STORAGE.TIME_ENTRIES, []);
  }

  /**
   * Set time entries
   * @param {Array} entries - Array of time entries
   * @returns {Promise<boolean>} - Success status
   */
  static async setTimeEntries(entries) {
    return await this.set(CONFIG.STORAGE.TIME_ENTRIES, entries);
  }

  /**
   * Get JIRA project mappings
   * @returns {Promise<Array>} - Array of JIRA URL to Redmine project mappings
   */
  static async getJiraProjectMappings() {
    return await this.get(CONFIG.STORAGE.JIRA_PROJECT_MAPPINGS, []);
  }

  /**
   * Set JIRA project mappings
   * @param {Array} mappings - Array of mappings {jiraUrl, redmineProjectId, description}
   * @returns {Promise<boolean>} - Success status
   */
  static async setJiraProjectMappings(mappings) {
    return await this.set(CONFIG.STORAGE.JIRA_PROJECT_MAPPINGS, mappings);
  }

  /**
   * Add JIRA project mapping
   * @param {Object} mapping - Mapping object {jiraUrl, redmineProjectId, description}
   * @returns {Promise<boolean>} - Success status
   */
  static async addJiraProjectMapping(mapping) {
    const mappings = await this.getJiraProjectMappings();
    mappings.push({
      id: Date.now().toString(),
      jiraUrl: mapping.jiraUrl,
      redmineProjectId: mapping.redmineProjectId,
      description: mapping.description || "",
      createdAt: new Date().toISOString(),
    });
    return await this.setJiraProjectMappings(mappings);
  }

  /**
   * Update JIRA project mapping
   * @param {string} id - Mapping ID
   * @param {Object} updates - Updates to apply
   * @returns {Promise<boolean>} - Success status
   */
  static async updateJiraProjectMapping(id, updates) {
    const mappings = await this.getJiraProjectMappings();
    const index = mappings.findIndex((m) => m.id === id);
    if (index !== -1) {
      mappings[index] = {
        ...mappings[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return await this.setJiraProjectMappings(mappings);
    }
    return false;
  }

  /**
   * Remove JIRA project mapping
   * @param {string} id - Mapping ID
   * @returns {Promise<boolean>} - Success status
   */
  static async removeJiraProjectMapping(id) {
    const mappings = await this.getJiraProjectMappings();
    const filtered = mappings.filter((m) => m.id !== id);
    return await this.setJiraProjectMappings(filtered);
  }

  /**
   * Find Redmine project ID by JIRA URL
   * @param {string} jiraUrl - JIRA URL to match
   * @returns {Promise<string|null>} - Redmine project ID or null if not found
   */
  static async findRedmineProjectByJiraUrl(jiraUrl) {
    const mappings = await this.getJiraProjectMappings();
    const normalizedUrl = jiraUrl.toLowerCase().replace(/\/$/, "");

    const mapping = mappings.find((m) => {
      const mappingUrl = m.jiraUrl.toLowerCase().replace(/\/$/, "");
      return (
        normalizedUrl.includes(mappingUrl) || mappingUrl.includes(normalizedUrl)
      );
    });

    return mapping ? mapping.redmineProjectId : null;
  }
}

export default Storage;
