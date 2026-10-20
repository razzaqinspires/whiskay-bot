import pino from 'pino';
import config from '../config/index.js';
export default pino({
  level: config.logLevel,
  transport: process.env.NODE_ENV === 'production' ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
});
