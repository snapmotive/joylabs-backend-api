const logger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  debug: (...args) => console.debug(...args),
};

const logRequest = (req, res, next) => {
  logger.info('Request:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    headers: req.headers,
    query: req.query,
    body: req.body,
  });
  next();
};

module.exports = {
  logger,
  logRequest,
};
