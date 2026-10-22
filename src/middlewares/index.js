import cooldown from './cooldown.js';
import rateLimit from './rateLimit.js';
import energyWorker from './energy-worker.js';
export const baseMiddlewares = [rateLimit, cooldown, energyWorker];
