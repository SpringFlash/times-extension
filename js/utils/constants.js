export const CONFIG = {
  REDMINE: {
    DEFAULT_ACTIVITY_ID: 9,
    DEFAULT_RESEARCH_ACTIVITY_ID: 46,
    DEFAULT_TRACKER_ID: 1,
    DEFAULT_STATUS_ID: 1, // New
    DEFAULT_PRIORITY_ID: 4, // Medium priority
    PAGINATION_LIMIT: 100,
    MAX_RECORDS: 10000, // safety limit to prevent infinite loops
  },

  JIRA: {
    TASK_PATTERN: /([A-Z]+-\d+)/g,
    REDMINE_LINK_PATTERN: /https?:\/\/[^\/]+\/issues\/(\d+)/g,
    API_VERSION: "3",
    PAGINATION_LIMIT: 100,
    MAX_SEARCH_RESULTS: 1000,
    MAX_RECORDS: 10000,
  },

  TEMPO: {
    API_VERSION: "4",
    DEFAULT_START_TIME: "09:00:00",
    BATCH_DELAY: 200, // ms between batch requests
    PAGINATION_LIMIT: 1000, // max records per request
    MAX_RECORDS: 10000, // safety limit to prevent infinite loops
  },

  STORAGE: {
    REDMINE_SETTINGS: "redmine_settings",
    JIRA_SETTINGS: "jira_settings",
    TEMPO_SETTINGS: "tempo_settings",
    TIME_ENTRIES: "time_entries",
    JIRA_PROJECT_MAPPINGS: "jira_project_mappings",
  },

  ERRORS: {
    INVALID_URL: "Invalid URL format",
    INVALID_API_KEY: "Invalid API key",
    CONNECTION_FAILED: "Connection to server failed",
    TASK_OR_PROJECT_REQUIRED: "Either task ID or project ID is required",
    UNAUTHORIZED: "Unauthorized access - check your API key",
  },

  PRIORITY_MAP: {
    Highest: 6,
    High: 5,
    Medium: 4,
    Low: 3,
    Lowest: 33,
  },

  STATUS_MAP: {
    // Jira statuses to Redmine status IDs
    "To Do": 1, // New
    Backlog: 1, // New
    "Billing Hold": 4, // Feedback
    Pending: 4, // Feedback
    "In Progress": 7, // In progress
    "Ready for Review": 14, // Need QA
    "RC&QA": 3, // Resolved
    "Checked On UAT": 3, // Resolved
    "Waiting For Release": 3, // Resolved
    "Transfer to RC": 3, // Resolved
    "Issue Closed": 3, // Resolved (no Closed status, using Resolved)
    "Cannot be Tested": 6, // Rejected
    Cancelled: 6, // Rejected
  },

  UI: {
    MODAL_ANIMATION_DURATION: 300,
    NOTIFICATION_DURATION: 3000,
    DEBOUNCE_DELAY: 500,
  },
};

export default CONFIG;
