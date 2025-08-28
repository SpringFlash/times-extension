export const CONFIG = {
  REDMINE: {
    DEFAULT_ACTIVITY_ID: 9,
    DEFAULT_RESEARCH_ACTIVITY_ID: 46,
    DEFAULT_TRACKER_ID: 1,
    DEFAULT_STATUS_ID: 1,
    DEFAULT_PRIORITY_ID: 3, // Medium priority
    PAGINATION_LIMIT: 100,
  },

  JIRA: {
    TASK_PATTERN: /([A-Z]+-\d+)/g,
    REDMINE_LINK_PATTERN: /https?:\/\/[^\/]+\/issues\/(\d+)/g,
  },

  TEMPO: {
    API_VERSION: "4",
    DEFAULT_START_TIME: "09:00:00",
    BATCH_DELAY: 200, // ms between batch requests
  },

  STORAGE: {
    REDMINE_SETTINGS: "redmine_settings",
    JIRA_SETTINGS: "jira_settings",
    TEMPO_SETTINGS: "tempo_settings",
    TIME_ENTRIES: "time_entries",
  },

  ERRORS: {
    INVALID_URL: "Invalid URL format",
    INVALID_API_KEY: "Invalid API key",
    CONNECTION_FAILED: "Connection to server failed",
    TASK_OR_PROJECT_REQUIRED: "Either task ID or project ID is required",
    UNAUTHORIZED: "Unauthorized access - check your API key",
  },

  PRIORITY_MAP: {
    Highest: 5,
    High: 4,
    Medium: 3,
    Low: 2,
    Lowest: 1,
  },

  UI: {
    MODAL_ANIMATION_DURATION: 300,
    NOTIFICATION_DURATION: 3000,
    DEBOUNCE_DELAY: 500,
  },
};

export default CONFIG;
