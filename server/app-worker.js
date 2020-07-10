const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
    for (let folder of [config.logs.folder, config.uploads.folder]) {
        fs.mkdirSync(folder, {recursive: true});
    }

    receiveMessage();
})();

/**
 * Reads a template, substituting {tokens} with data values
 * @param {string} filepath 
 * @param {object} data 
 */
async function readTemplate(filePath, data) {
    const template = await fs.promises.readFile(path.resolve(filePath));
  
    // replace {tokens} with data values or removes them if not found
    return String(template).replace(
      /{[^{}]+}/g,
      key => data[key.replace(/[{}]+/g, '')] || ''
    );
}

/**
 * Writes the contents of a stream to a file and resolves once complete
 * @param {*} readStream 
 * @param {*} filePath 
 */
function streamToFile(readStream, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        const stream = readStream.pipe(file);
        stream.on('error', error => reject(error));
        stream.on('close', _ => resolve());
    });
}

/**
 * Processes a message and sends emails when finished
 * @param {object} params 
 */
async function processMessage(message) {
    // validate message
    if (!message ||
        !message.Records || 
        !message.Records.length || 
        !message.Records[0].eventName.includes('ObjectCreated') || 
        !message.Records[0].s3) {
        logger.info(`Invalid message`);
        logger.info(message)
        return false;
    }

    let params;
    const s3 = new AWS.S3();
    const email = nodemailer.createTransport({
        SES: new AWS.SES()
    });

    try {
        logger.info(`Processing S3 Event: ${JSON.stringify(message, null, 2)}`);
        const [record] = message.Records;
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key).replace(/\+/g, ' ');
        const startTime = new Date().getTime();

        // fetch s3 object metadata (all metadata keys are lowercase)
        logger.info(`Downloading file: ${key}`);
        const { Metadata : metadata } = await s3.headObject({
            Bucket: bucket,
            Key: key
        }).promise();
        params = {
            id: metadata.id || crypto.randomBytes(16).toString('hex'),
            email: metadata.email,
            tileSizeX: metadata.tile_size_x || 512,
            tileSizeY: metadata.tile_size_y || 512,
            pyramidResolutions: metadata.pyramid_resolutions || 4,
            pyramidScale: metadata.pyramid_scale || 3,
            timestamp: record.eventTime
        };

        console.log(params);

        const targetFormat = '.ome.tiff';
        const inputFileName = path.basename(key);
        const outputFileName = path.basename(key, path.extname(key)) + targetFormat;
        const processingFolder = path.resolve(config.uploads.folder, params.id);
        const inputFilePath = path.resolve(processingFolder, inputFileName);
        const outputFilePath = path.resolve(processingFolder, outputFileName);
        const outputPath = path.dirname(key.replace(config.s3.inputPrefix, config.s3.outputPrefix)) + '/';
        const outputS3Key = `${outputPath}${outputFileName}`;
        fs.mkdirSync(processingFolder, {recursive: true});
        
        // write s3 object to local file
        await streamToFile(
            s3.getObject({
                Bucket: bucket,
                Key: key
            }).createReadStream(), 
            inputFilePath
        );

        logger.info(`Processing file: ${inputFileName}`);
        convert({
            inputFile: inputFilePath,
            outputFile: outputFilePath,
            tileSizeX: params.tileSizeX,
            tileSizeY: params.tileSizeY,
            pyramidResolutions: params.pyramidResolutions,
            pyramidScale: params.pyramidScale,
        });

        logger.info(`Uploading file to S3: ${outputS3Key}`);
        await s3.upload({
            Body: fs.createReadStream(outputFilePath),
            Bucket: config.s3.bucket,
            Key: outputS3Key,
        }).promise();

        // remove local files
        await fs.promises.rmdir(processingFolder, {recursive: true});

        // create signed url which expires in 2 weeks
        const url = s3.getSignedUrl('getObject', {
            Bucket: config.s3.bucket,
            Key: outputS3Key,
            Expires: 60 * 60 * 24 * 14, 
        });
        logger.info(`Generated URL: ${url}`);

        if (params.email) {
            // specify template variables
            const templateData = {
                originalTimestamp: params.timestamp,
                resultsUrls: [{outputFileName, url}].map(s => `<li><a href="${s.url}">${s.outputFileName}</a></li>`).join(''),
            };
            // send user success email
            logger.info(`Sending user success email`);
            const userEmailResults = await email.sendMail({
                from: config.email.sender,
                to: params.email,
                subject: 'Conversion Results',
                html: await readTemplate(__dirname + '/templates/user-success-email.html', templateData),
            });
        }

        const elapsedTime = new Date().getTime() - startTime;
        logger.info(`Finished job (${params.id}) in ${elapsedTime / 1000}s`);
        return true;
    } catch (e) {
        console.log(e);
        // catch exceptions related to conversion (assume s3/ses configuration is valid)
        logger.error(e);

        // template variables
        const templateData = {
            id: params.id,
            parameters: JSON.stringify(params, null, 4),
            originalTimestamp: params.timestamp,
            exception: e.toString(),
            processOutput: e.stdout ? e.stdout.toString() : null,
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
        if (params.email) {
            logger.info(`Sending user error email`);
            const userEmailResults = await email.sendMail({
                from: config.email.sender,
                to: params.email,
                subject: 'Conversion Error',
                html: await readTemplate(__dirname + '/templates/user-failure-email.html', templateData),
            });
        }

        return false;
    }
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
        setTimeout(receiveMessage, config.queue.pollInterval * 1000);
    }
}

