import { CONFIG } from "./constants.js";

/**
 * Sanitize and validate URL
 * @param {string} url - URL to sanitize
 * @returns {string} - Sanitized URL
 */
export function sanitizeUrl(url) {
  if (!url) throw new Error(CONFIG.ERRORS.INVALID_URL);

  // Remove trailing slash
  url = url.replace(/\/$/, "");

  // Add https if no protocol specified
  if (!/^https?:\/\//.test(url)) {
    url = "https://" + url;
  }

  try {
    new URL(url);
    return url;
  } catch (error) {
    throw new Error(CONFIG.ERRORS.INVALID_URL);
  }
}

/**
 * Validate API key format
 * @param {string} apiKey - API key to validate
 * @returns {boolean} - Is valid
 */
export function isValidApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== "string") return false;
  return apiKey.length >= 8 && !/\s/.test(apiKey);
}

/**
 * Validate API response
 * @param {any} response - API response to validate
 * @returns {boolean} - Is valid response
 */
export function isValidApiResponse(response) {
  return response && typeof response === "object" && !response.error;
}

/**
 * Extract Jira task IDs from text
 * @param {string} text - Text to search
 * @returns {string[]} - Array of task IDs
 */
export function extractJiraTaskIds(text) {
  if (!text || typeof text !== "string") return [];

  const matches = text.match(CONFIG.JIRA.TASK_PATTERN);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract Redmine issue URLs from text
 * @param {string} text - Text to search
 * @returns {Object[]} - Array of {url, issueId} objects
 */
export function extractRedmineLinks(text) {
  if (!text || typeof text !== "string") return [];

  const matches = [...text.matchAll(CONFIG.JIRA.REDMINE_LINK_PATTERN)];
  return matches.map((match) => ({
    url: match[0],
    issueId: parseInt(match[1]),
  }));
}

/**
 * Validate time entry data
 * @param {Object} entry - Time entry to validate
 * @returns {Object} - {valid: boolean, errors: string[]}
 */
export function validateTimeEntry(entry) {
  const errors = [];

  if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    errors.push("Invalid date format");
  }

  if (!entry.time || entry.time <= 0 || entry.time > 24) {
    errors.push("Time must be between 0 and 24 hours");
  }

  if (!entry.task && !entry.projectId) {
    errors.push("Either task ID or project ID is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
