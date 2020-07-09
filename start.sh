#!/bin/bash

docker build -t nd2-converter -f Dockerfile .

docker rm -f nd2-converter
docker run -d -p 9070:9000 --name nd2-converter --restart always nd2-converter npm start

for (( i=1; i<=${1:-4}; i++ ))
do  
    docker rm -f nd2-converter-worker-$i
    docker run -d --name nd2-converter-worker-$i --restart always nd2-converter npm run start-worker
done
