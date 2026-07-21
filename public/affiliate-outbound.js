(() => {
  if (navigator.webdriver) return;
  const form = document.getElementById('affiliate-outbound-form');
  if (!(form instanceof HTMLFormElement)) return;
  window.setTimeout(() => form.requestSubmit(), 450);
})();
