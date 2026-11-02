module.exports = {
  apps: [{
    name: 'whiskay-bot',
    script: './scripts/start.mjs',
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 3000,
    min_uptime: '10s',
    max_memory_restart: '512M',
    kill_timeout: 12000,
    env: { NODE_ENV: 'production', ENV_RELOAD_ENABLED: 'true' }
  }]
};
