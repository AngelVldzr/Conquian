(() => {
  const config = window.POSTHOG_CONFIG;
  const missingVariable = !config || !config.key ? 'POSTHOG_KEY' : !config.host ? 'POSTHOG_HOST' : null;

  if (missingVariable) {
    if (config?.development) {
      throw new Error(`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`);
    }
    return;
  }

  const script = document.createElement('script');
  script.src = `${config.host.replace(/\/+$/, '')}/static/array.js`;
  script.onload = () => window.posthog.init(config.key, {
    api_host: config.host,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  });
  document.head.appendChild(script);
})();
