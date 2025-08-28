/**
 * Jira Content Script - автоматический поиск связанных Redmine задач
 */

class JiraIntegration {
  constructor() {
    this.currentTaskId = null;
    this.currentTaskUrl = null;
    this.redmineSettings = null;
    this.linkedTask = null;
    this.uiContainer = null;

    this.init();
  }

  /**
   * Инициализация content script
   */
  async init() {
    console.log("🎫 Jira Integration: Initializing...");

    // Ждем полной загрузки страницы
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.start());
    } else {
      this.start();
    }
  }

  /**
   * Запуск интеграции
   */
  async start() {
    try {
      // Извлекаем информацию о текущей задаче
      this.extractTaskInfo();

      if (!this.currentTaskId) {
        console.log("🎫 Jira Integration: No task ID found");
        return;
      }

      console.log(`🎫 Jira Integration: Found task ${this.currentTaskId}`);

      // Получаем настройки Redmine и Jira
      await this.loadRedmineSettings();
      await this.loadJiraSettings();

      if (
        !this.redmineSettings ||
        !this.redmineSettings.url ||
        !this.redmineSettings.apiKey
      ) {
        console.log("🎫 Jira Integration: Redmine not configured");
        return;
      }

      // Ищем связанную задачу
      await this.searchLinkedTask();

      // Создаем UI
      this.createUI();
    } catch (error) {
      console.error("🎫 Jira Integration Error:", error);
    }
  }

  /**
   * Извлечение информации о задаче из URL и страницы
   */
  extractTaskInfo() {
    // Извлекаем ID задачи из URL
    const urlMatch = window.location.href.match(/\/browse\/([A-Z]+-\d+)/);
    if (urlMatch) {
      this.currentTaskId = urlMatch[1];
      this.currentTaskUrl = window.location.href;

      // Извлекаем дополнительную информацию о задаче
      this.extractJiraTaskDetails();
    }
  }

  /**
   * Извлечение деталей Jira задачи для создания Redmine задачи
   */
  extractJiraTaskDetails() {
    try {
      // Извлекаем заголовок
      const titleSelectors = [
        '[data-testid="issue.views.issue-base.foundation.summary.heading"]',
        'h1[data-testid*="summary"]',
        ".issue-header h1",
        "#summary-val",
        ".issue-title",
      ];

      let title = "";
      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          title = element.textContent?.trim() || "";
          break;
        }
      }

      // Извлекаем приоритет/сложность
      const prioritySelectors = [
        '[data-testid="issue.views.field.priority.common.ui.priority-field-view"]',
        ".priority .value",
        '[data-field-id="priority"]',
      ];

      let priority = "";
      for (const selector of prioritySelectors) {
        const element = document.querySelector(selector);
        if (element) {
          priority = element.textContent?.trim() || "";
          break;
        }
      }

      // Извлекаем статус
      const statusSelectors = [
        '[data-testid="issue.views.field.status.common.ui.status-lozenge"]',
        ".status .value",
        '[data-field-id="status"]',
      ];

      let status = "";
      for (const selector of statusSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          status = element.textContent?.trim() || "";
          break;
        }
      }

      // Сохраняем извлеченные данные
      this.jiraTaskDetails = {
        title: title || this.currentTaskId,
        priority: priority,
        status: status,
        url: this.currentTaskUrl,
      };

      console.log("🎫 Extracted Jira task details:", this.jiraTaskDetails);
    } catch (error) {
      console.error("Error extracting Jira task details:", error);
      this.jiraTaskDetails = {
        title: this.currentTaskId,
        priority: "",
        status: "",
        url: this.currentTaskUrl,
      };
    }
  }

  /**
   * Загрузка настроек Redmine из storage
   */
  async loadRedmineSettings() {
    try {
      const result = await chrome.storage.local.get("redmine_settings");
      this.redmineSettings = result.redmine_settings || {};
    } catch (error) {
      console.error("Error loading Redmine settings:", error);
    }
  }

  /**
   * Загрузка настроек Jira из storage
   */
  async loadJiraSettings() {
    try {
      const result = await chrome.storage.local.get("jira_settings");
      this.jiraSettings = result.jira_settings || {};
    } catch (error) {
      console.error("Error loading Jira settings:", error);
    }
  }

  /**
   * Создание UI элементов на странице
   */
  createUI() {
    // Удаляем существующий UI если есть
    this.removeExistingUI();

    // Создаем минималистичную плашку
    this.uiContainer = document.createElement("div");
    this.uiContainer.id = "redmine-integration-badge";
    this.uiContainer.className = "redmine-badge";

    if (this.linkedTask) {
      // Найдена связанная задача
      this.uiContainer.innerHTML = `
        <div class="redmine-badge-content found" data-task-id="${this.linkedTask.id}">
          <span class="badge-icon">🔗</span>
          <span class="badge-text">
            <strong>Redmine #${this.linkedTask.id}</strong>
            <small>${this.linkedTask.subject}</small>
          </span>
        </div>
      `;

      // Добавляем обработчик клика
      this.uiContainer.addEventListener("click", () => {
        const url = `${this.redmineSettings.url}/issues/${this.linkedTask.id}`;
        window.open(url, "_blank");
      });
    } else {
      // Задача не найдена
      this.uiContainer.innerHTML = `
        <div class="redmine-badge-content not-found">
          <span class="badge-icon">➕</span>
          <span class="badge-text">
            <strong>Create Redmine Task</strong>
            <small>No linked task found</small>
          </span>
        </div>
      `;

      // Добавляем обработчик для создания новой задачи
      this.uiContainer.addEventListener("click", () => {
        this.createRedmineTask();
      });
    }

    setTimeout(() => {
      // Ищем подходящее место для вставки UI
      const targetContainer = this.findInsertionPoint();

      if (!targetContainer) {
        console.warn("🎫 Jira Integration: Could not find insertion point");
        return;
      }

      console.log("🎫 Jira Integration: DOM loaded");
      targetContainer.insertBefore(
        this.uiContainer,
        targetContainer.firstChild
      );
    }, 7000);

    console.log("🎫 Jira Integration: Badge created and inserted");
  }

  /**
   * Удаление существующего UI
   */
  removeExistingUI() {
    const existingBadge = document.getElementById("redmine-integration-badge");
    if (existingBadge) {
      existingBadge.remove();
      console.log("🎫 Jira Integration: Removed existing badge");
    }
  }

  /**
   * Поиск подходящего места для вставки UI
   */
  findInsertionPoint() {
    // Ищем заголовок задачи для размещения рядом
    const titleSelectors = [
      '[data-testid="issue-view-product-templates-default.ui.foundation-content.foundation-content-wrapper"]',
      'h1[data-testid*="summary"]',
      ".issue-header h1",
      "#summary-val",
      ".issue-title",
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.parentElement || element;
      }
    }

    // Fallback - ищем любой заголовок или контейнер
    const fallbackSelectors = [
      ".issue-header-content",
      ".issue-body-content",
      ".aui-page-panel-content",
      "#issue-content",
      ".issue-main-column",
    ];

    for (const selector of fallbackSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }

    // Последний fallback - вставляем в body
    return document.body;
  }

  /**
   * Поиск связанной задачи в Redmine
   */
  async searchLinkedTask() {
    try {
      // Отправляем запрос в background script для поиска
      const response = await chrome.runtime.sendMessage({
        action: "searchInRedmine",
        query: this.currentTaskUrl,
      });

      if (response.success && response.issues && response.issues.length > 0) {
        this.linkedTask = response.issues[0]; // Берем первую найденную задачу
        return;
      }

      // Пробуем поиск по ID задачи
      const fallbackResponse = await chrome.runtime.sendMessage({
        action: "searchInRedmine",
        query: this.currentTaskId,
      });

      if (
        fallbackResponse.success &&
        fallbackResponse.issues &&
        fallbackResponse.issues.length > 0
      ) {
        this.linkedTask = fallbackResponse.issues[0]; // Берем первую найденную задачу
      } else {
        this.linkedTask = null; // Задача не найдена
      }
    } catch (error) {
      console.error("Error searching linked task:", error);
      this.linkedTask = null;
    }
  }

  /**
   * Создание новой задачи в Redmine через API
   */
  async createRedmineTask() {
    if (!this.redmineSettings.url || !this.redmineSettings.apiKey) {
      this.showNotification("❌ Redmine not configured", "error");
      return;
    }

    try {
      // Показываем индикатор загрузки
      const badge = this.uiContainer.querySelector(".redmine-badge-content");
      const originalContent = badge.innerHTML;
      badge.innerHTML = `
        <span class="badge-icon">🔄</span>
        <span class="badge-text">
          <strong>Creating Task...</strong>
          <small>Please wait</small>
        </span>
      `;
      badge.style.pointerEvents = "none";

      // Подготавливаем данные для создания задачи
      const taskData = this.prepareRedmineTaskData();

      console.log("🎫 Jira Integration: Task data:", taskData);

      // Отправляем запрос на создание
      const result = await chrome.runtime.sendMessage({
        action: "createRedmineIssue",
        data: taskData,
      });

      if (result.success) {
        // Обновляем UI для показа созданной задачи
        this.linkedTask = result.issue;
        this.updateBadgeToFound();
        this.showNotification(
          `✅ Created Redmine task #${result.issue.id}`,
          "success"
        );
      } else {
        // Восстанавливаем исходное состояние при ошибке
        badge.innerHTML = originalContent;
        badge.style.pointerEvents = "auto";
        this.showNotification(
          `❌ Failed to create task: ${result.error}`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error creating Redmine task:", error);
      this.showNotification(`❌ Error: ${error.message}`, "error");

      // Восстанавливаем исходное состояние
      const badge = this.uiContainer.querySelector(".redmine-badge-content");
      badge.innerHTML = `
        <span class="badge-icon">➕</span>
        <span class="badge-text">
          <strong>Create Redmine Task</strong>
          <small>No linked task found</small>
        </span>
      `;
      badge.style.pointerEvents = "auto";
    }
  }

  /**
   * Подготовка данных для создания Redmine задачи
   */
  prepareRedmineTaskData() {
    const description = this.currentTaskUrl;

    return {
      subject: this.jiraTaskDetails.title,
      description: description,
      projectId:
        this.jiraSettings?.linkedProject ||
        this.redmineSettings.defaultProject ||
        "1", // Используем проект по умолчанию как строку
      jiraPriority: this.jiraTaskDetails.priority, // Отправляем оригинальный приоритет для маппинга в redmine.js
      jiraStatus: this.jiraTaskDetails.status, // Добавляем статус для будущего маппинга
    };
  }

  /**
   * Обновление плашки после создания задачи
   */
  updateBadgeToFound() {
    const badge = this.uiContainer.querySelector(".redmine-badge-content");
    badge.className = "redmine-badge-content found";
    badge.innerHTML = `
      <span class="badge-icon">🔗</span>
      <span class="badge-text">
        <strong>Redmine #${this.linkedTask.id}</strong>
        <small>${this.linkedTask.subject}</small>
      </span>
    `;
    badge.style.pointerEvents = "auto";

    // Обновляем обработчик клика
    this.uiContainer.removeEventListener("click", this.createRedmineTask);
    this.uiContainer.addEventListener("click", () => {
      const url = `${this.redmineSettings.url}/issues/${this.linkedTask.id}`;
      window.open(url, "_blank");
    });
  }

  /**
   * Показать уведомление на странице
   */
  showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `jira-notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Анимация появления
    setTimeout(() => notification.classList.add("show"), 10);

    // Удаление через 3 секунды
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }
}

// Инициализация при загрузке страницы
new JiraIntegration();
