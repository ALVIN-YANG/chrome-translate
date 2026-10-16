export class TranslationError extends Error {
  constructor(code, message) { super(message); this.name = 'TranslationError'; this.code = code; }
}
