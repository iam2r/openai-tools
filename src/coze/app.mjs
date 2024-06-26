import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const app = express();
app.use(bodyParser.json());
const bot_id = process.env.BOT_ID || '';

app.get('/', (req, res) => {
	res.send(`
    <html>
      <head>
        <title>COZE2OPENAI</title>
      </head>
      <body>
        <h1>Coze2OpenAI</h1>
        <p>Congratulations! Your project has been successfully deployed.</p>
      </body>
    </html>
  `);
});

app.post('/v1/chat/completions', async (req, res) => {
	const authHeader = req.headers['authorization'] || req.headers['Authorization'];
	if (!authHeader) {
		return res.status(401).json({
			code: 401,
			errmsg: 'Unauthorized.',
		});
	} else {
		const token = authHeader.split(' ')[1];
		if (!token) {
			return res.status(401).json({
				code: 401,
				errmsg: 'Unauthorized.',
			});
		}
	}
	try {
		const data = req.body;
		const messages = data.messages;
		const chatHistory = [];
		for (let i = 0; i < messages.length - 1; i++) {
			const message = messages[i];
			const role = message.role;
			const content = message.content;

			chatHistory.push({
				role: role,
				content: content,
				content_type: 'text',
			});
		}

		const lastMessage = messages[messages.length - 1];
		const queryString = lastMessage.content;
		const stream = data.stream !== undefined ? data.stream : false;
		let requestBody;
		requestBody = {
			query: queryString,
			stream: stream,
			conversation_id: '',
			user: 'apiuser',
			bot_id: bot_id,
			chat_history: chatHistory,
		};

		const resp = await fetch('https://api.coze.com/open_api/v2/chat', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authHeader.split(' ')[1]}`,
			},
			body: JSON.stringify(requestBody),
		});
		if (stream) {
			res.setHeader('Content-Type', 'text/event-stream');
			const stream = resp.body;
			let buffer = '';

			stream.on('data', (chunk) => {
				buffer += chunk.toString();
				let lines = buffer.split('\n');

				for (let i = 0; i < lines.length - 1; i++) {
					let line = lines[i].trim();

					if (!line.startsWith('data:')) continue;
					line = line.slice(5).trim();
					let chunkObj;
					try {
						if (line.startsWith('{')) {
							chunkObj = JSON.parse(line);
						} else {
							continue;
						}
					} catch (error) {
						console.error('Error parsing chunk:', error);
						continue;
					}
					if (chunkObj.event === 'message') {
						if (chunkObj.message.role === 'assistant' && chunkObj.message.type === 'answer') {
							let chunkContent = chunkObj.message.content;

							if (chunkContent !== '') {
								const chunkId = `chatcmpl-${Date.now()}`;
								const chunkCreated = Math.floor(Date.now() / 1000);
								res.write(
									'data: ' +
										JSON.stringify({
											id: chunkId,
											object: 'chat.completion.chunk',
											created: chunkCreated,
											model: data.model,
											choices: [
												{
													index: 0,
													delta: {
														content: chunkContent,
													},
													finish_reason: null,
												},
											],
										}) +
										'\n\n'
								);
							}
						}
					} else if (chunkObj.event === 'done') {
						const chunkId = `chatcmpl-${Date.now()}`;
						const chunkCreated = Math.floor(Date.now() / 1000);
						res.write(
							'data: ' +
								JSON.stringify({
									id: chunkId,
									object: 'chat.completion.chunk',
									created: chunkCreated,
									model: data.model,
									choices: [
										{
											index: 0,
											delta: {},
											finish_reason: 'stop',
										},
									],
								}) +
								'\n\n'
						);
						res.write('data: [DONE]\n\n');
						res.end();
					} else if (chunkObj.event === 'ping') {
					} else if (chunkObj.event === 'error') {
						console.error(`Error: ${chunkObj.code}, ${chunkObj.message}`);
						res.status(500).write(`data: ${JSON.stringify({ error: chunkObj.message })}\n\n`);
						res.write('data: [DONE]\n\n');
						res.end();
					}
				}

				buffer = lines[lines.length - 1];
			});
		} else {
			resp
				.json()
				.then((data) => {
					if (data.code === 0 && data.msg === 'success') {
						const messages = data.messages;
						const answerMessage = messages.find((message) => message.role === 'assistant' && message.type === 'answer');

						if (answerMessage) {
							const result = answerMessage.content.trim();
							const usageData = {
								prompt_tokens: 100,
								completion_tokens: 10,
								total_tokens: 110,
							};
							const chunkId = `chatcmpl-${Date.now()}`;
							const chunkCreated = Math.floor(Date.now() / 1000);

							const formattedResponse = {
								id: chunkId,
								object: 'chat.completion',
								created: chunkCreated,
								model: req.body.model,
								choices: [
									{
										index: 0,
										message: {
											role: 'assistant',
											content: result,
										},
										logprobs: null,
										finish_reason: 'stop',
									},
								],
								usage: usageData,
								system_fingerprint: 'fp_2f57f81c11',
							};
							const jsonResponse = JSON.stringify(formattedResponse, null, 2);
							res.set('Content-Type', 'application/json');
							res.send(jsonResponse);
						} else {
							res.status(500).json({ error: 'No answer message found.' });
						}
					} else {
						res.status(500).json({ error: 'Unexpected response from Coze API.' });
					}
				})
				.catch((error) => {
					console.error('Error parsing JSON:', error);
					res.status(500).json({ error: 'Error parsing JSON response.' });
				});
		}
	} catch (error) {
		console.error('Error:', error);
	}
});

const port = 3042;
app.listen(port, () => {
	console.log(`💡 Server is running at http://localhost:${port}`);
});
