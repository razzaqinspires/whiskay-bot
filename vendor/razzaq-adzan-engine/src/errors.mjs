/** Base error for all domain-specific failures. */
export class AdzanEngineError extends Error {
  constructor(message, { code = 'ADZAN_ENGINE_ERROR', cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AdzanEngineError';
    this.code = code;
  }
}

export class ValidationError extends AdzanEngineError {
  constructor(message, options = {}) {
    super(message, { ...options, code: options.code ?? 'VALIDATION_ERROR' });
    this.name = 'ValidationError';
  }
}

export class SolarEventUnavailableError extends AdzanEngineError {
  constructor(eventName, message = `Solar event '${eventName}' is unavailable for this date and location.`) {
    super(message, { code: 'SOLAR_EVENT_UNAVAILABLE' });
    this.name = 'SolarEventUnavailableError';
    this.eventName = eventName;
  }
}
