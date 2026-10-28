module.exports = {
  apps: [{
    name: 'whiskay-bot',
    script: './src/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    min_uptime: '10s',
    max_memory_restart: '512M',
    env: { NODE_ENV: 'production' }
  }]
};
