/**
 * Tempo API Usage Examples
 *
 * Этот файл показывает, как использовать Tempo API для получения времени за месяц
 */

import {
  testConnection,
  getCurrentUser,
  getWorklogsForMonth,
  getCurrentUserWorklogsForMonth,
  exportWorklogs,
  batchCreateWorklogs,
} from "./tempo.js";

/**
 * Пример настроек для Tempo
 */
const exampleTempoSettings = {
  apiToken: "2BjAk7JNC8QYGGRnFv7VyMWQOFenG7-us", // Tempo API токен
};

/**
 * Пример 1: Тестирование подключения к Tempo
 */
export async function exampleTestConnection() {
  console.log("🔧 Testing Tempo connection...");

  const result = await testConnection(exampleTempoSettings);

  if (result.success) {
    console.log("✅ Connection successful!");
    console.log("User info:", result.user);
  } else {
    console.error("❌ Connection failed:", result.error);
  }

  return result;
}

/**
 * Пример 2: Получение worklogs текущего пользователя за текущий месяц
 */
export async function exampleGetCurrentMonthWorklogs() {
  console.log("📅 Getting current month worklogs...");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() returns 0-11

  const result = await getCurrentUserWorklogsForMonth(
    year,
    month,
    exampleTempoSettings
  );

  if (result.success) {
    console.log(`✅ Found ${result.total} worklogs for ${year}-${month}`);
    console.log(`Total hours: ${result.totalHours}`);
    console.log("Worklogs by date:", result.worklogsByDate);

    // Показываем первые 3 записи для примера
    if (result.worklogs.length > 0) {
      console.log("First 3 worklogs:");
      result.worklogs.slice(0, 3).forEach((worklog, index) => {
        console.log(
          `${index + 1}. ${worklog.startDate} - ${
            worklog.issue?.key || worklog.issue?.id || "No Issue"
          } - ${(worklog.timeSpentSeconds / 3600).toFixed(2)}h - ${
            worklog.description
          }`
        );
      });
    }
  } else {
    console.error("❌ Failed to get worklogs:", result.error);
  }

  return result;
}

/**
 * Пример 3: Получение worklogs за конкретный месяц (например, декабрь 2024)
 */
export async function exampleGetSpecificMonthWorklogs() {
  console.log("📅 Getting December 2024 worklogs...");

  const result = await getCurrentUserWorklogsForMonth(
    2024,
    12,
    exampleTempoSettings
  );

  if (result.success) {
    console.log(`✅ Found ${result.total} worklogs for December 2024`);
    console.log(`Total hours: ${result.totalHours}`);

    // Группируем по задачам
    const worklogsByIssue = {};
    result.worklogs.forEach((worklog) => {
      const issueKey = worklog.issue?.key || worklog.issue?.id || "No Issue";
      if (!worklogsByIssue[issueKey]) {
        worklogsByIssue[issueKey] = {
          totalHours: 0,
          entries: 0,
        };
      }
      worklogsByIssue[issueKey].totalHours += worklog.timeSpentSeconds / 3600;
      worklogsByIssue[issueKey].entries++;
    });

    console.log("Hours by issue:");
    Object.entries(worklogsByIssue).forEach(([issueKey, data]) => {
      console.log(
        `${issueKey}: ${data.totalHours.toFixed(2)}h (${data.entries} entries)`
      );
    });
  } else {
    console.error("❌ Failed to get worklogs:", result.error);
  }

  return result;
}

/**
 * Пример 4: Экспорт worklogs в CSV формат
 */
export async function exampleExportWorklogs() {
  console.log("📤 Exporting worklogs to CSV...");

  // Сначала получаем worklogs за текущий месяц
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const worklogsResult = await getCurrentUserWorklogsForMonth(
    year,
    month,
    exampleTempoSettings
  );

  if (!worklogsResult.success) {
    console.error(
      "❌ Failed to get worklogs for export:",
      worklogsResult.error
    );
    return worklogsResult;
  }

  // Экспортируем в CSV
  const exportResult = await exportWorklogs(worklogsResult.worklogs, "csv");

  if (exportResult.success) {
    console.log("✅ Export successful!");
    console.log("CSV data preview:");
    console.log(exportResult.data.split("\n").slice(0, 5).join("\n")); // Показываем первые 5 строк

    // В реальном приложении здесь можно сохранить файл или отправить пользователю
    // downloadCSV(exportResult.data, `tempo-worklogs-${year}-${month}.csv`);
  } else {
    console.error("❌ Export failed:", exportResult.error);
  }

  return exportResult;
}

/**
 * Пример 5: Получение статистики за несколько месяцев
 */
export async function exampleGetMultiMonthStats() {
  console.log("📊 Getting multi-month statistics...");

  const stats = {
    totalHours: 0,
    totalEntries: 0,
    monthlyBreakdown: [],
  };

  // Получаем данные за последние 3 месяца
  const now = new Date();
  const months = [];

  for (let i = 2; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      name: date.toLocaleString("ru-RU", { month: "long", year: "numeric" }),
    });
  }

  for (const monthInfo of months) {
    console.log(`Getting data for ${monthInfo.name}...`);

    const result = await getCurrentUserWorklogsForMonth(
      monthInfo.year,
      monthInfo.month,
      exampleTempoSettings
    );

    if (result.success) {
      stats.totalHours += result.totalHours;
      stats.totalEntries += result.total;
      stats.monthlyBreakdown.push({
        month: monthInfo.name,
        hours: result.totalHours,
        entries: result.total,
      });

      console.log(
        `✅ ${monthInfo.name}: ${result.totalHours}h (${result.total} entries)`
      );
    } else {
      console.error(
        `❌ Failed to get data for ${monthInfo.name}:`,
        result.error
      );
      stats.monthlyBreakdown.push({
        month: monthInfo.name,
        hours: 0,
        entries: 0,
        error: result.error,
      });
    }
  }

  console.log("\n📊 Summary:");
  console.log(`Total hours: ${stats.totalHours.toFixed(2)}`);
  console.log(`Total entries: ${stats.totalEntries}`);
  console.log(
    `Average hours per month: ${(stats.totalHours / months.length).toFixed(2)}`
  );

  return stats;
}

/**
 * Функция для демонстрации всех примеров
 */
export async function runAllExamples() {
  console.log("🚀 Running all Tempo API examples...\n");

  try {
    // 1. Тест подключения
    await exampleTestConnection();
    console.log("\n" + "=".repeat(50) + "\n");

    // 2. Текущий месяц
    await exampleGetCurrentMonthWorklogs();
    console.log("\n" + "=".repeat(50) + "\n");

    // 3. Конкретный месяц
    await exampleGetSpecificMonthWorklogs();
    console.log("\n" + "=".repeat(50) + "\n");

    // 4. Экспорт
    await exampleExportWorklogs();
    console.log("\n" + "=".repeat(50) + "\n");

    // 5. Статистика за несколько месяцев
    await exampleGetMultiMonthStats();

    console.log("\n✅ All examples completed!");
  } catch (error) {
    console.error("❌ Error running examples:", error);
  }
}

// Uncomment to run examples:
runAllExamples();
