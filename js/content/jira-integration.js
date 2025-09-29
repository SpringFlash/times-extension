const SELECTORS = {
  // Селекторы для ожидания загрузки страницы
  WAIT_CONTENT: [
    '[data-testid="issue-view-product-templates-default.ui.foundation-content.foundation-content-wrapper"]',
    ".webkit.chrome",
  ],

  // Селектор для заголовка задачи
  TITLE: '[data-testid="issue.views.issue-base.foundation.summary.heading"]',

  // Селектор для приоритета
  PRIORITY:
    '[data-testid="issue-field-priority-readview-full.ui.priority.wrapper"]',

  // Селектор для статуса
  STATUS:
    '[data-testid="issue-field-status.ui.status-view.status-button.status-button"]',

  // Селектор для точки вставки UI
  INSERTION_POINT:
    '[data-testid="issue-view-product-templates-default.ui.foundation-content.foundation-content-wrapper"]',
};

class JiraIntegration {
  constructor(isBoardPage) {
    this.currentTaskId = null;
    this.currentTaskUrl = null;
    this.redmineSettings = null;
    this.linkedTask = null;
    this.uiContainer = null;
    this.isBoardPage = isBoardPage;

    this.init();
  }

  /**
   * Инициализация content script
   */
  async init() {
    console.log("🎫 Jira Integration: Initializing...");

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
      const waitContent = SELECTORS.WAIT_CONTENT.map((selector) =>
        waitElement(selector)
      );

      await Promise.all(waitContent);

      this.extractTaskInfo();

      if (!this.currentTaskId) {
        console.log("🎫 Jira Integration: No task ID found");
        return;
      }

      console.log(`🎫 Jira Integration: Found task ${this.currentTaskId}`);

      await this.loadRedmineSettings();
      await this.loadJiraSettings();

      if (!this.redmineSettings?.url || !this.redmineSettings?.apiKey) {
        console.log("🎫 Jira Integration: Redmine not configured");
        return;
      }

      await this.searchLinkedTask();
      this.createUI();
    } catch (error) {
      console.error("🎫 Jira Integration Error:", error);
    }
  }

  /**
   * Извлечение информации о задаче из URL и страницы
   */
  extractTaskInfo() {
    let urlMatch;
    if (this.isBoardPage) {
      urlMatch = window.location.href.match(/selectedIssue=([A-Z]+-\d+)/);
    } else {
      urlMatch = window.location.href.match(/\/browse\/([A-Z]+-\d+)/);
    }

    if (urlMatch) {
      this.currentTaskId = urlMatch[1];
      this.extractJiraTaskDetails();
    }
  }

  /**
   * Извлечение деталей Jira задачи для создания Redmine задачи
   */
  extractJiraTaskDetails() {
    try {
      const titleElement = document.querySelector(SELECTORS.TITLE);
      const title = titleElement ? titleElement.textContent?.trim() || "" : "";

      const priorityElement = document.querySelector(SELECTORS.PRIORITY);
      const priority = priorityElement
        ? priorityElement.textContent?.trim() || ""
        : "";

      const statusElement = document.querySelector(SELECTORS.STATUS);
      const status = statusElement
        ? statusElement.textContent?.trim() || ""
        : "";

      const url = `${window.location.origin}/browse/${this.currentTaskId}`;

      this.jiraTaskDetails = {
        title: title || this.currentTaskId,
        priority: priority,
        status: status,
        url: url,
      };

      this.currentTaskUrl = url;

      console.log("🎫 Extracted Jira task details:", this.jiraTaskDetails);
    } catch (error) {
      console.error("Error extracting Jira task details:", error);
      this.jiraTaskDetails = {
        title: this.currentTaskId,
        priority: "",
        status: "",
        url: `${window.location.origin}/browse/${this.currentTaskId}`,
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
   * Получение связанного проекта Redmine для текущего URL JIRA
   */
  async getLinkedProject() {
    try {
      const currentUrl = window.location.origin;

      // Получаем маппинги из storage
      const result = await chrome.storage.local.get("jira_project_mappings");
      const mappings = result.jira_project_mappings || [];

      // Ищем подходящий маппинг
      const normalizedUrl = currentUrl.toLowerCase().replace(/\/$/, "");
      const mapping = mappings.find((m) => {
        const mappingUrl = m.jiraUrl.toLowerCase().replace(/\/$/, "");
        return (
          normalizedUrl.includes(mappingUrl) ||
          mappingUrl.includes(normalizedUrl)
        );
      });

      // Возвращаем найденный проект или дефолтный
      return mapping
        ? mapping.redmineProjectId
        : this.jiraSettings?.defaultProject || null;
    } catch (error) {
      console.error("Error getting linked project:", error);
      return this.jiraSettings?.defaultProject || null;
    }
  }

  /**
   * Создание UI элементов на странице
   */
  createUI() {
    this.removeExistingUI();

    this.uiContainer = document.createElement("div");
    this.uiContainer.id = "redmine-integration-badge";
    this.uiContainer.className = "redmine-badge";

    const badgeContent = document.createElement("div");
    badgeContent.className = "redmine-badge-content";

    const badgeIcon = document.createElement("span");
    badgeIcon.className = "badge-icon";
    badgeIcon.innerHTML = "🔗";
    badgeContent.appendChild(badgeIcon);

    const badgeText = document.createElement("span");
    badgeText.className = "badge-text";

    if (this.linkedTask) {
      badgeContent.className = "redmine-badge-content found";
      badgeContent.dataset.taskId = this.linkedTask.id;
      badgeText.innerHTML = `
        <strong>Redmine #${this.linkedTask.id}</strong>
        <small>${this.linkedTask.subject}</small>
      `;

      badgeContent.addEventListener("click", () => {
        const url = `${this.redmineSettings.url}/issues/${this.linkedTask.id}`;
        window.open(url, "_blank");
      });
    } else {
      badgeContent.className = "redmine-badge-content not-found";
      badgeContent.dataset.taskId = this.currentTaskId;
      badgeText.innerHTML = `
        <strong>Create Redmine Task</strong>
        <small>No linked task found</small>
      `;

      badgeContent.addEventListener("click", () => {
        this.createRedmineTask();
      });
    }

    badgeContent.appendChild(badgeText);
    this.uiContainer.appendChild(badgeContent);

    const branchButton = document.createElement("button");
    branchButton.className = "action-button branch-button";
    branchButton.title = "Copy branch name";
    loadSVGIcon(branchButton, "branch");
    branchButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.copyBranchName();
    });

    const commitButton = document.createElement("button");
    commitButton.className = "action-button commit-button";
    commitButton.title = "Copy commit message";
    loadSVGIcon(commitButton, "commit");
    commitButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.copyCommitMessage();
    });

    const mrReportButton = document.createElement("button");
    mrReportButton.className = "action-button mr-report-button";
    mrReportButton.title = "Copy MR report";
    loadSVGIcon(mrReportButton, "mr-report");
    mrReportButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const mrReport = `:merged: @oleg.bikovskih MR для [${this.currentTaskId}](${this.currentTaskUrl})\n:merged: `;
      copyToClipboard(
        mrReport,
        `📋 MR report copied: ${mrReport}`,
        "❌ Failed to copy MR report"
      );
    });

    const actionButtons = document.createElement("div");
    actionButtons.className = "action-buttons";

    const columnButtons = document.createElement("div");
    columnButtons.className = "column-buttons";

    columnButtons.appendChild(branchButton);
    columnButtons.appendChild(mrReportButton);

    actionButtons.appendChild(columnButtons);
    actionButtons.appendChild(commitButton);

    this.uiContainer.appendChild(actionButtons);

    const targetContainer = this.findInsertionPoint();

    if (!targetContainer) {
      console.warn("🎫 Jira Integration: Could not find insertion point");
      return;
    }

    targetContainer.parentElement.insertBefore(
      this.uiContainer,
      targetContainer
    );
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
    const element = document.querySelector(SELECTORS.INSERTION_POINT);
    return element || document.body.firstChild;
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
      const taskData = await this.prepareRedmineTaskData();

      console.log("🎫 Jira Integration: Task data:", taskData);

      // Отправляем запрос на создание
      const result = await chrome.runtime.sendMessage({
        action: "createRedmineIssue",
        data: taskData,
      });

      if (result.success) {
        // Обновляем UI для показа созданной задачи
        this.linkedTask = result.issue;
        this.createUI();

        showNotification(
          `✅ Created Redmine task #${result.issue.id}`,
          "success"
        );
      } else {
        // Восстанавливаем исходное состояние при ошибке
        badge.innerHTML = originalContent;
        badge.style.pointerEvents = "auto";
        showNotification(`❌ Failed to create task: ${result.error}`, "error");
      }
    } catch (error) {
      console.error("Error creating Redmine task:", error);
      showNotification(`❌ Error: ${error.message}`, "error");

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
  async prepareRedmineTaskData() {
    const description = this.currentTaskUrl;
    const linkedProject = await this.getLinkedProject();

    return {
      subject: `${this.currentTaskId}: ${this.jiraTaskDetails.title}`,
      description: description,
      projectId: linkedProject || this.redmineSettings.defaultProject || "1", // Используем проект по умолчанию как строку
      jiraPriority: this.jiraTaskDetails.priority, // Отправляем оригинальный приоритет для маппинга в redmine.js
      jiraStatus: this.jiraTaskDetails.status, // Добавляем статус для будущего маппинга
    };
  }

  /**
   * Копирование названия ветки в буфер обмена
   */
  async copyBranchName() {
    const branchName = this.currentTaskId;
    await copyToClipboard(
      branchName,
      `📋 Branch name copied: ${branchName}`,
      "❌ Failed to copy branch name"
    );
  }

  /**
   * Копирование сообщения коммита в буфер обмена
   */
  async copyCommitMessage() {
    const commitMessage = `${this.currentTaskId} ${this.jiraTaskDetails?.title}`;
    await copyToClipboard(
      commitMessage,
      `📋 Commit message copied: ${commitMessage}`,
      "❌ Failed to copy commit message"
    );
  }

  /**
   * Очистка ресурсов и удаление UI элементов
   */
  cleanup() {
    console.log("🎫 Jira Integration: Cleaning up...");

    // Удаляем UI элементы
    this.removeExistingUI();

    // Очищаем данные
    this.currentTaskId = null;
    this.currentTaskUrl = null;
    this.linkedTask = null;
    this.jiraTaskDetails = null;
    this.uiContainer = null;

    console.log("🎫 Jira Integration: Cleanup completed");
  }
}

const isBoardPage = () => window.location.pathname.includes("jira/software");
const initJiraIntegration = () => new JiraIntegration(isBoardPage());

watchURL(initJiraIntegration, () =>
  isBoardPage() ? /selectedIssue=([A-Z]+-\d+)/ : /\/browse\/([A-Z]+-\d+)/
);
