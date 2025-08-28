import { CONFIG } from "../utils/constants.js";
import { sanitizeUrl, isValidApiResponse } from "../utils/validation.js";

/**
 * Base Redmine API request
 * @param {string} url - API endpoint URL
 * @param {Object} settings - Redmine settings
 * @param {Object} options - Request options
 * @returns {Promise<any>} Promise that resolves with API response
 */
async function makeRedmineRequest(url, settings, options = {}) {
  const { method = "GET", body = null, headers = {} } = options;

  const requestHeaders = {
    "Content-Type": "application/json",
    "X-Redmine-API-Key": settings.apiKey,
    ...headers,
  };

  const requestOptions = {
    method,
    headers: requestHeaders,
  };

  if (body) {
    requestOptions.body =
      typeof body === "string" ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    console.error("Redmine API request failed:", error);
    throw error;
  }
}

/**
 * Get current user info
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with user info
 */
export async function getCurrentUser(settings) {
  const url = `${sanitizeUrl(settings.url)}/users/current.json`;
  return makeRedmineRequest(url, settings);
}

/**
 * Test Redmine connection
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with connection test result
 */
export async function testConnection(settings) {
  try {
    const userData = await getCurrentUser(settings);
    return {
      success: true,
      user: userData.user,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fetch all projects with pagination
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with projects list
 */
export async function fetchProjects(settings) {
  try {
    let allProjects = [];
    let offset = 0;
    const limit = CONFIG.REDMINE.PAGINATION_LIMIT;
    let hasMore = true;

    while (hasMore) {
      const url = `${sanitizeUrl(
        settings.url
      )}/projects.json?limit=${limit}&offset=${offset}`;
      const data = await makeRedmineRequest(url, settings);

      if (data.projects && data.projects.length > 0) {
        allProjects = allProjects.concat(data.projects);
        offset += limit;
        hasMore = data.projects.length === limit;
      } else {
        hasMore = false;
      }
    }

    // Sort projects by name for better UX
    allProjects.sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      projects: allProjects,
      total: allProjects.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Search for issues in Redmine
 * @param {string} searchQuery - Search query
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with search results
 */
export async function searchIssues(searchQuery, settings) {
  try {
    // First, try to search by subject
    let url = `${sanitizeUrl(
      settings.url
    )}/issues.json?subject=~${encodeURIComponent(searchQuery)}&limit=10`;
    let data = await makeRedmineRequest(url, settings);

    if (data.issues && data.issues.length > 0) {
      return {
        success: true,
        issues: data.issues,
        total: data.total_count || 0,
        searchType: "subject",
      };
    }

    // If no results found by subject, try searching by description
    const taskNumberMatch = searchQuery.match(/^([A-Z]+-\d+)/);
    if (taskNumberMatch) {
      const taskNumber = taskNumberMatch[1];
      url = `${sanitizeUrl(
        settings.url
      )}/issues.json?description=~${encodeURIComponent(taskNumber)}&limit=10`;
      data = await makeRedmineRequest(url, settings);

      if (data.issues && data.issues.length > 0) {
        return {
          success: true,
          issues: data.issues,
          total: data.total_count || 0,
          searchType: "description",
        };
      }
    }

    // No results found
    return {
      success: true,
      issues: [],
      total: 0,
      searchType: "none",
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create new issue in Redmine
 * @param {Object} issueData - Issue data
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with created issue
 */
export async function createIssue(issueData, settings) {
  try {
    // Get current user info to assign the task
    const userData = await getCurrentUser(settings);
    const currentUserId = userData.user.id;

    // Map Jira priority to Redmine priority
    let priorityId = CONFIG.REDMINE.DEFAULT_PRIORITY_ID; // Default to Medium
    if (issueData.jiraPriority) {
      priorityId =
        CONFIG.PRIORITY_MAP[issueData.jiraPriority] ||
        CONFIG.REDMINE.DEFAULT_PRIORITY_ID;
    }

    // Map Jira status to Redmine status
    let statusId = CONFIG.REDMINE.DEFAULT_STATUS_ID; // Default to New
    if (issueData.jiraStatus) {
      const statusMap = {
        "To Do": 1, // New
        "In Progress": 2, // In Progress
        Done: 3, // Resolved
        Closed: 5, // Closed
        Open: 1, // New
        Resolved: 3, // Resolved
        Reopened: 2, // In Progress
      };
      statusId =
        statusMap[issueData.jiraStatus] || CONFIG.REDMINE.DEFAULT_STATUS_ID;
    }

    console.log("🎫 Redmine: Issue data:", issueData);
    console.log(
      "🎫 Redmine: Mapped priority:",
      priorityId,
      "status:",
      statusId
    );
    console.log("🎫 Redmine: Current user ID:", currentUserId);

    const url = `${sanitizeUrl(settings.url)}/issues.json`;
    const payload = {
      issue: {
        project_id: parseInt(issueData.projectId),
        subject: issueData.subject,
        description: issueData.description || "",
        tracker_id: CONFIG.REDMINE.DEFAULT_TRACKER_ID,
        status_id: statusId,
        priority_id: priorityId,
        assigned_to_id: currentUserId,
      },
    };

    console.log("🎫 Redmine: Final payload:", JSON.stringify(payload, null, 2));

    const result = await makeRedmineRequest(url, settings, {
      method: "POST",
      body: payload,
    });

    return {
      success: true,
      issue: result.issue,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create time entry in Redmine
 * @param {Object} timeEntryData - Time entry data
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with created time entry
 */
export async function createTimeEntry(timeEntryData, settings) {
  try {
    const url = `${sanitizeUrl(settings.url)}/time_entries.json`;

    const activityId = timeEntryData.isResearch
      ? settings.researchActivityId ||
        CONFIG.REDMINE.DEFAULT_RESEARCH_ACTIVITY_ID
      : settings.activityId || CONFIG.REDMINE.DEFAULT_ACTIVITY_ID;

    const payload = {
      time_entry: {
        spent_on: timeEntryData.date,
        hours: timeEntryData.time,
        comments: timeEntryData.comment || "",
        activity_id: parseInt(activityId),
      },
    };

    // Either use issue_id or project_id, but not both
    if (timeEntryData.task && timeEntryData.task.trim()) {
      payload.time_entry.issue_id = parseInt(timeEntryData.task);
    } else {
      let projectId = null;

      if (timeEntryData.projectId) {
        projectId = parseInt(timeEntryData.projectId);
      } else if (settings.projectId) {
        projectId = parseInt(settings.projectId);
      }

      if (!projectId) {
        throw new Error(CONFIG.ERRORS.TASK_OR_PROJECT_REQUIRED);
      }

      payload.time_entry.project_id = projectId;
    }

    const result = await makeRedmineRequest(url, settings, {
      method: "POST",
      body: payload,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fetch time entries from Redmine for a specific date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with time entries
 */
export async function fetchTimeEntries(startDate, endDate, settings) {
  try {
    // Get current user info first
    const userData = await getCurrentUser(settings);
    const currentUserId = userData.user.id;

    // Fetch time entries for the current user within the date range
    let allTimeEntries = [];
    let offset = 0;
    const limit = CONFIG.REDMINE.PAGINATION_LIMIT;
    let hasMore = true;

    while (hasMore) {
      const url = `${sanitizeUrl(
        settings.url
      )}/time_entries.json?user_id=${currentUserId}&from=${startDate}&to=${endDate}&limit=${limit}&offset=${offset}`;
      const data = await makeRedmineRequest(url, settings);

      if (data.time_entries && data.time_entries.length > 0) {
        allTimeEntries = allTimeEntries.concat(data.time_entries);
        offset += limit;
        hasMore = data.time_entries.length === limit;
      } else {
        hasMore = false;
      }
    }

    return {
      success: true,
      timeEntries: allTimeEntries,
      total: allTimeEntries.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get issue details by ID
 * @param {number} issueId - Issue ID
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with issue details
 */
export async function getIssue(issueId, settings) {
  try {
    const url = `${sanitizeUrl(settings.url)}/issues/${issueId}.json`;
    const data = await makeRedmineRequest(url, settings);

    return {
      success: true,
      issue: data.issue,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get project details by ID
 * @param {number} projectId - Project ID
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with project details
 */
export async function getProject(projectId, settings) {
  try {
    const url = `${sanitizeUrl(settings.url)}/projects/${projectId}.json`;
    const data = await makeRedmineRequest(url, settings);

    return {
      success: true,
      project: data.project,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fetch trackers (issue types) available in Redmine
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with trackers list
 */
export async function fetchTrackers(settings) {
  try {
    const url = `${sanitizeUrl(settings.url)}/trackers.json`;
    const data = await makeRedmineRequest(url, settings);

    return {
      success: true,
      trackers: data.trackers || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Fetch activities available for time tracking
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with activities list
 */
export async function fetchActivities(settings) {
  try {
    const url = `${sanitizeUrl(
      settings.url
    )}/enumerations/time_entry_activities.json`;
    const data = await makeRedmineRequest(url, settings);

    return {
      success: true,
      activities: data.time_entry_activities || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Sync week data with Redmine
 * @param {Object} weekData - Week data to sync
 * @param {Object} settings - Redmine settings
 * @returns {Promise<Object>} Promise that resolves with sync results
 */
export async function syncWeekData(weekData, settings) {
  try {
    const results = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: [],
    };

    // Get existing time entries from Redmine for the week
    const existingEntriesResult = await fetchTimeEntries(
      weekData.startDate,
      weekData.endDate,
      settings
    );

    if (!existingEntriesResult.success) {
      throw new Error(
        `Failed to fetch existing time entries: ${existingEntriesResult.error}`
      );
    }

    const existingEntries = existingEntriesResult.timeEntries;

    // Process each day's entries
    for (const dayData of weekData.days) {
      for (const entry of dayData.entries) {
        results.processed++;

        // Check if this entry already exists in Redmine
        const existingEntry = existingEntries.find((redmineEntry) => {
          const redmineDate = redmineEntry.spent_on;
          const redmineIssueId = redmineEntry.issue
            ? redmineEntry.issue.id
            : null;
          const redmineProjectId = redmineEntry.project
            ? redmineEntry.project.id
            : null;
          const redmineHours = parseFloat(redmineEntry.hours);
          const redmineComment = redmineEntry.comments || "";

          // Match by date, issue/project, hours, and comment
          const dateMatch = redmineDate === dayData.date;
          const taskMatch =
            (entry.redmineIssueId && redmineIssueId === entry.redmineIssueId) ||
            (entry.redmineProjectId &&
              redmineProjectId === entry.redmineProjectId);
          const hoursMatch = Math.abs(redmineHours - entry.hours) < 0.01; // Allow small floating point differences
          const commentMatch =
            redmineComment.includes(entry.taskNumber) ||
            redmineComment === entry.comment;

          return dateMatch && taskMatch && hoursMatch && commentMatch;
        });

        if (existingEntry) {
          results.skipped++;
          continue;
        }

        // Create new time entry in Redmine
        try {
          const timeEntryData = {
            date: dayData.date,
            time: entry.hours,
            comment: `${entry.taskNumber}: ${entry.comment}`,
            isResearch: false,
          };

          if (entry.redmineIssueId) {
            timeEntryData.task = entry.redmineIssueId.toString();
          } else if (entry.redmineProjectId) {
            timeEntryData.projectId = entry.redmineProjectId;
          }

          const createResult = await createTimeEntry(timeEntryData, settings);

          if (createResult.success) {
            results.created++;
          } else {
            results.errors.push(
              `${dayData.date} - ${entry.taskNumber}: ${createResult.error}`
            );
          }
        } catch (error) {
          results.errors.push(
            `${dayData.date} - ${entry.taskNumber}: ${error.message}`
          );
        }
      }
    }

    return {
      success: true,
      result: results,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Batch create multiple time entries
 * @param {Array} timeEntries - Array of time entry objects
 * @param {Object} settings - Redmine settings
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} Promise that resolves with batch operation results
 */
export async function batchCreateTimeEntries(
  timeEntries,
  settings,
  progressCallback = null
) {
  const results = {
    total: timeEntries.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < timeEntries.length; i++) {
    const entry = timeEntries[i];

    try {
      const result = await createTimeEntry(entry, settings);

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        results.errors.push(`Entry ${i + 1}: ${result.error}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Entry ${i + 1}: ${error.message}`);
    }

    // Call progress callback if provided
    if (progressCallback) {
      progressCallback(i + 1, timeEntries.length, results);
    }

    // Small delay to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    success: true,
    result: results,
  };
}
