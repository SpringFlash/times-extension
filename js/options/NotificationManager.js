import { CONFIG } from "../utils/constants.js";

/**
 * Manages notifications for the options page
 */
export class NotificationManager {
  /**
   * Show notification on the page
   * @param {string} message - Notification message
   * @param {string} type - Notification type (info, success, error, warning)
   */
  static show(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add("show"), 10);

    // Remove after delay
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, CONFIG.UI.NOTIFICATION_DURATION);
  }

  /**
   * Show success notification
   * @param {string} message - Success message
   */
  static success(message) {
    this.show(message, "success");
  }

  /**
   * Show error notification
   * @param {string} message - Error message
   */
  static error(message) {
    this.show(message, "error");
  }

  /**
   * Show warning notification
   * @param {string} message - Warning message
   */
  static warning(message) {
    this.show(message, "warning");
  }

  /**
   * Show info notification
   * @param {string} message - Info message
   */
  static info(message) {
    this.show(message, "info");
  }
}

export default NotificationManager;


