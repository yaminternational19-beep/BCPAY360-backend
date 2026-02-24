module.exports = {
    apps: [
        {
            name: "hris-backend",
            script: "./src/server.js",

            // Execution mode
            exec_mode: "cluster",
            instances: 2, // Use 2 instances or 'max' for all CPU cores

            // Environment
            env: {
                NODE_ENV: "production",
                PORT: 5000,
            },

            // Auto-restart configuration
            autorestart: true,
            watch: false, // Set to true only in development
            max_memory_restart: "500M",

            // Restart delay
            restart_delay: 4000,

            // Logging
            error_file: "./logs/pm2-error.log",
            out_file: "./logs/pm2-out.log",
            log_file: "./logs/pm2-combined.log",
            time: true,

            // Merge logs from all instances
            merge_logs: true,

            // Advanced features
            kill_timeout: 5000,
            listen_timeout: 3000,

            // Environment-specific configurations
            env_production: {
                NODE_ENV: "production",
            },
            env_development: {
                NODE_ENV: "development",
                watch: true,
            },
        },
    ],
};
