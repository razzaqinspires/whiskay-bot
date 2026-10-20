import cooldown from './cooldown.js';
import rateLimit from './rateLimit.js';
export const baseMiddlewares = [rateLimit, cooldown];
