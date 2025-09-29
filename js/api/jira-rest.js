import { CONFIG } from "../utils/constants.js";
import { sanitizeUrl, isValidApiResponse } from "../utils/validation.js";

/**
 * Jira REST API client for direct API access
 */

/**
 * Base Jira API request
 * @param {string} url - API endpoint URL
 * @param {Object} settings - Jira settings
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Promise that resolves with API response
 */
async function makeJiraRequest(url, settings, options = {}) {
  try {
    const { method = "GET", body = null, headers = {} } = options;

    // Prepare authentication
    let authHeaders = {};

    if (settings.apiToken && settings.email) {
      // Use API token authentication (recommended)
      const auth = btoa(`${settings.email}:${settings.apiToken}`);
      authHeaders.Authorization = `Basic ${auth}`;
    } else if (settings.username && settings.password) {
      // Use basic authentication (legacy)
      const auth = btoa(`${settings.username}:${settings.password}`);
      authHeaders.Authorization = `Basic ${auth}`;
    } else {
      throw new Error("Missing Jira authentication credentials");
    }

    const requestOptions = {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...authHeaders,
        ...headers,
      },
    };

    if (body && method !== "GET") {
      requestOptions.body = JSON.stringify(body);
    }

    console.log(`🔍 Jira API ${method} ${url}`);
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.errorMessages && errorData.errorMessages.length > 0) {
          errorMessage += ` - ${errorData.errorMessages.join(", ")}`;
        } else if (errorData.message) {
          errorMessage += ` - ${errorData.message}`;
        }
      } catch (e) {
        if (errorText) {
          errorMessage += ` - ${errorText}`;
        }
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!isValidApiResponse(data)) {
      throw new Error("Invalid API response format");
    }

    return data;
  } catch (error) {
    console.error("❌ Jira API request failed:", error);
    throw error;
  }
}

/**
 * Test Jira connection
 * @param {Object} settings - Jira settings
 * @returns {Promise<Object>} Promise that resolves with connection test result
 */
export async function testConnection(settings) {
  try {
    const baseUrl = sanitizeUrl(settings.url);
    const url = `${baseUrl}/rest/api/3/myself`;

    const userData = await makeJiraRequest(url, settings);

    return {
      success: true,
      message: `✅ Connected to Jira as ${userData.displayName} (${userData.emailAddress})`,
      user: userData,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get current user information
 * @param {Object} settings - Jira settings
 * @returns {Promise<Object>} Promise that resolves with user data
 */
export async function getCurrentUser(settings) {
  try {
    const baseUrl = sanitizeUrl(settings.url);
    const url = `${baseUrl}/rest/api/3/myself`;

    const userData = await makeJiraRequest(url, settings);

    return {
      success: true,
      user: userData,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get issue by key or ID
 * @param {string} issueKey - Issue key (e.g., "PROJ-123") or ID
 * @param {Object} settings - Jira settings
 * @param {Array} expand - Optional fields to expand (e.g., ['description', 'comments'])
 * @returns {Promise<Object>} Promise that resolves with issue data
 */
export async function getIssue(issueKey, settings, expand = []) {
  try {
    const baseUrl = sanitizeUrl(settings.url);
    let url = `${baseUrl}/rest/api/3/issue/${issueKey}`;

    if (expand.length > 0) {
      url += `?expand=${expand.join(",")}`;
    }

    const issueData = await makeJiraRequest(url, settings);

    return {
      success: true,
      issue: issueData,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get multiple issues by keys or IDs
 * @param {Array} issueKeys - Array of issue keys or IDs
 * @param {Object} settings - Jira settings
 * @param {Array} expand - Optional fields to expand
 * @returns {Promise<Object>} Promise that resolves with issues data
 */
export async function getIssues(issueKeys, settings, expand = []) {
  try {
    if (!issueKeys || issueKeys.length === 0) {
      return {
        success: true,
        issues: [],
        total: 0,
      };
    }

    const baseUrl = sanitizeUrl(settings.url);

    // Use JQL to get multiple issues
    const jql = `key in (${issueKeys.map((key) => `"${key}"`).join(",")})`;
    let url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}`;

    if (expand.length > 0) {
      url += `&expand=${expand.join(",")}`;
    }

    const searchResult = await makeJiraRequest(url, settings);

    return {
      success: true,
      issues: searchResult.issues || [],
      total: searchResult.total || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Search issues using JQL
 * @param {string} jql - JQL query string
 * @param {Object} settings - Jira settings
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Promise that resolves with search results
 */
export async function searchIssues(jql, settings, options = {}) {
  try {
    const { startAt = 0, maxResults = 50, expand = [], fields = [] } = options;

    const baseUrl = sanitizeUrl(settings.url);
    let url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}`;

    url += `&startAt=${startAt}&maxResults=${maxResults}`;

    if (expand.length > 0) {
      url += `&expand=${expand.join(",")}`;
    }

    if (fields.length > 0) {
      url += `&fields=${fields.join(",")}`;
    }

    const searchResult = await makeJiraRequest(url, settings);

    return {
      success: true,
      issues: searchResult.issues || [],
      total: searchResult.total || 0,
      startAt: searchResult.startAt || 0,
      maxResults: searchResult.maxResults || maxResults,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Search issues with pagination support
 * @param {string} jql - JQL query string
 * @param {Object} settings - Jira settings
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Promise that resolves with all search results
 */
export async function searchAllIssues(jql, settings, options = {}) {
  try {
    const {
      maxResults = 100,
      expand = [],
      fields = [],
      maxTotal = CONFIG.JIRA.MAX_SEARCH_RESULTS || 1000,
    } = options;

    let allIssues = [];
    let startAt = 0;
    let hasMore = true;

    console.log(`🔍 Searching Jira issues with JQL: ${jql}`);

    while (hasMore && allIssues.length < maxTotal) {
      const result = await searchIssues(jql, settings, {
        startAt,
        maxResults,
        expand,
        fields,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      if (result.issues.length > 0) {
        allIssues = allIssues.concat(result.issues);
        startAt += result.issues.length;
        hasMore = result.issues.length === maxResults && startAt < result.total;

        console.log(
          `📊 Fetched ${result.issues.length} issues (total so far: ${allIssues.length}/${result.total})`
        );
      } else {
        hasMore = false;
      }

      // Safety check
      if (startAt > maxTotal) {
        console.warn(
          `⚠️ Reached maximum limit of ${maxTotal} issues, stopping search`
        );
        break;
      }
    }

    console.log(`✅ Fetched ${allIssues.length} total issues from Jira`);

    return {
      success: true,
      issues: allIssues,
      total: allIssues.length,
    };
  } catch (error) {
    console.error("❌ Error searching Jira issues:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get projects accessible to current user
 * @param {Object} settings - Jira settings
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Promise that resolves with projects data
 */
export async function getProjects(settings, options = {}) {
  try {
    const { expand = [], recent = null, properties = [] } = options;

    const baseUrl = sanitizeUrl(settings.url);
    let url = `${baseUrl}/rest/api/3/project/search`;

    const params = new URLSearchParams();

    if (expand.length > 0) {
      params.append("expand", expand.join(","));
    }

    if (recent !== null) {
      params.append("recent", recent.toString());
    }

    if (properties.length > 0) {
      properties.forEach((prop) => params.append("properties", prop));
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const projectsData = await makeJiraRequest(url, settings);

    return {
      success: true,
      projects: projectsData.values || [],
      total: projectsData.total || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get issue types for a project
 * @param {string} projectKey - Project key
 * @param {Object} settings - Jira settings
 * @returns {Promise<Object>} Promise that resolves with issue types
 */
export async function getIssueTypes(projectKey, settings) {
  try {
    const baseUrl = sanitizeUrl(settings.url);
    const url = `${baseUrl}/rest/api/3/project/${projectKey}/issuetype`;

    const issueTypes = await makeJiraRequest(url, settings);

    return {
      success: true,
      issueTypes: issueTypes || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get issue statuses
 * @param {Object} settings - Jira settings
 * @returns {Promise<Object>} Promise that resolves with statuses
 */
export async function getStatuses(settings) {
  try {
    const baseUrl = sanitizeUrl(settings.url);
    const url = `${baseUrl}/rest/api/3/status`;

    const statuses = await makeJiraRequest(url, settings);

    return {
      success: true,
      statuses: statuses || [],
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Find Redmine issues that might be linked to a Jira issue
 * @param {string} jiraKey - Jira issue key (e.g., "PROJ-123")
 * @param {Object} jiraSettings - Jira settings
 * @param {Object} redmineSettings - Redmine settings
 * @param {Function} searchRedmineIssues - Redmine search function
 * @returns {Promise<Object>} Promise that resolves with linked issues
 */
export async function findLinkedRedmineIssues(
  jiraKey,
  jiraSettings,
  redmineSettings,
  searchRedmineIssues
) {
  try {
    // Get Jira issue details
    const jiraResult = await getIssue(jiraKey, jiraSettings, ["description"]);

    if (!jiraResult.success) {
      throw new Error(`Failed to get Jira issue: ${jiraResult.error}`);
    }

    const jiraIssue = jiraResult.issue;

    // Search in Redmine for issues that might reference this Jira issue
    const searchQueries = [
      // jiraKey, // Direct key search
      // jiraIssue.key, // Issue key from response
      // jiraIssue.fields.summary, // Issue title
    ];

    // Add Jira URL if available
    if (jiraSettings.url) {
      const jiraUrl = `${sanitizeUrl(jiraSettings.url)}/browse/${jiraKey}`;
      searchQueries.push(jiraUrl);
    }

    let allLinkedIssues = [];
    const searchResults = [];

    // Search with each query
    for (const query of searchQueries) {
      if (!query || query.trim() === "") continue;

      console.log(`🔍 Searching Redmine for: "${query}"`);

      const redmineResult = await searchRedmineIssues(
        query.trim(),
        redmineSettings
      );

      if (redmineResult.success && redmineResult.issues.length > 0) {
        searchResults.push({
          query,
          issues: redmineResult.issues,
          count: redmineResult.issues.length,
        });

        // Add to combined results (avoid duplicates)
        redmineResult.issues.forEach((issue) => {
          if (!allLinkedIssues.find((existing) => existing.id === issue.id)) {
            allLinkedIssues.push(issue);
          }
        });
      }
    }

    return {
      success: true,
      jiraIssue: {
        key: jiraIssue.key,
        id: jiraIssue.id,
        summary: jiraIssue.fields.summary,
        description: jiraIssue.fields.description,
        status: jiraIssue.fields.status.name,
        issueType: jiraIssue.fields.issuetype.name,
        project: jiraIssue.fields.project.key,
      },
      linkedRedmineIssues: allLinkedIssues,
      searchResults,
      totalLinked: allLinkedIssues.length,
    };
  } catch (error) {
    console.error("❌ Error finding linked Redmine issues:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Normalize Jira issue data for comparison
 * @param {Object} jiraIssue - Raw Jira issue object
 * @returns {Object} Normalized issue data
 */
export function normalizeJiraIssue(jiraIssue) {
  return {
    id: jiraIssue.id,
    key: jiraIssue.key,
    summary: jiraIssue.fields?.summary || "",
    description: jiraIssue.fields?.description || "",
    status: jiraIssue.fields?.status?.name || "",
    statusId: jiraIssue.fields?.status?.id || "",
    issueType: jiraIssue.fields?.issuetype?.name || "",
    issueTypeId: jiraIssue.fields?.issuetype?.id || "",
    project: jiraIssue.fields?.project?.key || "",
    projectId: jiraIssue.fields?.project?.id || "",
    projectName: jiraIssue.fields?.project?.name || "",
    assignee: jiraIssue.fields?.assignee?.displayName || null,
    assigneeId: jiraIssue.fields?.assignee?.accountId || null,
    reporter: jiraIssue.fields?.reporter?.displayName || null,
    reporterId: jiraIssue.fields?.reporter?.accountId || null,
    created: jiraIssue.fields?.created || null,
    updated: jiraIssue.fields?.updated || null,
    priority: jiraIssue.fields?.priority?.name || null,
    priorityId: jiraIssue.fields?.priority?.id || null,
    labels: jiraIssue.fields?.labels || [],
    components: jiraIssue.fields?.components?.map((c) => c.name) || [],
    fixVersions: jiraIssue.fields?.fixVersions?.map((v) => v.name) || [],
    source: "jira",
    raw: jiraIssue,
  };
}

export default {
  testConnection,
  getCurrentUser,
  getIssue,
  getIssues,
  searchIssues,
  searchAllIssues,
  getProjects,
  getIssueTypes,
  getStatuses,
  findLinkedRedmineIssues,
  normalizeJiraIssue,
};
