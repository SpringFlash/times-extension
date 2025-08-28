import { CONFIG } from "../utils/constants.js";
import { sanitizeUrl, isValidApiResponse } from "../utils/validation.js";

/**
 * Base Tempo API request
 * @param {string} url - API endpoint URL
 * @param {Object} settings - Tempo settings
 * @param {Object} options - Request options
 * @returns {Promise<any>} Promise that resolves with API response
 */
async function makeTempoRequest(url, settings, options = {}) {
  const { method = "GET", body = null, headers = {} } = options;

  const requestHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${settings.apiToken}`,
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
    console.error("Tempo API request failed:", error);
    throw error;
  }
}

/**
 * Test Tempo connection
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with connection test result
 */
export async function testConnection(settings) {
  try {
    // Test connection by getting a small number of worklogs
    const url = "https://api.tempo.io/4/worklogs?limit=1";
    const data = await makeTempoRequest(url, settings);

    return {
      success: true,
      message: "Connection successful",
      totalWorklogs: data.metadata?.count || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get current user info from Tempo
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with user info
 */
export async function getCurrentUser(settings) {
  const url = "https://api.tempo.io/4/user";
  return makeTempoRequest(url, settings);
}

/**
 * Get worklogs for a specific date range
 * @param {string} dateFrom - Start date (YYYY-MM-DD)
 * @param {string} dateTo - End date (YYYY-MM-DD)
 * @param {Object} settings - Tempo settings
 * @param {string} worker - Optional worker account ID
 * @returns {Promise<Object>} Promise that resolves with worklogs
 */
export async function getWorklogs(dateFrom, dateTo, settings, worker = null) {
  try {
    let url = `https://api.tempo.io/4/worklogs?from=${dateFrom}&to=${dateTo}`;

    if (worker) {
      url += `&worker=${worker}`;
    }

    const data = await makeTempoRequest(url, settings);

    return {
      success: true,
      worklogs: data.results || data,
      total: data.metadata?.count || (data.results ? data.results.length : 0),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get worklogs for a specific month
 * @param {number} year - Year (e.g., 2024)
 * @param {number} month - Month (1-12)
 * @param {Object} settings - Tempo settings
 * @param {string} worker - Optional worker account ID
 * @returns {Promise<Object>} Promise that resolves with monthly worklogs
 */
export async function getWorklogsForMonth(
  year,
  month,
  settings,
  worker = null
) {
  try {
    // Calculate first and last day of month
    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, "0")}-${lastDay
      .toString()
      .padStart(2, "0")}`;

    console.log(`🕐 Tempo: Fetching worklogs for ${startDate} to ${endDate}`);

    const result = await getWorklogs(startDate, endDate, settings, worker);

    if (result.success) {
      // Group worklogs by date for easier processing
      const worklogsByDate = {};
      let totalHours = 0;

      result.worklogs.forEach((worklog) => {
        const date = worklog.startDate;
        if (!worklogsByDate[date]) {
          worklogsByDate[date] = [];
        }
        worklogsByDate[date].push(worklog);
        totalHours += worklog.timeSpentSeconds / 3600; // Convert seconds to hours
      });

      return {
        success: true,
        worklogs: result.worklogs,
        worklogsByDate,
        totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
        period: {
          year,
          month,
          startDate,
          endDate,
        },
        total: result.total,
      };
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get worklogs for current user for a specific month
 * @param {number} year - Year (e.g., 2024)
 * @param {number} month - Month (1-12)
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with current user's monthly worklogs
 */
export async function getCurrentUserWorklogsForMonth(year, month, settings) {
  try {
    // Get all worklogs for the month (API returns only user's own worklogs by default)
    return await getWorklogsForMonth(year, month, settings);
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a new worklog entry
 * @param {Object} worklogData - Worklog data
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with created worklog
 */
export async function createWorklog(worklogData, settings) {
  try {
    const url = "https://api.tempo.io/4/worklogs";

    const payload = {
      issueKey: worklogData.issueKey,
      timeSpentSeconds: worklogData.timeSpentSeconds,
      startDate: worklogData.startDate,
      startTime: worklogData.startTime || "09:00:00",
      description: worklogData.description || "",
      authorAccountId: worklogData.authorAccountId,
    };

    // Add attributes if provided
    if (worklogData.attributes) {
      payload.attributes = worklogData.attributes;
    }

    const result = await makeTempoRequest(url, settings, {
      method: "POST",
      body: payload,
    });

    return {
      success: true,
      worklog: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update an existing worklog entry
 * @param {string} worklogId - Worklog ID
 * @param {Object} worklogData - Updated worklog data
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with updated worklog
 */
export async function updateWorklog(worklogId, worklogData, settings) {
  try {
    const url = `https://api.tempo.io/4/worklogs/${worklogId}`;

    const payload = {
      issueKey: worklogData.issueKey,
      timeSpentSeconds: worklogData.timeSpentSeconds,
      startDate: worklogData.startDate,
      startTime: worklogData.startTime || "09:00:00",
      description: worklogData.description || "",
    };

    // Add attributes if provided
    if (worklogData.attributes) {
      payload.attributes = worklogData.attributes;
    }

    const result = await makeTempoRequest(url, settings, {
      method: "PUT",
      body: payload,
    });

    return {
      success: true,
      worklog: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Delete a worklog entry
 * @param {string} worklogId - Worklog ID
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with deletion result
 */
export async function deleteWorklog(worklogId, settings) {
  try {
    const url = `https://api.tempo.io/4/worklogs/${worklogId}`;

    await makeTempoRequest(url, settings, {
      method: "DELETE",
    });

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get worklog by ID
 * @param {string} worklogId - Worklog ID
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with worklog details
 */
export async function getWorklog(worklogId, settings) {
  try {
    const url = `https://api.tempo.io/4/worklogs/${worklogId}`;

    const worklog = await makeTempoRequest(url, settings);

    return {
      success: true,
      worklog,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get work attributes (custom fields)
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with work attributes
 */
export async function getWorkAttributes(settings) {
  try {
    const url = "https://api.tempo.io/4/work-attributes";

    const attributes = await makeTempoRequest(url, settings);

    return {
      success: true,
      attributes: attributes.results || attributes,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Convert time entries from other systems to Tempo format
 * @param {Array} timeEntries - Array of time entries
 * @param {Object} settings - Tempo settings
 * @returns {Promise<Object>} Promise that resolves with converted entries
 */
export async function convertTimeEntriesToTempo(timeEntries, settings) {
  try {
    const convertedEntries = [];

    for (const entry of timeEntries) {
      const tempoEntry = {
        issueKey: entry.issueKey || entry.taskId,
        timeSpentSeconds: Math.round((entry.hours || entry.time) * 3600), // Convert hours to seconds
        startDate: entry.date,
        startTime: entry.startTime || "09:00:00",
        description: entry.comment || entry.description || "",
        authorAccountId: entry.authorAccountId,
      };

      // Add attributes if available
      if (entry.attributes) {
        tempoEntry.attributes = entry.attributes;
      }

      convertedEntries.push(tempoEntry);
    }

    return {
      success: true,
      entries: convertedEntries,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Batch create multiple worklog entries
 * @param {Array} worklogEntries - Array of worklog objects
 * @param {Object} settings - Tempo settings
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} Promise that resolves with batch operation results
 */
export async function batchCreateWorklogs(
  worklogEntries,
  settings,
  progressCallback = null
) {
  const results = {
    total: worklogEntries.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < worklogEntries.length; i++) {
    const entry = worklogEntries[i];

    try {
      const result = await createWorklog(entry, settings);

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
      progressCallback(i + 1, worklogEntries.length, results);
    }

    // Small delay to avoid overwhelming the server
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    success: true,
    result: results,
  };
}

/**
 * Export worklogs to different formats
 * @param {Array} worklogs - Array of worklog objects
 * @param {string} format - Export format ('csv', 'json')
 * @returns {Promise<Object>} Promise that resolves with exported data
 */
export async function exportWorklogs(worklogs, format = "json") {
  try {
    if (format === "csv") {
      // Convert to CSV format
      const headers = ["Date", "Issue Key", "Hours", "Description", "Author"];
      const csvRows = [headers.join(",")];

      worklogs.forEach((worklog) => {
        const row = [
          worklog.startDate,
          worklog.issue?.key || worklog.issue?.id || "N/A",
          (worklog.timeSpentSeconds / 3600).toFixed(2),
          `"${(worklog.description || "").replace(/"/g, '""')}"`, // Escape quotes
          worklog.author?.displayName || worklog.author?.accountId || "N/A",
        ];
        csvRows.push(row.join(","));
      });

      return {
        success: true,
        data: csvRows.join("\n"),
        format: "csv",
      };
    } else {
      // Default to JSON format
      return {
        success: true,
        data: JSON.stringify(worklogs, null, 2),
        format: "json",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
