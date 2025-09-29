import SimpleTimeComparisonUtils from "../utils/SimpleTimeComparisonUtils.js";
import NotificationManager from "./NotificationManager.js";
import { createTimeEntry, createIssue } from "../api/redmine.js";
import JiraRestAPI from "../api/jira-rest.js";

/**
 * Простой менеджер сравнения времени без лишней хуйни
 */
export class SimpleTimeComparisonManager {
  constructor(
    redmineSettingsManager,
    tempoSettingsManager,
    jiraSettingsManager
  ) {
    this.redmineManager = redmineSettingsManager;
    this.tempoManager = tempoSettingsManager;
    this.jiraManager = jiraSettingsManager;
    this.lastResult = null;
  }

  /**
   * Инициализация
   */
  init() {
    this.bindElements();
    this.attachEventListeners();
    this.initializeDateSelectors();
  }

  /**
   * Привязать элементы DOM
   */
  bindElements() {
    this.elements = {
      section: document.getElementById("simpleTimeComparisonSection"),
      compareButton: document.getElementById("simpleCompareButton"),
      monthSelect: document.getElementById("simpleComparisonMonth"),
      yearSelect: document.getElementById("simpleComparisonYear"),
      resultsContainer: document.getElementById("simpleComparisonResults"),
      summaryContainer: document.getElementById("simpleComparisonSummary"),
      missingContainer: document.getElementById("simpleMissingEntries"),
      createAllButton: document.getElementById("simpleCreateAllButton"),
      exportButton: document.getElementById("simpleExportButton"),
    };
  }

  /**
   * Привязать события
   */
  attachEventListeners() {
    this.elements.compareButton?.addEventListener("click", () =>
      this.performComparison()
    );
    this.elements.createAllButton?.addEventListener("click", () =>
      this.createAllMissingEntries()
    );
    this.elements.exportButton?.addEventListener("click", () =>
      this.exportMissingEntries()
    );
  }

  /**
   * Инициализировать селекторы даты
   */
  initializeDateSelectors() {
    const now = new Date();

    // Заполняем года
    if (this.elements.yearSelect) {
      const currentYear = now.getFullYear();
      for (let year = currentYear - 2; year <= currentYear + 1; year++) {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        if (year === currentYear) option.selected = true;
        this.elements.yearSelect.appendChild(option);
      }
    }

    // Заполняем месяцы
    if (this.elements.monthSelect) {
      const months = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
      ];

      months.forEach((month, index) => {
        const option = document.createElement("option");
        option.value = index + 1;
        option.textContent = month;
        if (index === now.getMonth()) option.selected = true;
        this.elements.monthSelect.appendChild(option);
      });
    }
  }

  /**
   * Выполнить сравнение
   */
  async performComparison() {
    const button = this.elements.compareButton;
    if (!button) return;

    const originalText = button.textContent;
    button.textContent = "🔄 Сравниваем...";
    button.disabled = true;

    try {
      // Получаем настройки
      const redmineSettings = this.redmineManager.getSettings();
      const tempoSettings = this.tempoManager.getSettings();
      const jiraSettings = this.jiraManager.getSettings();

      // Проверяем настройки
      if (!redmineSettings?.url || !redmineSettings?.apiKey) {
        throw new Error("Настрой сначала Redmine, блядь!");
      }
      if (!tempoSettings?.apiToken) {
        throw new Error("Настрой сначала Tempo, сука!");
      }
      if (
        !jiraSettings?.url ||
        !jiraSettings?.email ||
        !jiraSettings?.apiToken
      ) {
        throw new Error("Настрой сначала Jira, пидор!");
      }

      // Получаем период
      const year =
        parseInt(this.elements.yearSelect?.value) || new Date().getFullYear();
      const month =
        parseInt(this.elements.monthSelect?.value) || new Date().getMonth() + 1;

      console.log(
        `🔍 Сравниваем время за ${year}-${month.toString().padStart(2, "0")}`
      );

      // Выполняем сравнение
      const result = await SimpleTimeComparisonUtils.compareTimeEntries(
        year,
        month,
        tempoSettings,
        redmineSettings,
        jiraSettings
      );

      if (result.success) {
        this.lastResult = result;
        this.displayResults(result);

        const stats = result.comparison.stats;
        NotificationManager.success(
          `✅ Сравнение завершено! Отсутствует ${
            stats.missing
          } записей (${stats.missingHours.toFixed(2)}ч)`
        );
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("❌ Ошибка сравнения:", error);
      NotificationManager.error(`❌ Ошибка: ${error.message}`);
      this.clearResults();
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Отобразить результаты
   */
  displayResults(result) {
    if (!this.elements.resultsContainer) return;

    this.elements.resultsContainer.style.display = "block";

    this.displaySummary(result.comparison.stats);
    this.displayMissingEntries(result.comparison.missingInRedmine);

    // Включаем кнопки действий
    const hasMissingEntries = result.comparison.missingInRedmine.length > 0;
    if (this.elements.createAllButton) {
      this.elements.createAllButton.disabled = !hasMissingEntries;
    }
    if (this.elements.exportButton) {
      this.elements.exportButton.disabled = !hasMissingEntries;
    }
  }

  /**
   * Отобразить сводку
   */
  displaySummary(stats) {
    if (!this.elements.summaryContainer) return;

    this.elements.summaryContainer.innerHTML = `
      <div class="simple-summary">
        <h3>📊 Сводка</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Tempo</div>
            <div class="summary-value">${
              stats.tempoTotal
            } записей (${stats.tempoHours.toFixed(2)}ч)</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Redmine</div>
            <div class="summary-value">${
              stats.redmineTotal
            } записей (${stats.redmineHours.toFixed(2)}ч)</div>
          </div>
          <div class="summary-item ${
            stats.missing > 0 ? "warning" : "success"
          }">
            <div class="summary-label">Отсутствует</div>
            <div class="summary-value">${
              stats.missing
            } записей (${stats.missingHours.toFixed(2)}ч)</div>
          </div>
          <div class="summary-item success">
            <div class="summary-label">Найдено</div>
            <div class="summary-value">${stats.matched} записей</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Отобразить отсутствующие записи
   */
  displayMissingEntries(missingEntries) {
    if (!this.elements.missingContainer) return;

    if (missingEntries.length === 0) {
      this.elements.missingContainer.innerHTML = `
        <div class="no-missing">
          <h3>✅ Всё найдено!</h3>
          <p>Все записи из Tempo есть в Redmine.</p>
        </div>
      `;
      return;
    }

    const entriesHtml = missingEntries
      .map((entry, index) => {
        const entryId = `entry-${entry.date}-${entry.hours}-${
          entry.jiraTask || "no-jira"
        }`;
        return `
      <tr class="missing-entry" data-entry-id="${entryId}" data-index="${index}">
        <td>${entry.date}</td>
        <td>${entry.hours.toFixed(2)}ч</td>
        <td class="description">${entry.description || "Без описания"}</td>
        <td class="jira-task">
          ${
            entry.jiraTask
              ? `<a href="${this.getJiraUrl(
                  entry.jiraTask
                )}" target="_blank" class="jira-link">${entry.jiraTask}</a>`
              : "Нет задачи"
          }
        </td>
        <td class="redmine-task">
          ${
            entry.redmineTask
              ? `<a href="${this.getRedmineUrl(
                  entry.redmineTask
                )}" target="_blank" class="redmine-link">#${
                  entry.redmineTask
                }</a>`
              : "Не найдена"
          }
        </td>
        <td class="actions">
          <button class="btn-small create-btn" data-index="${index}">
            ➕ Создать
          </button>
        </td>
      </tr>
    `;
      })
      .join("");

    this.elements.missingContainer.innerHTML = `
      <div class="missing-entries">
        <h3>❌ Отсутствующие записи (${missingEntries.length})</h3>
        <table class="missing-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Время</th>
              <th>Описание</th>
              <th>Jira задача</th>
              <th>Redmine задача</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${entriesHtml}
          </tbody>
        </table>
      </div>
    `;

    // Привязываем события для кнопок создания
    this.elements.missingContainer
      .querySelectorAll(".create-btn")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const index = parseInt(e.target.dataset.index);
          this.createEntry(missingEntries[index]);
        });
      });
  }

  /**
   * Создать запись в Redmine
   */
  async createEntry(entry) {
    NotificationManager.info(`🔄 Создаём запись для ${entry.date}...`);

    // Показываем визуальный прогресс
    this.updateEntryVisualState(entry, "creating");

    try {
      const redmineSettings = this.redmineManager.getSettings();
      const jiraSettings = this.jiraManager.getSettings();

      let redmineTaskId = entry.redmineTask;

      // Если нет Redmine задачи, но есть Jira задача - создаём Redmine задачу
      if (!redmineTaskId && entry.jiraTask) {
        redmineTaskId = await this.createRedmineTaskForJira(
          entry.jiraTask,
          redmineSettings,
          jiraSettings
        );
      }

      // Создаём запись времени
      const timeEntryData = {
        date: entry.date,
        time: entry.hours,
        comment: entry.description, // Используем тот же комментарий что и в Tempo
        isResearch: false,
      };

      if (redmineTaskId) {
        timeEntryData.task = redmineTaskId.toString();
      } else {
        // Если нет задачи, создаём на связанном проекте или дефолтном
        const linkedProject = await this.getLinkedProject();
        timeEntryData.projectId =
          linkedProject || redmineSettings.projectId || "1";
      }

      const createTimeResult = await createTimeEntry(
        timeEntryData,
        redmineSettings
      );

      if (createTimeResult.success) {
        // Показываем что запись создана
        this.updateEntryVisualState(entry, "created");

        NotificationManager.success(
          `✅ Запись создана! ${entry.hours.toFixed(2)}ч на ${
            redmineTaskId ? `#${redmineTaskId}` : "проект"
          }`
        );

        // Если создали новую Redmine задачу, проставляем её всем остальным записям с той же Jira задачей
        if (entry.jiraTask && redmineTaskId && !entry.redmineTask) {
          this.updateOtherEntriesWithSameJiraTask(
            entry.jiraTask,
            redmineTaskId
          );
        }

        // Убираем запись из отсутствующих
        this.removeEntryFromDisplay(entry);
      } else {
        throw new Error(createTimeResult.error);
      }
    } catch (error) {
      console.error("❌ Ошибка создания записи:", error);
      NotificationManager.error(`❌ Ошибка создания записи: ${error.message}`);
    }
  }

  /**
   * Создать Redmine задачу для Jira задачи
   */
  async createRedmineTaskForJira(jiraTaskKey, redmineSettings, jiraSettings) {
    console.log(`🎫 Создаём Redmine задачу для Jira ${jiraTaskKey}`);

    // Получаем информацию о Jira задаче
    const jiraResult = await JiraRestAPI.getIssue(jiraTaskKey, jiraSettings, [
      "summary",
      "description",
      "priority",
      "status",
    ]);

    if (!jiraResult.success) {
      throw new Error(
        `Не удалось получить Jira задачу ${jiraTaskKey}: ${jiraResult.error}`
      );
    }

    const jiraIssue = jiraResult.issue;
    const jiraUrl = `${jiraSettings.url.replace(
      /\/$/,
      ""
    )}/browse/${jiraTaskKey}`;

    // Получаем правильный проект (с учётом маппингов)
    const linkedProject = await this.getLinkedProject();

    // Создаём Redmine задачу
    const issueData = {
      projectId: linkedProject || redmineSettings.projectId || "1", // Используем связанный проект, затем дефолтный
      subject: `${jiraTaskKey}: ${jiraIssue.fields.summary}`,
      description: jiraUrl,
      jiraPriority: jiraIssue.fields.priority?.name,
      jiraStatus: jiraIssue.fields.status?.name,
    };

    const createIssueResult = await createIssue(issueData, redmineSettings);

    if (!createIssueResult.success) {
      throw new Error(
        `Не удалось создать Redmine задачу: ${createIssueResult.error}`
      );
    }

    const redmineTaskId = createIssueResult.issue.id;
    console.log(`✅ Создана Redmine задача #${redmineTaskId}`);

    return redmineTaskId;
  }

  /**
   * Получение связанного проекта Redmine для текущего URL JIRA
   */
  async getLinkedProject() {
    try {
      const jiraSettings = this.jiraManager.getSettings();
      const currentUrl = jiraSettings?.url || "";

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
        : jiraSettings?.defaultProject || null;
    } catch (error) {
      console.error("Error getting linked project:", error);
      const jiraSettings = this.jiraManager.getSettings();
      return jiraSettings?.defaultProject || null;
    }
  }

  /**
   * Получить URL для Jira задачи
   */
  getJiraUrl(jiraTask) {
    const jiraSettings = this.jiraManager.getSettings();
    if (!jiraSettings?.url) return "#";

    const baseUrl = jiraSettings.url.replace(/\/$/, "");
    return `${baseUrl}/browse/${jiraTask}`;
  }

  /**
   * Получить URL для Redmine задачи
   */
  getRedmineUrl(redmineTask) {
    const redmineSettings = this.redmineManager.getSettings();
    if (!redmineSettings?.url) return "#";

    const baseUrl = redmineSettings.url.replace(/\/$/, "");
    return `${baseUrl}/issues/${redmineTask}`;
  }

  /**
   * Обновить все остальные записи с той же Jira задачей, проставив им созданную Redmine задачу
   */
  updateOtherEntriesWithSameJiraTask(jiraTask, redmineTaskId) {
    if (!this.lastResult?.comparison.missingInRedmine || !jiraTask) return;

    let updatedCount = 0;

    // Проходим по всем отсутствующим записям
    this.lastResult.comparison.missingInRedmine.forEach((entry) => {
      // Если у записи та же Jira задача и нет Redmine задачи
      if (entry.jiraTask === jiraTask && !entry.redmineTask) {
        entry.redmineTask = redmineTaskId;
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      console.log(
        `✅ Обновлено ${updatedCount} записей с Jira ${jiraTask}, проставлена Redmine задача #${redmineTaskId}`
      );

      // Перерисовываем таблицу чтобы показать обновлённые записи
      this.displayMissingEntries(this.lastResult.comparison.missingInRedmine);
    }
  }

  /**
   * Убрать запись из отображения после успешного создания
   */
  removeEntryFromDisplay(createdEntry) {
    if (!this.lastResult?.comparison.missingInRedmine) return;

    // Убираем запись из списка отсутствующих
    const index = this.lastResult.comparison.missingInRedmine.findIndex(
      (entry) =>
        entry.date === createdEntry.date &&
        entry.hours === createdEntry.hours &&
        entry.jiraTask === createdEntry.jiraTask
    );

    if (index !== -1) {
      this.lastResult.comparison.missingInRedmine.splice(index, 1);

      // Обновляем статистику
      this.lastResult.comparison.stats.missing--;
      this.lastResult.comparison.stats.missingHours -= createdEntry.hours;

      // Перерисовываем отображение
      this.displayResults(this.lastResult);
    }
  }

  /**
   * Создать все недостающие записи массово
   */
  async createAllMissingEntries() {
    if (!this.lastResult?.comparison.missingInRedmine?.length) {
      NotificationManager.error("Нет записей для создания");
      return;
    }

    const button = this.elements.createAllButton;
    if (!button) return;

    const originalText = button.textContent;
    button.disabled = true;

    try {
      const missingEntries = this.lastResult.comparison.missingInRedmine;
      const totalEntries = missingEntries.length;

      button.textContent = `🔄 Создаём ${totalEntries} записей...`;

      NotificationManager.info(
        `🚀 Начинаем создание ${totalEntries} записей...`
      );

      // Шаг 1: Создаём все уникальные Redmine задачи
      const uniqueJiraTasks = await this.createUniqueRedmineTasks(
        missingEntries
      );

      // Шаг 2: Создаём все записи времени
      const createdEntries = await this.createAllTimeEntries(
        missingEntries,
        uniqueJiraTasks
      );

      // Шаг 3: Обновляем UI
      this.updateUIAfterBulkCreation(createdEntries);

      NotificationManager.success(
        `✅ Создано ${createdEntries.length} записей! 🎉`
      );
    } catch (error) {
      console.error("❌ Ошибка массового создания:", error);
      NotificationManager.error(`❌ Ошибка: ${error.message}`);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Создать все уникальные Redmine задачи для Jira задач
   */
  async createUniqueRedmineTasks(missingEntries) {
    const redmineSettings = this.redmineManager.getSettings();
    const jiraSettings = this.jiraManager.getSettings();

    // Находим все уникальные Jira задачи без Redmine задач
    const uniqueJiraTasks = [
      ...new Set(
        missingEntries
          .filter((entry) => entry.jiraTask && !entry.redmineTask)
          .map((entry) => entry.jiraTask)
      ),
    ];

    if (uniqueJiraTasks.length === 0) {
      console.log("🎯 Нет Jira задач для создания Redmine задач");
      return {};
    }

    console.log(
      `🎫 Создаём ${uniqueJiraTasks.length} уникальных Redmine задач...`
    );

    // Создаём все задачи параллельно через Promise.all
    const taskPromises = uniqueJiraTasks.map(async (jiraTask) => {
      try {
        const redmineTaskId = await this.createRedmineTaskForJira(
          jiraTask,
          redmineSettings,
          jiraSettings
        );
        return { jiraTask, redmineTaskId, success: true };
      } catch (error) {
        console.error(
          `❌ Ошибка создания Redmine задачи для ${jiraTask}:`,
          error
        );
        return { jiraTask, error: error.message, success: false };
      }
    });

    const results = await Promise.all(taskPromises);

    // Создаём маппинг jiraTask -> redmineTaskId
    const taskMapping = {};
    let successCount = 0;
    let errorCount = 0;

    results.forEach((result) => {
      if (result.success) {
        taskMapping[result.jiraTask] = result.redmineTaskId;
        successCount++;
      } else {
        errorCount++;
      }
    });

    console.log(
      `✅ Создано ${successCount} Redmine задач, ошибок: ${errorCount}`
    );

    if (errorCount > 0) {
      NotificationManager.warning(
        `⚠️ Создано ${successCount} задач, ${errorCount} ошибок`
      );
    }

    return taskMapping;
  }

  /**
   * Получить ID записи для DOM элемента
   */
  getEntryId(entry) {
    return `entry-${entry.date}-${entry.hours}-${entry.jiraTask || "no-jira"}`;
  }

  /**
   * Обновить визуальное состояние записи в таблице
   */
  updateEntryVisualState(entry, state) {
    const entryId = this.getEntryId(entry);
    const row = document.querySelector(`[data-entry-id="${entryId}"]`);

    if (row) {
      // Убираем все предыдущие состояния
      row.classList.remove("creating", "created");

      // Добавляем новое состояние
      if (state === "creating") {
        row.classList.add("creating");
        const btn = row.querySelector(".create-btn");
        if (btn) {
          btn.textContent = "Создаём...";
          btn.disabled = true;
        }
      } else if (state === "created") {
        row.classList.add("created");
        const btn = row.querySelector(".create-btn");
        if (btn) {
          btn.textContent = "Создано";
          btn.disabled = true;
        }
      }
    }
  }

  /**
   * Создать все записи времени
   */
  async createAllTimeEntries(missingEntries, taskMapping) {
    const redmineSettings = this.redmineManager.getSettings();

    console.log(`⏰ Создаём ${missingEntries.length} записей времени...`);

    // Создаём все записи времени параллельно
    const entryPromises = missingEntries.map(async (entry) => {
      try {
        // Показываем что запись создаётся
        this.updateEntryVisualState(entry, "creating");

        // Определяем Redmine задачу
        let redmineTaskId = entry.redmineTask;
        if (!redmineTaskId && entry.jiraTask && taskMapping[entry.jiraTask]) {
          redmineTaskId = taskMapping[entry.jiraTask];
        }

        // Создаём запись времени
        const timeEntryData = {
          date: entry.date,
          time: entry.hours,
          comment: entry.description,
          isResearch: false,
        };

        if (redmineTaskId) {
          timeEntryData.task = redmineTaskId.toString();
        } else {
          // Если нет задачи, создаём на связанном проекте
          const linkedProject = await this.getLinkedProject();
          timeEntryData.projectId =
            linkedProject || redmineSettings.projectId || "1";
        }

        const createTimeResult = await createTimeEntry(
          timeEntryData,
          redmineSettings
        );

        if (createTimeResult.success) {
          // Показываем что запись создана
          this.updateEntryVisualState(entry, "created");

          return {
            originalEntry: entry,
            redmineTaskId,
            timeEntry: createTimeResult.timeEntry,
            success: true,
          };
        } else {
          throw new Error(createTimeResult.error);
        }
      } catch (error) {
        console.error(`❌ Ошибка создания записи для ${entry.date}:`, error);
        return {
          originalEntry: entry,
          error: error.message,
          success: false,
        };
      }
    });

    const results = await Promise.all(entryPromises);

    const successfulEntries = results.filter((r) => r.success);
    const failedEntries = results.filter((r) => !r.success);

    console.log(
      `✅ Создано ${successfulEntries.length} записей, ошибок: ${failedEntries.length}`
    );

    if (failedEntries.length > 0) {
      console.error("❌ Ошибки создания записей:", failedEntries);
    }

    return successfulEntries;
  }

  /**
   * Обновить UI после массового создания
   */
  updateUIAfterBulkCreation(createdEntries) {
    if (!this.lastResult?.comparison) return;

    // Убираем созданные записи из отсутствующих
    createdEntries.forEach(({ originalEntry }) => {
      const index = this.lastResult.comparison.missingInRedmine.findIndex(
        (entry) =>
          entry.date === originalEntry.date &&
          entry.hours === originalEntry.hours &&
          entry.jiraTask === originalEntry.jiraTask
      );

      if (index !== -1) {
        this.lastResult.comparison.missingInRedmine.splice(index, 1);
      }
    });

    // Обновляем статистику
    const createdCount = createdEntries.length;
    this.lastResult.comparison.stats.missing -= createdCount;
    this.lastResult.comparison.stats.missingHours -= createdEntries.reduce(
      (sum, { originalEntry }) => sum + originalEntry.hours,
      0
    );
    this.lastResult.comparison.stats.redmineTotal += createdCount;
    this.lastResult.comparison.stats.redmineHours += createdEntries.reduce(
      (sum, { originalEntry }) => sum + originalEntry.hours,
      0
    );
    this.lastResult.comparison.stats.matched += createdCount;

    // Перерисовываем результаты
    this.displayResults(this.lastResult);
  }

  /**
   * Экспортировать отсутствующие записи в CSV
   */
  async exportMissingEntries() {
    if (!this.lastResult?.comparison.missingInRedmine) {
      NotificationManager.error("Нет данных для экспорта");
      return;
    }

    try {
      const missing = this.lastResult.comparison.missingInRedmine;
      const period = this.lastResult.period;

      // Создаём CSV
      const headers = [
        "Дата",
        "Время",
        "Описание",
        "Jira задача",
        "Redmine задача",
      ];
      const rows = missing.map((entry) => [
        entry.date,
        entry.hours.toFixed(2),
        `"${(entry.description || "").replace(/"/g, '""')}"`,
        entry.jiraTask || "",
        entry.redmineTask || "",
      ]);

      const csvContent = [headers, ...rows]
        .map((row) => row.join(","))
        .join("\n");

      // Скачиваем файл
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `missing-entries-${period.year}-${period.month
        .toString()
        .padStart(2, "0")}.csv`;
      a.click();

      URL.revokeObjectURL(url);

      NotificationManager.success(
        `✅ Экспортировано ${missing.length} записей`
      );
    } catch (error) {
      console.error("❌ Ошибка экспорта:", error);
      NotificationManager.error(`❌ Ошибка экспорта: ${error.message}`);
    }
  }

  /**
   * Очистить результаты
   */
  clearResults() {
    if (this.elements.resultsContainer) {
      this.elements.resultsContainer.style.display = "none";
    }

    [this.elements.summaryContainer, this.elements.missingContainer].forEach(
      (container) => {
        if (container) container.innerHTML = "";
      }
    );

    if (this.elements.createAllButton) {
      this.elements.createAllButton.disabled = true;
    }
    if (this.elements.exportButton) {
      this.elements.exportButton.disabled = true;
    }

    this.lastResult = null;
  }
}

export default SimpleTimeComparisonManager;
