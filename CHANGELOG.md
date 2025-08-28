# Changelog

## [Unreleased]

### Added

- **Task Creation Modal**: Added modal dialog for Tempo iframe when Redmine task doesn't exist
  - Shows warning when task is not found in Redmine
  - Provides three options: Cancel, Skip Redmine, or Create & Track
  - "Create & Track" option creates task in Redmine and then logs time
  - "Skip Redmine" option proceeds with Tempo logging only
  - Loading animation while creating task
  - Automatic modal close after task creation
  - Updated indicator to show task creation success
  - Proper error handling with user feedback

### Technical Details

- Added `createTaskNotFoundModal()` function in `tempo-iframe-content.js`
- Added `checkTaskExists()` and `createRedmineTask()` functions in `content.js`
- New message types: `CHECK_TASK_EXISTS`, `CREATE_REDMINE_TASK`, `TASK_EXISTS_RESPONSE`, `TASK_CREATED_RESPONSE`
- Enhanced user experience with smooth animations and clear feedback

### Fixed

- Task creation for Tempo iframe now uses the same logic as regular task creation:
  - Extracts priority from Jira page
  - Uses current Jira URL as description
  - Proper subject formatting with task number and title
- Added validation for description field in Tempo iframe:
  - Description is required for Redmine integration (needed for Jira tracking)
  - Clear error message when description is missing
  - Prevents empty time entries from being sent to Redmine

## [1.2] - 2024-12-30

### Added

- **Project Selection**: Dynamic project dropdown loaded from Redmine API
  - Automatic project loading via API
  - Mutual exclusion with Issue ID (either issue or project, not both)
  - Project refresh functionality
  - Visual indication of project vs issue-based entries in tables
- **Enhanced API Integration**: Extended API support for project-based time entries
- **Improved UI**: Better form validation and user feedback

### Changed

- **Table Headers**: Updated to show "Task ID / Project" instead of just "Task ID"
- **Form Validation**: Now requires either Task ID or Project selection
- **Data Structure**: Time entries now support both issue-based and project-based logging

### Technical Details

- Added `fetchProjectsViaAPI()` function in background script
- Enhanced `createTimeEntryViaAPI()` to support project-based entries
- Added project selection UI components with refresh functionality
- Implemented mutual exclusion logic between task ID and project selection

## [1.1] - 2024-12-30

### Added

- **Redmine API Integration**: Direct API integration for creating time entries
- **Redmine Settings Page**: Configuration interface for API settings
  - Redmine URL configuration
  - API Key management
  - Default Project ID setting
  - Activity ID configuration (normal and research)
- **Connection Testing**: Test Redmine API connection before use
- **Dual Filling Methods**:
  - "Fill via API" - Direct API calls (recommended)
  - "Fill via Form" - Legacy browser automation
- **Enhanced Error Handling**: Detailed error messages and progress tracking
- **API Documentation**: Comprehensive usage guide and troubleshooting

### Changed

- **Manifest Version**: Updated to 1.1
- **Permissions**: Added host_permissions for API requests
- **UI Layout**: Improved button layout for dual filling options
- **Progress Feedback**: Better visual feedback during API operations

### Technical Details

- Added `createTimeEntryViaAPI()` function in background script
- Implemented Redmine REST API endpoints:
  - `GET /users/current.json` for connection testing
  - `POST /time_entries.json` for time entry creation
- Enhanced storage management for API settings
- Improved error handling and user feedback

### Files Modified

- `manifest.json` - Added host permissions and updated version
- `options.html` - Added Redmine API settings section
- `options.js` - Added API configuration functions
- `popup.html` - Added dual filling buttons
- `popup.js` - Implemented API filling functionality
- `background.js` - Added API integration functions
- `css/options.css` - Styled API settings section
- `css/popup.css` - Updated button styles

### Documentation

- `README.md` - Updated with API integration information
- `REDMINE_API_USAGE.md` - Detailed usage guide
- `CHANGELOG.md` - This changelog

## [1.0] - Previous

### Features

- Basic time entry management
- Form automation for time filling
- Calendar view
- Import/Export functionality
- Local storage management
