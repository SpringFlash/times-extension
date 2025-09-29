import TimeComparisonUtils from "../utils/TimeComparisonUtils.js";
import NotificationManager from "./NotificationManager.js";

/**
 * Manages time comparison functionality in the options page
 */
export class TimeComparisonManager {
  constructor(
    redmineSettingsManager,
    tempoSettingsManager,
    jiraSettingsManager
  ) {
    this.elements = {};
    this.redmineManager = redmineSettingsManager;
    this.tempoManager = tempoSettingsManager;
    this.jiraManager = jiraSettingsManager;
    this.lastComparisonResult = null;
  }

  /**
   * Initialize time comparison manager
   */
  init() {
    this.bindElements();
    this.attachEventListeners();
  }

  /**
   * Bind DOM elements
   */
  bindElements() {
    // Main comparison section
    this.elements.comparisonSection = document.getElementById(
      "timeComparisonSection"
    );
    this.elements.compareButton = document.getElementById("compareTimeEntries");
    this.elements.monthSelect = document.getElementById("comparisonMonth");
    this.elements.yearSelect = document.getElementById("comparisonYear");
    this.elements.enhancedComparison = document.getElementById(
      "enableEnhancedComparison"
    );

    // Results section
    this.elements.resultsContainer =
      document.getElementById("comparisonResults");
    this.elements.summaryContainer =
      document.getElementById("comparisonSummary");
    this.elements.missingContainer = document.getElementById("missingEntries");
    this.elements.discrepanciesContainer =
      document.getElementById("discrepancies");
    this.elements.dateComparisonContainer =
      document.getElementById("dateComparison");

    // Action buttons
    this.elements.exportMissingButton = document.getElementById(
      "exportMissingEntries"
    );
    this.elements.createRedmineEntriesButton = document.getElementById(
      "createRedmineEntries"
    );
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    this.elements.compareButton?.addEventListener("click", () =>
      this.performComparison()
    );
    this.elements.exportMissingButton?.addEventListener("click", () =>
      this.exportMissingEntries()
    );
    this.elements.createRedmineEntriesButton?.addEventListener("click", () =>
      this.createMissingEntries()
    );

    // Initialize month/year selectors
    this.initializeDateSelectors();
  }

  /**
   * Initialize month and year selectors
   */
  initializeDateSelectors() {
    const now = new Date();

    // Populate year selector
    if (this.elements.yearSelect) {
      const currentYear = now.getFullYear();
      for (let year = currentYear - 2; year <= currentYear + 1; year++) {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        this.elements.yearSelect.appendChild(option);
      }
    }

    // Populate month selector
    if (this.elements.monthSelect) {
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      months.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = index + 1;
        option.textContent = month;
        if (index === now.getMonth()) option.selected = true;
        this.elements.monthSelect.appendChild(option);
      });
    }
  }

  /**
   * Perform time entries comparison
   */
  async performComparison() {
    const button = this.elements.compareButton;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Comparing...";
    button.disabled = true;

    try {
      // Get settings
      const redmineSettings = this.redmineManager.getSettings();
      const tempoSettings = this.tempoManager.getSettings();

      if (!redmineSettings?.url || !redmineSettings?.apiKey) {
        throw new Error("Please configure Redmine settings first");
      }

      if (!tempoSettings?.apiToken) {
        throw new Error("Please configure Tempo settings first");
      }

      // Get selected period
      const year =
        parseInt(this.elements.yearSelect?.value) || new Date().getFullYear();
      const month =
        parseInt(this.elements.monthSelect?.value) || new Date().getMonth() + 1;

      console.log(
        `🔍 Comparing time entries for ${year}-${month
          .toString()
          .padStart(2, "0")}`
      );

      // Check if enhanced comparison is enabled
      const enhancedEnabled =
        this.elements.enhancedComparison?.checked || false;
      const jiraSettings = this.jiraManager?.getSettings();
      const jiraEnabled = this.jiraManager?.isEnabled() || false;

      let result;

      // Perform comparison (pass Jira settings if enhanced mode is enabled)
      const jiraSettingsToUse =
        enhancedEnabled && jiraEnabled ? jiraSettings : null;

      if (jiraSettingsToUse) {
        button.textContent = "🔄 Enhanced Comparing...";
      }

      result = await TimeComparisonUtils.compareMonthlyEntries(
        year,
        month,
        tempoSettings,
        redmineSettings,
        jiraSettingsToUse
      );

      console.log({ result });

      if (result.success) {
        this.lastComparisonResult = result;
        this.displayResults(result);

        // Always use enriched format
        const summary = result.comparison.summary;

        let message = `✅ Comparison completed! ${
          summary.missing.entries || 0
        } entries missing in Redmine`;

        if (summary.missing.hours) {
          message += ` (${summary.missing.hours.toFixed(2)}h)`;
        }

        // Always show mapping stats if available
        if (result.mappingStats) {
          const mappingRate = (result.mappingStats.mappingRate * 100).toFixed(
            1
          );
          message += `\n🔗 Task mapping: ${result.mappingStats.entriesWithLinkedRedmine}/${result.mappingStats.entriesWithJiraIssues} Jira tasks mapped (${mappingRate}%)`;
        }

        NotificationManager.success(message);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Comparison failed:", error);
      NotificationManager.error(`❌ Comparison failed: ${error.message}`);
      this.clearResults();
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Display comparison results
   */
  displayResults(result) {
    if (!this.elements.resultsContainer) return;

    // Show results container
    this.elements.resultsContainer.style.display = "block";

    // Always use enriched display (enrichedData is always present, even if empty)
    const formatted = TimeComparisonUtils.formatResults(result);
    this.displaySummary(formatted);

    // Display missing entries with enriched data
    const missingEntries = result.comparison.missingInRedmine || [];
    this.displayMissingEntries(missingEntries, true); // Always pass true for enriched mode

    // Display discrepancies
    this.displayDiscrepancies(result.comparison.discrepancies || []);

    // Display date comparison
    this.displayDateComparison(result.comparison.byDate);

    // Enable action buttons
    this.updateActionButtons(result.comparison.missingInRedmine.length > 0);
  }

  /**
   * Display summary information
   */
  displaySummary(formatted) {
    if (!this.elements.summaryContainer) return;

    const summary = formatted.formatted.summary;

    this.elements.summaryContainer.innerHTML = `
      <div class="comparison-summary">
        <h3>📊 Comparison Summary</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Overview</div>
            <div class="summary-value">${summary.overview}</div>
          </div>
          <div class="summary-item ${
            formatted.comparison.summary.missing.entries > 0
              ? "warning"
              : "success"
          }">
            <div class="summary-label">Missing in Redmine</div>
            <div class="summary-value">${summary.missing}</div>
          </div>
          <div class="summary-item success">
            <div class="summary-label">Matched Entries</div>
            <div class="summary-value">${summary.matched}</div>
          </div>
          <div class="summary-item ${
            Math.abs(formatted.comparison.summary.hoursDifference) > 1
              ? "warning"
              : "info"
          }">
            <div class="summary-label">Hours Difference</div>
            <div class="summary-value">${summary.hoursDifference}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Display missing entries
   */
  displayMissingEntries(missingEntries, isEnhanced = false) {
    if (!this.elements.missingContainer) return;

    if (missingEntries.length === 0) {
      this.elements.missingContainer.innerHTML = `
        <div class="no-missing-entries">
          <h3>✅ No Missing Entries</h3>
          <p>All Tempo entries are present in Redmine!</p>
        </div>
      `;
      return;
    }

    const entriesHtml = missingEntries
      .map((item, index) => {
        const entry = item.tempoEntry;
        const taskInfo = item.taskMapping;

        // Build suggestions HTML
        const suggestionsHtml =
          item.suggestions?.length > 0
            ? `<div class="suggestions">💡 ${item.suggestions.length} similar entries found</div>`
            : "";

        // Build Jira issue cell
        let issueHtml = "No issue";
        if (isEnhanced && taskInfo) {
          issueHtml = this.buildJiraIssueHtml(taskInfo);
        } else if (entry.issueKey) {
          issueHtml = entry.issueKey;
        }

        // Build Redmine links HTML
        let redmineLinksHtml = "";
        if (isEnhanced && taskInfo?.linkedRedmineIssues?.length > 0) {
          redmineLinksHtml = this.buildRedmineLinksHtml(
            taskInfo.linkedRedmineIssues
          );
        }

        // Build action recommendations
        let actionHtml = `
          <button class="btn-small create-entry-btn" data-index="${index}">
            ➕ Create in Redmine
          </button>
        `;

        if (isEnhanced && taskInfo) {
          actionHtml =
            this.buildEnhancedActionHtml(taskInfo, index) + actionHtml;
        }

        if (isEnhanced) {
          return `
          <tr class="missing-entry" data-index="${index}" data-mapping-status="${
            taskInfo?.mappingStatus || "unknown"
          }">
            <td>${entry.date}</td>
            <td>${entry.hours.toFixed(2)}h</td>
            <td class="description">${
              entry.description || "No description"
            }</td>
            <td class="issue-cell">${issueHtml}</td>
            <td class="redmine-links-cell">${redmineLinksHtml}</td>
            <td class="actions-cell">
              ${suggestionsHtml}
              ${actionHtml}
            </td>
          </tr>
        `;
        } else {
          return `
          <tr class="missing-entry" data-index="${index}">
            <td>${entry.date}</td>
            <td>${entry.hours.toFixed(2)}h</td>
            <td class="description">${
              entry.description || "No description"
            }</td>
            <td class="issue-cell">${issueHtml}</td>
            <td class="actions-cell">
              ${suggestionsHtml}
              ${actionHtml}
            </td>
          </tr>
        `;
        }
      })
      .join("");

    const tableHeaders = isEnhanced
      ? `
        <tr>
          <th>Date</th>
          <th>Hours</th>
          <th>Description</th>
          <th>Jira Issue</th>
          <th>Linked Redmine</th>
          <th>Actions</th>
        </tr>
      `
      : `
        <tr>
          <th>Date</th>
          <th>Hours</th>
          <th>Description</th>
          <th>Issue</th>
          <th>Actions</th>
        </tr>
      `;

    this.elements.missingContainer.innerHTML = `
      <div class="missing-entries">
        <h3>❌ Missing Entries in Redmine (${missingEntries.length})</h3>
        ${
          isEnhanced
            ? '<p class="enhanced-note">🔗 Enhanced view with Jira task mapping</p>'
            : ""
        }
        <table class="missing-entries-table ${
          isEnhanced ? "enhanced-table" : ""
        }">
          <thead>
            ${tableHeaders}
          </thead>
          <tbody>
            ${entriesHtml}
          </tbody>
        </table>
      </div>
    `;

    // Add event listeners for individual create buttons
    this.elements.missingContainer
      .querySelectorAll(".create-entry-btn")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const index = parseInt(e.target.dataset.index);
          this.createSingleEntry(missingEntries[index]);
        });
      });
  }

  /**
   * Build Jira issue HTML with link
   */
  buildJiraIssueHtml(taskInfo) {
    if (!taskInfo.jiraCode) {
      return '<span class="no-issue">No issue</span>';
    }

    const jiraKey = taskInfo.jiraCode;

    if (!jiraKey) {
      if (taskInfo.mappingStatus === "jira_id_unresolved") {
        return `<span class="unresolved-issue" title="Jira ID ${taskInfo.originalId} could not be resolved">ID: ${taskInfo.originalId} ❌</span>`;
      }
      return '<span class="no-issue">No issue</span>';
    }

    // Try to get Jira URL from settings or from the issue itself
    let jiraBaseUrl = null;

    // First try to get from settings
    const jiraSettings = this.jiraManager?.getSettings();
    if (jiraSettings?.url) {
      jiraBaseUrl = jiraSettings.url.replace(/\/$/, "");
    }

    // If no settings, try to extract from issue data (if available)
    if (!jiraBaseUrl && taskInfo.jiraIssue?.self) {
      // Extract base URL from self link: https://company.atlassian.net/rest/api/3/issue/12345
      const selfUrl = taskInfo.jiraIssue.self;
      const match = selfUrl.match(/^(https?:\/\/[^\/]+)/);
      if (match) {
        jiraBaseUrl = match[1];
      }
    }

    // Build Jira URL if we have base URL
    if (jiraBaseUrl) {
      const jiraUrl = `${jiraBaseUrl}/browse/${jiraKey}`;
      const issueTitle = taskInfo.jiraIssue?.summary || jiraKey;

      return `
        <a href="${jiraUrl}" target="_blank" class="jira-link" title="${issueTitle}">
          ${jiraKey}
        </a>
        ${
          taskInfo.jiraIssue
            ? `<div class="issue-title">${taskInfo.jiraIssue.summary}</div>`
            : ""
        }
      `;
    }

    // Fallback without link
    return `<span class="jira-key">${jiraKey}</span>`;
  }

  /**
   * Build Redmine links HTML
   */
  buildRedmineLinksHtml(linkedRedmineIssues) {
    if (!linkedRedmineIssues || linkedRedmineIssues.length === 0) {
      return '<span class="no-links">No linked issues</span>';
    }

    const redmineSettings = this.redmineManager?.getSettings();
    const redmineBaseUrl = redmineSettings?.url?.replace(/\/$/, "");

    return linkedRedmineIssues
      .map((issue) => {
        if (redmineBaseUrl) {
          const redmineUrl = `${redmineBaseUrl}/issues/${issue.id}`;
          return `
          <a href="${redmineUrl}" target="_blank" class="redmine-link" title="${issue.subject}">
            #${issue.id}
          </a>
        `;
        } else {
          return `<span class="redmine-id">#${issue.id}</span>`;
        }
      })
      .join(" ");
  }

  /**
   * Build enhanced action HTML with recommendations
   */
  buildEnhancedActionHtml(taskInfo, index) {
    const mappingStatus = taskInfo.mappingStatus;
    let recommendationHtml = "";

    switch (mappingStatus) {
      case "single_link":
        const redmineIssue = taskInfo.linkedRedmineIssues[0];
        recommendationHtml = `
          <div class="recommendation success">
            ✅ Create on #${redmineIssue.id}
          </div>
        `;
        break;

      case "multiple_links":
        recommendationHtml = `
          <div class="recommendation warning">
            ⚠️ ${taskInfo.linkCount} options available
          </div>
        `;
        break;

      case "no_redmine_link":
        recommendationHtml = `
          <div class="recommendation info">
            💡 Create new Redmine issue
          </div>
        `;
        break;

      case "jira_id_unresolved":
        recommendationHtml = `
          <div class="recommendation error">
            ❌ Check Jira connectivity
          </div>
        `;
        break;

      case "no_jira_task":
        recommendationHtml = `
          <div class="recommendation neutral">
            📝 Create in default project
          </div>
        `;
        break;

      case "error":
        recommendationHtml = `
          <div class="recommendation error">
            ❌ ${taskInfo.error}
          </div>
        `;
        break;
    }

    return recommendationHtml;
  }

  /**
   * Display discrepancies
   */
  displayDiscrepancies(discrepancies) {
    if (!this.elements.discrepanciesContainer) return;

    if (discrepancies.length === 0) {
      this.elements.discrepanciesContainer.innerHTML = `
        <div class="no-discrepancies">
          <h3>✅ No Discrepancies Found</h3>
          <p>All matched entries are consistent between Tempo and Redmine.</p>
        </div>
      `;
      return;
    }

    const discrepanciesHtml = discrepancies
      .map((item, index) => {
        const differencesHtml = item.differences
          .map((diff) => {
            return `<li><strong>${diff.field}:</strong> Tempo(${diff.tempo}) vs Redmine(${diff.redmine})</li>`;
          })
          .join("");

        return `
        <div class="discrepancy-item">
          <div class="discrepancy-header">
            <strong>${
              item.tempoEntry.date
            }</strong> - ${item.tempoEntry.hours.toFixed(2)}h
          </div>
          <div class="discrepancy-description">${
            item.tempoEntry.description
          }</div>
          <ul class="differences-list">
            ${differencesHtml}
          </ul>
        </div>
      `;
      })
      .join("");

    this.elements.discrepanciesContainer.innerHTML = `
      <div class="discrepancies">
        <h3>⚠️ Discrepancies (${discrepancies.length})</h3>
        <div class="discrepancies-list">
          ${discrepanciesHtml}
        </div>
      </div>
    `;
  }

  /**
   * Display date-by-date comparison
   */
  displayDateComparison(byDate) {
    if (!this.elements.dateComparisonContainer) return;

    const dates = Object.keys(byDate).sort();

    const dateRows = dates
      .map((date) => {
        const comparison = byDate[date];
        const statusIcon = this.getStatusIcon(comparison.status);
        const statusClass = this.getStatusClass(comparison.status);

        return `
        <tr class="date-row ${statusClass}">
          <td>${date}</td>
          <td>${statusIcon}</td>
          <td>${comparison.tempo.entries} (${comparison.tempo.hours.toFixed(
          1
        )}h)</td>
          <td>${comparison.redmine.entries} (${comparison.redmine.hours.toFixed(
          1
        )}h)</td>
          <td class="${
            comparison.difference.hours > 0
              ? "positive"
              : comparison.difference.hours < 0
              ? "negative"
              : "neutral"
          }">
            ${
              comparison.difference.hours > 0 ? "+" : ""
            }${comparison.difference.hours.toFixed(1)}h
          </td>
        </tr>
      `;
      })
      .join("");

    this.elements.dateComparisonContainer.innerHTML = `
      <div class="date-comparison">
        <h3>📅 Date-by-Date Comparison</h3>
        <table class="date-comparison-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Tempo</th>
              <th>Redmine</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            ${dateRows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Get status icon for date comparison
   */
  getStatusIcon(status) {
    const icons = {
      matched: "✅",
      minor_difference: "⚠️",
      major_difference: "❌",
      missing_in_redmine: "🔴",
      extra_in_redmine: "🔵",
      no_entries: "⚪",
    };
    return icons[status] || "❓";
  }

  /**
   * Get CSS class for status
   */
  getStatusClass(status) {
    const classes = {
      matched: "status-matched",
      minor_difference: "status-warning",
      major_difference: "status-error",
      missing_in_redmine: "status-error",
      extra_in_redmine: "status-info",
      no_entries: "status-neutral",
    };
    return classes[status] || "status-unknown";
  }

  /**
   * Update action buttons state
   */
  updateActionButtons(hasMissingEntries) {
    if (this.elements.exportMissingButton) {
      this.elements.exportMissingButton.disabled = !hasMissingEntries;
    }
    if (this.elements.createRedmineEntriesButton) {
      this.elements.createRedmineEntriesButton.disabled = !hasMissingEntries;
    }
  }

  /**
   * Export missing entries to CSV
   */
  async exportMissingEntries() {
    if (!this.lastComparisonResult?.comparison.missingInRedmine) {
      NotificationManager.error("No missing entries to export");
      return;
    }

    try {
      const missing = this.lastComparisonResult.comparison.missingInRedmine;
      const period = this.lastComparisonResult.period;

      // Create CSV content
      const headers = ["Date", "Hours", "Description", "Issue Key", "Issue ID"];
      const rows = missing.map((item) => {
        const entry = item.tempoEntry;
        return [
          entry.date,
          entry.hours.toFixed(2),
          `"${(entry.description || "").replace(/"/g, '""')}"`, // Escape quotes
          entry.issueKey || "",
          entry.issueId || "",
        ];
      });

      const csvContent = [headers, ...rows]
        .map((row) => row.join(","))
        .join("\n");

      // Create download
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `missing-tempo-entries-${period.year}-${period.month
        .toString()
        .padStart(2, "0")}.csv`;
      a.click();

      URL.revokeObjectURL(url);

      NotificationManager.success(
        `✅ Exported ${missing.length} missing entries to CSV`
      );
    } catch (error) {
      console.error("Export failed:", error);
      NotificationManager.error(`❌ Export failed: ${error.message}`);
    }
  }

  /**
   * Create missing entries in Redmine (bulk)
   */
  async createMissingEntries() {
    if (!this.lastComparisonResult?.comparison.missingInRedmine) {
      NotificationManager.error("No missing entries to create");
      return;
    }

    const missing = this.lastComparisonResult.comparison.missingInRedmine;
    const confirmed = confirm(
      `Create ${missing.length} missing time entries in Redmine?\n\nThis will add all missing Tempo entries to Redmine.`
    );

    if (!confirmed) return;

    NotificationManager.info(
      `🔄 Creating ${missing.length} entries in Redmine...`
    );

    // TODO: Implement bulk creation logic
    // This would require extending the Redmine API to support bulk time entry creation

    NotificationManager.warning(
      "⚠️ Bulk creation not yet implemented. Use individual 'Create in Redmine' buttons for now."
    );
  }

  /**
   * Create single entry in Redmine
   */
  async createSingleEntry(missingItem) {
    const entry = missingItem.tempoEntry;

    NotificationManager.info(`🔄 Creating entry for ${entry.date}...`);

    // TODO: Implement single entry creation
    // This would call the Redmine API to create a time entry

    NotificationManager.warning(
      "⚠️ Entry creation not yet implemented. This feature requires Redmine API integration."
    );
  }

  /**
   * Clear results display
   */
  clearResults() {
    if (this.elements.resultsContainer) {
      this.elements.resultsContainer.style.display = "none";
    }

    [
      this.elements.summaryContainer,
      this.elements.missingContainer,
      this.elements.discrepanciesContainer,
      this.elements.dateComparisonContainer,
    ].forEach((container) => {
      if (container) container.innerHTML = "";
    });

    this.updateActionButtons(false);
    this.lastComparisonResult = null;
  }

  /**
   * Get last comparison result
   */
  getLastResult() {
    return this.lastComparisonResult;
  }
}

export default TimeComparisonManager;
