require('./config');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const cors = require('cors');
const lodash = require('lodash');
const app = express();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const port = process.env.PORT_MAIN;

const createOpenAIHandle =
	(options = {}) =>
	async (req, res, next) => {
		req.retryCount = req.retryCount || 0;
		const { authorizationHandler, proxyOptions } = lodash.merge(
			{
				authorizationHandler: createBaseAuthorizationHandler(options.apiKey),
				proxyOptions: {
					changeOrigin: true,
					ws: true,
				},
			},
			options
		);
		authorizationHandler(req);
		createProxyMiddleware(proxyOptions)(req, res, next);
	};

app.use(cors());
app.use(express.json());

const createBaseAuthorizationHandler = (token) => (req) => {
	if (req.headers.authorization === `Bearer ${process.env.ACCESS_CODE}` && token) {
		req.headers.authorization = `Bearer ${token}`;
	}
};

const createBaseBodyModified =
	(callback = (originalBody) => originalBody) =>
	(proxyReq, req) => {
		const originalBody = req.body;
		const modifiedParamsString = JSON.stringify(
			callback({
				...originalBody,
			})
		);
		proxyReq.setHeader('Content-Type', 'application/json');
		proxyReq.setHeader('Content-Length', Buffer.byteLength(modifiedParamsString));
		proxyReq.write(modifiedParamsString);
		proxyReq.end();
	};

const createKimiOptions = (useSearch = false) => {
	return {
		apiKey: process.env.KIMI_TOKEN,
		onProxyReq: createBaseBodyModified((originalBody) => {
			return {
				...originalBody,
				use_search: useSearch,
			};
		}),
	};
};

[
	{
		prefix: 'cohere',
		target: 'https://cohere.181918.xyz',
		apiKey: process.env.COHERE_TOKEN,
	},
	{
		prefix: 'kimi',
		target: 'https://kimi.181918.xyz',
		...createKimiOptions(),
	},
	{
		prefix: 'kimi-search',
		target: 'https://kimi.181918.xyz',
		...createKimiOptions(true),
	},
].forEach(({ prefix, target, authorizationHandler, onProxyReq, apiKey = '' }) => {
	const options = lodash.merge(
		{},
		{
			apiKey,
			proxyOptions: {
				target,
				pathRewrite: {
					[`^/${prefix}`]: '',
				},
				...(onProxyReq ? { onProxyReq } : {}),
			},
		},
		authorizationHandler ? { authorizationHandler } : {}
	);
	app.use(`/${prefix}`, createOpenAIHandle(options));
});

app.get('/healthcheck', (req, res) => {
	res.status(200).json({ status: 'OK' });
});

async function fileToGenerativePart(file) {
	return {
		inlineData: {
			data: file.buffer.toString('base64'),
			mimeType: file.mimetype,
		},
	};
}

app.post('/recognize', upload.single('file'), async (req, res) => {
	const file = req.file;
	const { prompt } = req.body;
	try {
		const { GOOGLE_GEMININ_API_KEY } = process.env;
		let apiKey = '';
		const authorization = lodash.get(req, 'headers.authorization');
		if (authorization === `Bearer ${process.env.ACCESS_CODE}`) {
			apiKey = GOOGLE_GEMININ_API_KEY;
		} else {
			apiKey = authorization.replace('Bearer ', '');
		}
		const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
			model: 'gemini-pro-vision',
		});
		const imageParts = await Promise.all([fileToGenerativePart(file)]);
		const result = await model.generateContent([prompt || '请描述并提取一下图片内容', ...imageParts]);
		const response = result.response;
		const text = response.text();
		res.status(200).json({
			text,
		});
	} catch (error) {
		console.error('Error generateContent:', error);
		res.status(500).json({ error: 'Error generateContent' });
	}
});

app.listen(port, () => {
	console.log('📝 Author: Razo');
	console.log('🌍 GitHub Repository: https://github.com/iam2r/openai-tools');
	console.log(`💖 Don't forget to star the repository if you like this project!`);
	console.log();
	console.log(`Server is running at http://localhost:${port}`);
});

const keepAlive = () => {
	if (!process.env.KEEP_ALIVE_URLS) return;
	const urls = (process.env.KEEP_ALIVE_URLS || '').split(',');
	if (urls.length) {
		console.log(`${process.env.KEEP_ALIVE_URLS} is keepalive !`);
		setInterval(() => {
			Promise.all(urls.map((url) => fetch(url)));
		}, 60 * 1000 * 5);
	}
};

keepAlive();
