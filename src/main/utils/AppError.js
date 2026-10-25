export class AppError extends Error {
  constructor(message, code = 'APPLICATION', options = {}) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.publicMessage = message;
  }
}
