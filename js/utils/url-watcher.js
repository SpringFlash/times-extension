function watchURL(onCreate, getUrlRegex) {
  let currentValue = null;
  let currentInstance = null;

  const checkURL = () => {
    const urlRegex = getUrlRegex();
    console.log("🎫 Url changed, regex:", urlRegex);

    const url = window.location.href;
    const newValueMatch = url.match(urlRegex);

    const newValue = newValueMatch ? newValueMatch[1] : null;

    console.log("🎫 Url values:", currentValue, "->", newValue);

    if (newValue !== currentValue) {
      if (currentInstance?.cleanup) {
        currentInstance.cleanup();
        currentInstance = null;
      }

      if (newValue) {
        currentInstance = onCreate();
      }

      currentValue = newValue;
    }
  };

  window.navigation.addEventListener("navigate", (event) => {
    setTimeout(() => checkURL(), 100);
  });

  checkURL();
}
