const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: 'whiskay-bot',
      cwd: projectRoot,
      script: path.join(projectRoot, 'scripts', 'start.mjs'),
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      instance_var: 'NODE_APP_INSTANCE',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      min_uptime: '10s',
      max_memory_restart: '512M',
      kill_timeout: 12000,
      env: { NODE_ENV: 'production', ENV_RELOAD_ENABLED: 'true' },
    },
  ],
};
