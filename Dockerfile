FROM sxz799/gemini2chatgpt as gemini2chatgpt
FROM ghcr.io/aurora-develop/aurora:latest as aurora
FROM node:18
ENV APP_HOME /node/app
WORKDIR $APP_HOME
RUN yarn global add pm2
RUN mkdir -p ./logs
COPY package*.json yarn*.lock $APP_HOME/
RUN yarn
COPY . $APP_HOME/


COPY --from=gemini2chatgpt . /gemini2chatgpt

COPY --from=aurora . /aurora
COPY --from=aurora ./app/harPool /app/harPool

EXPOSE 3000 

CMD ["sh","-c", "pm2-docker start pm2.config.js"]

#docker run --rm -e HTTP_PROXY=http://localhost:7890 -it -p 3000:3000/tcp openai-tools:latest


