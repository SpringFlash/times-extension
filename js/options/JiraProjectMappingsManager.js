import { Storage } from "../utils/storage.js";
import { fetchProjects } from "../api/redmine.js";
import { sanitizeUrl } from "../utils/validation.js";
import NotificationManager from "./NotificationManager.js";

/**
 * Manages JIRA project mappings in the options page
 */
export class JiraProjectMappingsManager {
  constructor(redmineSettingsManager) {
    this.elements = {};
    this.mappings = [];
    this.redmineProjects = [];
    this.redmineSettingsManager = redmineSettingsManager;
    this.currentEditingId = null;
  }

  /**
   * Initialize the mappings manager
   */
  init() {
    this.bindElements();
    this.attachEventListeners();
  }

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Main elements
    this.elements.addButton = document.getElementById("addJiraMapping");
    this.elements.mappingsTable = document.getElementById("jiraMappingsTable");

    // Modal elements
    this.elements.modal = document.getElementById("jiraMappingModal");
    this.elements.modalTitle = document.getElementById("jiraMappingModalTitle");
    this.elements.closeModal = document.getElementById("closeJiraMappingModal");

    // Form elements
    this.elements.form = document.getElementById("jiraMappingForm");
    this.elements.mappingId = document.getElementById("mappingId");
    this.elements.jiraUrl = document.getElementById("mappingJiraUrl");
    this.elements.redmineProject = document.getElementById(
      "mappingRedmineProject"
    );
    this.elements.description = document.getElementById("mappingDescription");

    // Button elements
    this.elements.saveButton = document.getElementById("saveMappingBtn");
    this.elements.cancelButton = document.getElementById("cancelMappingBtn");
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    this.elements.addButton?.addEventListener("click", () =>
      this.openAddModal()
    );
    this.elements.closeModal?.addEventListener("click", () =>
      this.closeModal()
    );
    this.elements.cancelButton?.addEventListener("click", () =>
      this.closeModal()
    );
    this.elements.saveButton?.addEventListener("click", () =>
      this.saveMapping()
    );

    // Modal click outside to close
    window.addEventListener("click", (e) => {
      if (e.target === this.elements.modal) {
        this.closeModal();
      }
    });

    // Form submit prevention
    this.elements.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveMapping();
    });
  }

  /**
   * Load mappings from storage and refresh display
   */
  async loadMappings() {
    try {
      this.mappings = await Storage.getJiraProjectMappings();
      await this.loadRedmineProjects();
      this.renderMappingsTable();
    } catch (error) {
      console.error("Error loading JIRA mappings:", error);
      NotificationManager.error("Failed to load JIRA project mappings");
    }
  }

  /**
   * Load Redmine projects for the dropdown
   */
  async loadRedmineProjects() {
    try {
      const redmineSettings = this.redmineSettingsManager.getSettings();
      if (!redmineSettings?.url || !redmineSettings?.apiKey) {
        this.redmineProjects = [];
        return;
      }

      const result = await fetchProjects(redmineSettings);
      if (result.success) {
        this.redmineProjects = result.projects;
      } else {
        this.redmineProjects = [];
        console.warn(
          "Failed to load Redmine projects for mappings:",
          result.error
        );
      }
    } catch (error) {
      console.error("Error loading Redmine projects:", error);
      this.redmineProjects = [];
    }
  }

  /**
   * Render the mappings table
   */
  renderMappingsTable() {
    if (!this.elements.mappingsTable) return;

    if (this.mappings.length === 0) {
      this.elements.mappingsTable.innerHTML = `
        <div class="no-mappings">
          <div class="icon">🔗</div>
          <div>No JIRA project mappings configured yet.</div>
          <div style="margin-top: 10px; font-size: 14px;">
            Click "Add Mapping" to create your first mapping.
          </div>
        </div>
      `;
      return;
    }

    const html = `
      <div class="mappings-table-header">
        <div>JIRA Instance URL</div>
        <div>Redmine Project</div>
        <div>Description</div>
        <div>Actions</div>
      </div>
      ${this.mappings.map((mapping) => this.renderMappingRow(mapping)).join("")}
    `;

    this.elements.mappingsTable.innerHTML = html;

    // Attach event listeners to action buttons
    this.attachMappingActionListeners();
  }

  /**
   * Render a single mapping row
   */
  renderMappingRow(mapping) {
    const project = this.redmineProjects.find(
      (p) => p.id.toString() === mapping.redmineProjectId
    );
    const projectName = project
      ? `${project.name} (ID: ${project.id})`
      : `Project ID: ${mapping.redmineProjectId}`;

    return `
      <div class="mapping-row" data-mapping-id="${mapping.id}">
        <div class="mapping-url">${mapping.jiraUrl}</div>
        <div class="mapping-project">${projectName}</div>
        <div class="mapping-description">${mapping.description || "—"}</div>
        <div class="mapping-actions">
          <button class="mapping-action-btn edit" data-action="edit" data-id="${
            mapping.id
          }" title="Edit mapping">
            ✏️
          </button>
          <button class="mapping-action-btn delete" data-action="delete" data-id="${
            mapping.id
          }" title="Delete mapping">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to mapping action buttons
   */
  attachMappingActionListeners() {
    const actionButtons = this.elements.mappingsTable.querySelectorAll(
      ".mapping-action-btn"
    );
    actionButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const action = button.dataset.action;
        const id = button.dataset.id;

        if (action === "edit") {
          this.openEditModal(id);
        } else if (action === "delete") {
          this.deleteMapping(id);
        }
      });
    });
  }

  /**
   * Open modal for adding new mapping
   */
  async openAddModal() {
    this.currentEditingId = null;
    this.elements.modalTitle.textContent = "🔗 Add JIRA Project Mapping";

    await this.populateRedmineProjectsDropdown();
    this.clearForm();
    this.openModal();
  }

  /**
   * Open modal for editing existing mapping
   */
  async openEditModal(id) {
    const mapping = this.mappings.find((m) => m.id === id);
    if (!mapping) return;

    this.currentEditingId = id;
    this.elements.modalTitle.textContent = "✏️ Edit JIRA Project Mapping";

    await this.populateRedmineProjectsDropdown();
    this.populateForm(mapping);
    this.openModal();
  }

  /**
   * Open the modal
   */
  openModal() {
    if (this.elements.modal) {
      this.elements.modal.style.display = "flex";
    }
  }

  /**
   * Close the modal
   */
  closeModal() {
    if (this.elements.modal) {
      this.elements.modal.style.display = "none";
    }
    this.currentEditingId = null;
    this.clearForm();
  }

  /**
   * Populate Redmine projects dropdown
   */
  async populateRedmineProjectsDropdown() {
    if (!this.elements.redmineProject) return;

    // Refresh projects if needed
    await this.loadRedmineProjects();

    // Clear existing options
    this.elements.redmineProject.innerHTML =
      '<option value="">Select project...</option>';

    if (this.redmineProjects.length === 0) {
      this.elements.redmineProject.innerHTML =
        '<option value="">Configure Redmine first</option>';
      return;
    }

    // Add project options
    this.redmineProjects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = `${project.name} (ID: ${project.id})`;
      this.elements.redmineProject.appendChild(option);
    });
  }

  /**
   * Clear the form
   */
  clearForm() {
    if (this.elements.mappingId) this.elements.mappingId.value = "";
    if (this.elements.jiraUrl) this.elements.jiraUrl.value = "";
    if (this.elements.redmineProject) this.elements.redmineProject.value = "";
    if (this.elements.description) this.elements.description.value = "";
  }

  /**
   * Populate form with mapping data
   */
  populateForm(mapping) {
    if (this.elements.mappingId) this.elements.mappingId.value = mapping.id;
    if (this.elements.jiraUrl) this.elements.jiraUrl.value = mapping.jiraUrl;
    if (this.elements.redmineProject)
      this.elements.redmineProject.value = mapping.redmineProjectId;
    if (this.elements.description)
      this.elements.description.value = mapping.description || "";
  }

  /**
   * Get form data
   */
  getFormData() {
    return {
      jiraUrl: this.elements.jiraUrl?.value.trim() || "",
      redmineProjectId: this.elements.redmineProject?.value.trim() || "",
      description: this.elements.description?.value.trim() || "",
    };
  }

  /**
   * Save mapping (add or update)
   */
  async saveMapping() {
    try {
      const formData = this.getFormData();

      // Validate form data
      if (!formData.jiraUrl) {
        throw new Error("JIRA URL is required");
      }
      if (!formData.redmineProjectId) {
        throw new Error("Redmine project is required");
      }

      // Sanitize URL
      formData.jiraUrl = sanitizeUrl(formData.jiraUrl);

      // Check for duplicates (excluding current editing item)
      const existingMapping = this.mappings.find(
        (m) =>
          m.jiraUrl.toLowerCase() === formData.jiraUrl.toLowerCase() &&
          m.id !== this.currentEditingId
      );

      if (existingMapping) {
        throw new Error("A mapping for this JIRA URL already exists");
      }

      let success;
      if (this.currentEditingId) {
        // Update existing mapping
        success = await Storage.updateJiraProjectMapping(
          this.currentEditingId,
          formData
        );
      } else {
        // Add new mapping
        success = await Storage.addJiraProjectMapping(formData);
      }

      if (success) {
        const action = this.currentEditingId ? "updated" : "added";
        NotificationManager.success(
          `✅ JIRA project mapping ${action} successfully!`
        );
        await this.loadMappings(); // Refresh the table
        this.closeModal();
      } else {
        throw new Error("Failed to save mapping");
      }
    } catch (error) {
      console.error("Error saving JIRA mapping:", error);
      NotificationManager.error(`❌ Error saving mapping: ${error.message}`);
    }
  }

  /**
   * Delete mapping
   */
  async deleteMapping(id) {
    const mapping = this.mappings.find((m) => m.id === id);
    if (!mapping) return;

    const confirmed = confirm(
      `Are you sure you want to delete the mapping for "${mapping.jiraUrl}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const success = await Storage.removeJiraProjectMapping(id);
      if (success) {
        NotificationManager.success(
          "✅ JIRA project mapping deleted successfully!"
        );
        await this.loadMappings(); // Refresh the table
      } else {
        throw new Error("Failed to delete mapping");
      }
    } catch (error) {
      console.error("Error deleting JIRA mapping:", error);
      NotificationManager.error(`❌ Error deleting mapping: ${error.message}`);
    }
  }

  /**
   * Get all mappings
   */
  getMappings() {
    return this.mappings;
  }

  /**
   * Find Redmine project ID by JIRA URL
   */
  async findRedmineProjectByJiraUrl(jiraUrl) {
    return await Storage.findRedmineProjectByJiraUrl(jiraUrl);
  }
}

export default JiraProjectMappingsManager;
