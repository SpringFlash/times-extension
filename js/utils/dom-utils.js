/**
 * DOM Utilities - общие функции для работы с DOM
 */

/**
 * Ожидание появления элемента в DOM
 * @param {string} selector - CSS селектор
 * @returns {Promise<Element>} - Promise с найденным элементом
 */
function waitElement(selector) {
  const hasElement = (resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
    }
  };

  return new Promise((resolve) => {
    hasElement(resolve);

    const observer = new MutationObserver(() => {
      hasElement(resolve);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Загрузка SVG иконки из файла
 * @param {HTMLElement} button - Кнопка для вставки иконки
 * @param {string} iconName - Имя файла иконки без расширения
 */
async function loadSVGIcon(button, iconName) {
  try {
    const iconUrl = chrome.runtime.getURL(`images/icons/${iconName}.svg`);
    const response = await fetch(iconUrl);
    const svgContent = await response.text();
    button.innerHTML = svgContent;
  } catch (error) {
    console.error(`Error loading ${iconName} icon:`, error);
    // Fallback - показываем эмодзи
    button.textContent = iconName === "branch" ? "🌿" : "📝";
  }
}

/**
 * Показать уведомление на странице
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип уведомления (success, error, warning, info)
 */
function showNotification(message, type = "info") {
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

/**
 * Копирование текста в буфер обмена с уведомлением
 * @param {string} text - Текст для копирования
 * @param {string} successMessage - Сообщение при успешном копировании
 * @param {string} errorMessage - Сообщение при ошибке
 */
async function copyToClipboard(text, successMessage, errorMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification(successMessage, "success");
  } catch (error) {
    console.error("Error copying to clipboard:", error);
    showNotification(errorMessage, "error");
  }
}
