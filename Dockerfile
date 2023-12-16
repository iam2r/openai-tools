FROM pengzhile/pandora-next as pandora-next
WORKDIR /app
COPY . /app

FROM node:18 as builder
ARG LICENSE_ID
ARG TOKENS
ARG ACCESS_CODE
ARG PROXY_API_PREFIX
ENV LICENSE_ID=$LICENSE_ID
ENV TOKENS=$TOKENS
ENV ACCESS_CODE=$ACCESS_CODE
ENV PROXY_API_PREFIX=$PROXY_API_PREFIX

ENV APP_HOME /app
WORKDIR $APP_HOME
COPY package*.json yarn*.lock $APP_HOME/
RUN npm install
COPY pandora.js $APP_HOME/
# build pandora config
RUN LICENSE_ID=${LICENSE_ID} TOKENS=${TOKENS} ACCESS_CODE=${ACCESS_CODE} PROXY_API_PREFIX=${PROXY_API_PREFIX} npm run pandora

# copy pandora-next to right dir
COPY --from=pandora-next /app /
# copy pandora config to right dir
COPY /app/pandora/data /data
COPY /app/pandora/sessions /root/.cache/PandoraNext


EXPOSE 8181

CMD ["pandora-next"]
