FROM node:latest

RUN apt update \
 && apt install -y openjdk-8-jre

COPY . /deploy

WORKDIR /deploy

RUN chmod +x server/bftools/*

RUN npm install

CMD node