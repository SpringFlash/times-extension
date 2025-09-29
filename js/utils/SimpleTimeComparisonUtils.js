import { getCurrentUserWorklogsForMonth } from "../api/tempo.js";
import { fetchTimeEntries, searchIssues } from "../api/redmine.js";
import JiraRestAPI from "../api/jira-rest.js";

/**
 * Простая утилита для сравнения времени между Tempo и Redmine
 * Без всякой хуйни - просто берём данные, нормализуем и сравниваем
 */
export class SimpleTimeComparisonUtils {
  /**
   * Сравнить время за месяц между Tempo и Redmine
   * @param {number} year - Год
   * @param {number} month - Месяц (1-12)
   * @param {Object} tempoSettings - Настройки Tempo
   * @param {Object} redmineSettings - Настройки Redmine
   * @param {Object} jiraSettings - Настройки Jira
   * @returns {Promise<Object>} Результат сравнения
   */
  static async compareTimeEntries(
    year,
    month,
    tempoSettings,
    redmineSettings,
    jiraSettings
  ) {
    try {
      console.log(
        `🔍 Сравниваем время за ${year}-${month.toString().padStart(2, "0")}`
      );

      // Получаем данные из Tempo
      const tempoResult = await getCurrentUserWorklogsForMonth(
        year,
        month,
        tempoSettings
      );
      if (!tempoResult.success) {
        throw new Error(`Tempo API ошибка: ${tempoResult.error}`);
      }

      // Получаем данные из Redmine
      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];
      const redmineResult = await fetchTimeEntries(
        startDate,
        endDate,
        redmineSettings
      );
      if (!redmineResult.success) {
        throw new Error(`Redmine API ошибка: ${redmineResult.error}`);
      }

      // Нормализуем данные из Tempo
      const tempoEntries = await this.normalizeTempoEntries(
        tempoResult.worklogs,
        jiraSettings
      );
      console.log(`📊 Tempo: ${tempoEntries.length} записей`);
      console.log(`📊 Tempo:`, tempoEntries);

      // Нормализуем данные из Redmine
      const redmineEntries = this.normalizeRedmineEntries(
        redmineResult.timeEntries
      );
      console.log(`📊 Redmine: ${redmineEntries.length} записей`);

      // Сравниваем
      const comparison = await this.compareEntries(
        tempoEntries,
        redmineEntries,
        redmineSettings
      );

      return {
        success: true,
        period: { year, month, startDate, endDate },
        tempoEntries,
        redmineEntries,
        comparison,
      };
    } catch (error) {
      console.error("❌ Ошибка сравнения:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Нормализовать записи из Tempo
   * @param {Array} worklogs - Записи из Tempo
   * @param {Object} jiraSettings - Настройки Jira
   * @returns {Promise<Array>} Нормализованные записи
   */
  static async normalizeTempoEntries(worklogs, jiraSettings) {
    const entries = [];

    const jiraIssueKeys = {};
    const jiraIds = new Set();
    worklogs.forEach((worklog) => {
      if (worklog.issue?.id) {
        jiraIds.add(worklog.issue.id);
      }
    });

    if (jiraIds.size > 0) {
      const promises = Array.from(jiraIds).map((id) =>
        JiraRestAPI.getIssue(id, jiraSettings)
      );
      const jiraResults = await Promise.all(promises);
      jiraResults.forEach((result) => {
        jiraIssueKeys[result.issue.id] = result.issue.key;
      });
    }

    for (const worklog of worklogs) {
      const jiraIssueKey = jiraIssueKeys[worklog.issue?.id];

      const entry = {
        date: worklog.startDate,
        hours: worklog.timeSpentSeconds / 3600,
        description: worklog.description || "",
        tempoId: worklog.tempoWorklogId,
        jiraTask: jiraIssueKey,
        redmineTask: null,
        source: "tempo",
      };

      entries.push(entry);
    }

    return entries;
  }

  /**
   * Нормализовать записи из Redmine
   * @param {Array} timeEntries - Записи из Redmine
   * @returns {Array} Нормализованные записи
   */
  static normalizeRedmineEntries(timeEntries) {
    console.log({ timeEntries });
    return timeEntries.map((entry) => {
      const normalized = {
        date: entry.spent_on,
        hours: entry.hours,
        description: entry.comments || "",
        redmineId: entry.id,
        jiraTask: entry.jira?.code || null,
        redmineTask: entry.issue?.id?.toString() || null,
        source: "redmine",
      };

      return normalized;
    });
  }

  /**
   * Сравнить записи
   * @param {Array} tempoEntries - Записи из Tempo
   * @param {Array} redmineEntries - Записи из Redmine
   * @returns {Object} Результат сравнения
   */
  static async compareEntries(tempoEntries, redmineEntries, redmineSettings) {
    const missingInRedmine = [];
    const matched = [];

    // Группируем Redmine записи по дате для быстрого поиска
    const redmineByDate = {};
    redmineEntries.forEach((entry) => {
      if (!redmineByDate[entry.date]) {
        redmineByDate[entry.date] = [];
      }
      redmineByDate[entry.date].push(entry);
    });

    // Проверяем каждую запись из Tempo
    for (const tempoEntry of tempoEntries) {
      const redmineEntriesForDate = redmineByDate[tempoEntry.date] || [];

      // Ищем совпадение
      const match = this.findMatch(tempoEntry, redmineEntriesForDate);

      if (match) {
        matched.push({
          tempo: tempoEntry,
          redmine: match,
          matchType: "found",
        });
      } else {
        missingInRedmine.push(tempoEntry);
      }
    }

    // Считаем статистику
    const tempoTotalHours = tempoEntries.reduce((sum, e) => sum + e.hours, 0);
    const redmineTotalHours = redmineEntries.reduce(
      (sum, e) => sum + e.hours,
      0
    );
    const missingHours = missingInRedmine.reduce((sum, e) => sum + e.hours, 0);

    const missingInRedmineWithTasks = await this.addRedmineTasksToEntries(
      missingInRedmine,
      redmineSettings
    );

    return {
      missingInRedmine: missingInRedmineWithTasks,
      matched,
      stats: {
        tempoTotal: tempoEntries.length,
        redmineTotal: redmineEntries.length,
        missing: missingInRedmine.length,
        matched: matched.length,
        tempoHours: tempoTotalHours,
        redmineHours: redmineTotalHours,
        missingHours: missingHours,
      },
    };
  }

  static async addRedmineTasksToEntries(entries, redmineSettings) {
    const jiraKeys = new Set();
    entries.forEach((e) => e.jiraTask && jiraKeys.add(e.jiraTask));

    const redmineTasks = {};
    const promises = Array.from(jiraKeys).map((key) =>
      searchIssues(key, redmineSettings)
    );

    const redmineResults = await Promise.all(promises);
    redmineResults.forEach((result, i) => {
      const key = Array.from(jiraKeys)[i];
      if (result.issues.length > 0) {
        redmineTasks[key] = result.issues[0].id;
      }
    });

    return entries.map((entry) => ({
      ...entry,
      redmineTask: redmineTasks[entry.jiraTask],
    }));
  }

  /**
   * Найти совпадение для записи из Tempo
   * @param {Object} tempoEntry - Запись из Tempo
   * @param {Array} redmineEntries - Записи из Redmine за тот же день
   * @returns {Object|null} Найденное совпадение или null
   */
  static findMatch(tempoEntry, redmineEntries) {
    for (const redmineEntry of redmineEntries) {
      // Сначала проверяем по Jira задаче (самый точный способ)
      if (tempoEntry.jiraTask && redmineEntry.jiraTask) {
        if (tempoEntry.jiraTask === redmineEntry.jiraTask) {
          // Проверяем время (допускаем небольшую разницу)
          const hoursDiff = Math.abs(tempoEntry.hours - redmineEntry.hours);
          if (hoursDiff < 0.1) {
            return redmineEntry;
          }
        }
      }

      // Если нет Jira задач, проверяем по Redmine задаче и времени
      if (tempoEntry.redmineTask && redmineEntry.redmineTask) {
        if (tempoEntry.redmineTask === redmineEntry.redmineTask) {
          const hoursDiff = Math.abs(tempoEntry.hours - redmineEntry.hours);
          if (hoursDiff < 0.1) {
            return redmineEntry;
          }
        }
      }

      // Последний шанс - по времени и похожему описанию
      const hoursDiff = Math.abs(tempoEntry.hours - redmineEntry.hours);
      if (hoursDiff < 0.1) {
        const descSimilarity = this.calculateSimilarity(
          tempoEntry.description,
          redmineEntry.description
        );
        if (descSimilarity > 0.8) {
          return redmineEntry;
        }
      }
    }

    return null;
  }

  /**
   * Простое вычисление схожести строк
   * @param {string} str1 - Первая строка
   * @param {string} str2 - Вторая строка
   * @returns {number} Схожесть от 0 до 1
   */
  static calculateSimilarity(str1, str2) {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;

    // Простая проверка на включение одной строки в другую
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    return 0;
  }
}

export default SimpleTimeComparisonUtils;
