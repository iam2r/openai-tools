require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const app = express();
const port = 3000;
const tokens = (process.env.TOKENS || '').split(' ').map((token) => token);
const tokensMap = new Map();
const whitelist = ['/health', ...['/api/auth'].map((it) => `/${process.env.PROXY_API_PREFIX}${it}`)];
const maxRetries = 1;

function createDebouncedRequestMerger() {
	const requestMap = new Map();
	return function mergeRequests(key, requestFunction) {
		if (!requestMap.has(key)) {
			const requestPromise = requestFunction().finally(() => {
				requestMap.delete(key);
			});
			requestMap.set(key, requestPromise);
		}

		return requestMap.get(key);
	};
}

app.use(cors());

const mergeLoginRequests = createDebouncedRequestMerger();

async function getAccessToken(token) {
	const [username, password] = token.split(',') || [];
	if (username && password) {
		return (
			tokensMap.get(token) ||
			(await mergeLoginRequests(token, async () => {
				const apiUrl = `http://localhost:8181/${process.env.PROXY_API_PREFIX}/api/auth/login`;
				const formData = new URLSearchParams();
				formData.append('username', username);
				formData.append('password', password);
				const response = await fetch(apiUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: formData,
				});
				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status}`);
				}
				const data = await response.json();
				const access_token = data.access_token;
				tokensMap.set(token, access_token);
				return access_token;
			}))
		);
	}
	return token;
}

const createAuthenticateHandle = () => async (req, res, next) => {
	const needCheck = !whitelist.some((prefix) => req.originalUrl.includes(prefix));
	const { authorization = '' } = req.headers;
	const accessToken = process.env.OPENAI_API_ACCESS_TOKEN || (await getAccessToken(tokens[Math.floor(Math.random() * tokens.length)]));
	needCheck && authorization === `Bearer ${process.env.ACCESS_CODE}` && (req.headers.authorization = `Bearer ${accessToken}`);
	next();
};

const createOpenAIHandle = () => async (req, res, next) => {
	req.retryCount = req.retryCount || 0;
	createProxyMiddleware({
		target: process.env.OPENAI_API_REVERSE_PROXY_URL || 'http://localhost:8181',
		changeOrigin: true,
		ws: true,
		onError: (err, req, res) => {
			console.error('Proxy Error:', err);
			if (req.retryCount < maxRetries) {
				req.retryCount++;
				console.log(`Retrying (${req.retryCount}/${maxRetries})...`);
				createOpenAIHandle(req, res, next);
			} else {
				console.error('Max retries reached. Giving up.');
				res.status(500).send('Internal Server Error');
			}
		},
	})(req, res, next);
};

app.use('*', createAuthenticateHandle(), createOpenAIHandle());

app.listen(port, () => {
	console.log(`Server is running at http://localhost:${port}`);
});
