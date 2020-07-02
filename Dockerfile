FROM node:latest

RUN apt update 
 && apt install -y openjdk-8-jre

COPY . /deploy

WORKDIR /deploy

RUN pushd server/bftools
 && chmod +x bfconvert bf.sh
 && popd

RUN npm install

CMD node