const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const config = require('./config.json');
const logger = require('./utils/logger');
const convert = require('./convert');

(async function main() {
    // update aws configuration if all keys are supplied, otherwise
    // fall back to default credentials/IAM role
    if (config.aws) {
        AWS.config.update(config.aws);
    }

    // create required folders 
    const requiredFolders = [
        config.logs.folder, 
        config.uploads.folder,
    ];
    for (let folder of requiredFolders) {
        await fs.mkdir(folder, {recursive: true});
    }

    receiveMessage();
})()

/**
 * Processes a message and sends emails when finished
 * @param {object} params 
 */
async function processMessage(params) {
    const s3 = new AWS.S3();
    const email = nodemailer.createTransport({
        SES: new AWS.SES()
    });

    try {
        logger.info(`Processing: ${JSON.stringify(params, null, 2)}`);
        const { id, tileSizeX, tileSizeY, pyramidResolutions, pyramidScale, files } = params;
        let signedUrls = [];
        
        for (let {bucket, key} of files) {

            let inputFileName = path.basename(key);
            let outputFileName = path.basename(key, path.extname(key)) + '.ome.tif';

            let processingFolder = path.resolve(config.uploads.folder, id);
            let inputFilePath = path.resolve(processingFolder, inputFileName);
            let outputFilePath = path.resolve(processingFolder, outputFileName);
            let outputS3Key = `${config.s3.outputPrefix}${id}/${outputFileName}`;
            await fs.mkdir(processingFolder, {recursive: true});

            logger.info(`Downloading file: ${key}`);
            const s3Object = await s3.getObject({
                Bucket: bucket,
                Key: key
            }).promise();
            await fs.writeFile(inputFilePath, s3Object.Body);

            logger.info(`Processing file: ${inputFileName}`);
            convert({
                inputFile: inputFilePath,
                outputFile: outputFilePath,
                tileSizeX,
                tileSizeY,
                pyramidResolutions,
                pyramidScale,
            });

            logger.info(`Uploading file to S3: ${outputS3Key}`);
            await s3.putObject({
                Body: await fs.readFile(outputFilePath),
                Bucket: config.s3.bucket,
                Key: outputS3Key,
            }).promise();

            const url = s3.getSignedUrl('getObject', {
                Bucket: config.s3.bucket,
                Key: outputS3Key
            });
            signedUrls.push({outputFileName, url});
            logger.info(`Generated URL: ${url}`);
        }
        
        // specify template variables
        const templateData = {
            originalTimestamp: new Date(params.originalTimestamp).toLocaleString(),
            resultsUrls: signedUrls.map(s => `<li><a href="${s.url}">${s.outputFileName}</a></li>`).join(''),
        };

        // send user success email
        logger.info(`Sending user success email`);
        const userEmailResults = await email.sendMail({
            from: config.email.sender,
            to: params.email,
            subject: 'Conversion Results',
            html: await readTemplate(__dirname + '/templates/user-success-email.html', templateData),
        });
        return true;
    } catch (e) {
        // catch exceptions related to conversion (assume s3/ses configuration is valid)
        logger.error(e);

        // template variables
        const templateData = {
            id: params.id,
            parameters: JSON.stringify(params, null, 4),
            originalTimestamp: new Date(params.originalTimestamp).toLocaleString(),
            exception: e.toString(),
            supportEmail: config.email.admin,
        };

        // send admin error email
        logger.info(`Sending admin error email`);
        const adminEmailResults = await email.sendMail({
            from: config.email.sender,
            to: config.email.admin,
            subject: `Conversion Error: ${params.id}`, // searchable calculation error subject
            html: await readTemplate(__dirname + '/templates/admin-failure-email.html', templateData),
        });

        // send user error email
        logger.info(`Sending user error email`);
        const userEmailResults = await email.sendMail({
            from: config.email.sender,
            to: params.email,
            subject: 'Conversion Error',
            html: await readTemplate(__dirname + '/templates/user-failure-email.html', templateData),
        });

        return false;
    }
}

/**
 * Reads a template, substituting {tokens} with data values
 * @param {string} filepath 
 * @param {object} data 
 */
async function readTemplate(filePath, data) {
    const template = await fs.readFile(path.resolve(filePath));
  
    // replace {tokens} with data values or removes them if not found
    return String(template).replace(
      /{[^{}]+}/g,
      key => data[key.replace(/[{}]+/g, '')] || ''
    );
}

/**
 * Receives messages from the queue at regular intervals,
 * specified by config.pollInterval
 */
async function receiveMessage() {
    const sqs = new AWS.SQS();

    try {
        // to simplify running multiple workers in parallel, 
        // fetch one message at a time
        const data = await sqs.receiveMessage({
            QueueUrl: config.queue.url,
            VisibilityTimeout: config.queue.visibilityTimeout,
            MaxNumberOfMessages: 1
        }).promise();

        if (data.Messages && data.Messages.length > 0) {
            const message = data.Messages[0];
            const params = JSON.parse(message.Body);

            // while processing is not complete, update the message's visibilityTimeout
            const intervalId = setInterval(_ => sqs.changeMessageVisibility({
                QueueUrl: config.queue.url,
                ReceiptHandle: message.ReceiptHandle,
                VisibilityTimeout: config.queue.visibilityTimeout
            }), 1000 * 60);

            // processMessage should return a boolean status indicating success or failure
            const status = await processMessage(params);
            clearInterval(intervalId);
            
            // if message was not processed successfully, send it to the
            // error queue (add metadata in future if needed)
            if (!status) {
                await sqs.sendMessage({
                    QueueUrl: config.queue.errorUrl,
                    MessageBody: JSON.stringify(params),
                }).promise();
            }

            // remove original message from queue once processed
            await sqs.deleteMessage({
                QueueUrl: config.queue.url,
                ReceiptHandle: message.ReceiptHandle
            }).promise();
        }
    } catch (e) {
        // catch exceptions related to sqs
        logger.error(e);
    } finally {
        // schedule receiving next message
        setTimeout(receiveMessage, config.queue.pollInterval);
    }
}

