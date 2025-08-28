# Tempo API Integration

Этот модуль предоставляет интеграцию с Tempo Timesheets API для получения и управления данными о времени в Jira.

## Настройка

### 1. Получение API токена

1. Зайдите в Tempo в вашем Jira
2. Перейдите в **Settings** → **API Integration**
3. Создайте новый API токен
4. Скопируйте токен (он показывается только один раз!)

### 2. Конфигурация

```javascript
const tempoSettings = {
  apiToken: "your-tempo-api-token", // Tempo API токен
};
```

**Важно:** Этот модуль использует официальный Tempo API v4 (`https://api.tempo.io/4/`), а не внутренний API Jira. Это означает, что вам не нужно указывать URL вашего Jira - все запросы идут напрямую к серверам Tempo.

## Основные функции

### Тестирование подключения

```javascript
import { testConnection } from "./tempo.js";

const result = await testConnection(tempoSettings);
if (result.success) {
  console.log("Подключение успешно!", result.user);
} else {
  console.error("Ошибка подключения:", result.error);
}
```

### Получение worklogs за месяц

```javascript
import { getCurrentUserWorklogsForMonth } from "./tempo.js";

// Получить worklogs текущего пользователя за декабрь 2024
const result = await getCurrentUserWorklogsForMonth(2024, 12, tempoSettings);

if (result.success) {
  console.log(`Найдено ${result.total} записей`);
  console.log(`Общее время: ${result.totalHours} часов`);

  // Worklogs сгруппированы по датам
  Object.entries(result.worklogsByDate).forEach(([date, worklogs]) => {
    const dailyHours = worklogs.reduce(
      (sum, w) => sum + w.timeSpentSeconds / 3600,
      0
    );
    console.log(
      `${date}: ${dailyHours.toFixed(2)}ч (${worklogs.length} записей)`
    );
  });
}
```

### Экспорт данных

```javascript
import { exportWorklogs } from "./tempo.js";

// Экспорт в CSV
const csvResult = await exportWorklogs(worklogs, "csv");
if (csvResult.success) {
  // Сохранить или отправить CSV данные
  console.log(csvResult.data);
}

// Экспорт в JSON
const jsonResult = await exportWorklogs(worklogs, "json");
```

## Структура данных

### Worklog объект

```javascript
{
  "tempoWorklogId": 12345,
  "jiraWorklogId": 67890,
  "issue": {
    "key": "PROJ-123",
    "id": 10001
  },
  "timeSpentSeconds": 7200, // 2 часа
  "startDate": "2024-12-15",
  "startTime": "09:00:00",
  "description": "Работа над задачей",
  "author": {
    "accountId": "user-account-id",
    "displayName": "Иван Иванов"
  },
  "attributes": [] // Кастомные поля
}
```

### Результат getWorklogsForMonth

```javascript
{
  "success": true,
  "worklogs": [...], // Массив worklog объектов
  "worklogsByDate": {
    "2024-12-01": [...], // Worklogs за 1 декабря
    "2024-12-02": [...], // Worklogs за 2 декабря
    // ...
  },
  "totalHours": 160.5, // Общее количество часов
  "period": {
    "year": 2024,
    "month": 12,
    "startDate": "2024-12-01",
    "endDate": "2024-12-31"
  },
  "total": 45 // Общее количество записей
}
```

## Примеры использования

Смотрите файл `tempo-example.js` для подробных примеров:

- Тестирование подключения
- Получение worklogs за текущий месяц
- Получение worklogs за конкретный месяц
- Экспорт данных в CSV
- Статистика за несколько месяцев

## API Endpoints

Модуль использует следующие официальные Tempo API v4 endpoints:

- `GET https://api.tempo.io/4/user` - Информация о текущем пользователе
- `GET https://api.tempo.io/4/worklogs` - Получение worklogs
- `POST https://api.tempo.io/4/worklogs` - Создание worklog
- `PUT https://api.tempo.io/4/worklogs/{id}` - Обновление worklog
- `DELETE https://api.tempo.io/4/worklogs/{id}` - Удаление worklog
- `GET https://api.tempo.io/4/work-attributes` - Получение кастомных полей

## Обработка ошибок

Все функции возвращают объект с полем `success`:

```javascript
const result = await someTempoFunction();

if (result.success) {
  // Успешный результат
  console.log(result.data);
} else {
  // Ошибка
  console.error(result.error);
}
```

## Ограничения и рекомендации

1. **Rate Limiting**: Tempo API имеет ограничения на количество запросов. Используйте задержки между запросами.

2. **Batch Operations**: При массовых операциях используйте `batchCreateWorklogs` с прогресс-коллбеком.

3. **Время**: Все время хранится в секундах. Для конвертации в часы делите на 3600.

4. **Даты**: Используйте формат `YYYY-MM-DD` для дат.

5. **Аутентификация**: API токен должен храниться безопасно и не попадать в git.

## Интеграция с расширением

Для интеграции с основным расширением:

1. Добавьте настройки Tempo в `options.html`
2. Сохраняйте токен в `chrome.storage.local`
3. Используйте функции в `background.js` или content scripts
4. Добавьте UI для отображения данных Tempo

## Troubleshooting

### Ошибка 401 (Unauthorized)

- Проверьте правильность API токена
- Убедитесь, что токен не истёк
- Проверьте права доступа пользователя

### Ошибка 403 (Forbidden)

- Недостаточно прав для доступа к данным
- Обратитесь к администратору Tempo

### Ошибка 404 (Not Found)

- Проверьте правильность URL Jira
- Убедитесь, что Tempo установлен и активен

### Пустой результат

- Проверьте диапазон дат
- Убедитесь, что у пользователя есть worklogs за указанный период
