#!/bin/sh

docker build -t nd2-converter -f Dockerfile .

docker rm -f nd2-converter
docker rm -f nd2-converter-worker

docker run -d -p 9070:9000 --name nd2-converter npm start
docker run -d --name nd2-converter-worker npm run start-worker