export function installErrorHandling({ app, errors, target = window, logger = console }) {
  const previousHandler = app.config.errorHandler;
  function report(cause, context) {
    logger.error('Renderer error:', context, cause);
    errors.report(cause);
  }
  const vueHandler = (cause, _instance, context) => report(cause, context);
  const rejectionHandler = (event) => {
    event.preventDefault();
    report(event.reason, 'unhandled rejection');
  };
  const errorHandler = (event) => {
    if (!event.error) return; // Resource failures are not executable exceptions.
    event.preventDefault();
    report(event.error, 'window error');
  };
  app.config.errorHandler = vueHandler;
  target.addEventListener('unhandledrejection', rejectionHandler);
  target.addEventListener('error', errorHandler);
  return () => {
    if (app.config.errorHandler === vueHandler) app.config.errorHandler = previousHandler;
    target.removeEventListener('unhandledrejection', rejectionHandler);
    target.removeEventListener('error', errorHandler);
  };
}
