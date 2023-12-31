const config = {
	instances: 1,
	watch: false,
	autorestart: true,
	restart_delay: 5000,
	env: {
		NODE_ENV: 'production',
	},
	output: './logs/out.log',
	error: './logs/error.log',
	log_date_format: 'YYYY-MM-DD HH:mm:ss',
	max_size: '10M', // 设置每个日志文件的最大大小
	retain: 10, // 保留最近的10个日志文件
};
module.exports = {
	apps: [
		{
			...config,
			name: 'nodejs',
			script: 'app.js',
		},
		{
			...config,
			name: 'pandora-next',
			exec_mode: 'fork',
			script: '/opt/app/entrypoint.sh',
		},
		{
			...config,
			name: 'gemini2chatgpt',
			exec_mode: 'fork',
			script: '/gemini2chatgpt/home/app',
		},
	],
};
