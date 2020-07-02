const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const AWS = require('aws-sdk');
const formidable = require('formidable');
const config = require('./config.json');
const logger = require('./utils/logger');

const form = formidable({ 
    multiples: true, 
    uploadDir: config.uploads.folder,
    maxFileSize: 2 * 1024**3, // 2 gb
});

if (config.aws) {
    AWS.config.update(config.aws);
}

// create express app
const app = express();

// serve public folder
app.use(express.static('client'));

// log requests
app.use((request, response, next) => {
    logger.info([request.url, JSON.stringify(request.form)].join(' '));
    next();
});

// parse multipart/form-data files
app.use((request, response, next) => {
    form.parse(request, (error, fields, files) => {
        if (error) {
            next(error);
        }
        else {
            request.form = fields;
            request.files = files;
            next();
        }
    });
});

// healthcheck route
app.get('/ping', (request, response) => {
    response.json(true);
});

// handle queue submission
app.post('/submit', async (request, response) => {
    try {
        // update aws configuration if all keys are supplied, otherwise
        // fall back to default credentials/IAM role
        const s3 = new AWS.S3();
        const sqs = new AWS.SQS();

        let params = request.form;
        let files = Array.isArray(request.files.inputFiles) 
            ? request.files.inputFiles
            : [request.files.inputFiles];
        
        console.log(request.form);
        console.log(request.files);

        params.id = crypto.randomBytes(16).toString('hex');
        params.originalTimestamp = new Date().getTime();
        params.files = [];
        
        for (let file of files) {
            let s3Object = {
                Bucket: config.s3.bucket,
                Key: `${config.s3.inputPrefix}${params.id}/${file.name}`,
                Body: await fs.readFile(file.path),
            };
            params.files.push({
                bucket: s3Object.Bucket,
                key: s3Object.Key,
            });
            await s3.putObject(s3Object).promise();
        }

        console.log(params);

        // maximum message size is 256 KB
        const results = await sqs.sendMessage({
            QueueUrl: config.queue.url,
            MessageBody: JSON.stringify(params),
        }).promise();

        logger.info(`Queued message: ${results.MessageId}`);
        response.end('Your request has been submitted and will be processed shortly. Results will be sent to the specified email.');

    } catch(error) {
        logger.error(error);
        response.status(500).end('Your request could not be processed due to an internal error.');
    }
});

// start application
app.listen(config.port, async () => {
    logger.info(`Application is running on port: ${config.port}`)

    // create required folders 
    const requiredFolders = [
        config.logs.folder, 
        config.uploads.folder,
    ];
    for (let folder of requiredFolders) {
        await fs.mkdir(folder, {recursive: true});
    }
});