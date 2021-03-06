const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const AWS = require('aws-sdk');
const formidable = require('formidable');
const config = require('./config.json');
const logger = require('./utils/logger');

const form = formidable({ 
    multiples: true, 
    uploadDir: config.uploads.folder,
    maxFileSize: 100 * 1024**3, // 100 gb
});

if (config.aws) {
    AWS.config.update(config.aws);
}

// create express app
const app = express();

// serve public folder
app.use(express.static(config.server.static));

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

// log requests
app.use((request, response, next) => {
    logger.info([request.url, JSON.stringify(request.form)].join(' '));
    next();
});

// healthcheck route
app.get('/ping', (request, response) => {
    response.json(true);
});

// get job status
app.get('/status', async (request, response) => {
    const { Items } = await new AWS.DynamoDB().scan({
        TableName: config.dynamodb.table,
    }).promise();

    // map dynamodb items to regular objects
    const statusItems = Items.map(item => {
        let statusItem = {};
        for (let [key, value] of Object.entries(item)) {
            let [valueKey] = Object.keys(value);
            statusItem[key] = value[valueKey] === 'undefined' ? null : value[valueKey];
        }
        return statusItem;
    });

    response.json(statusItems);
});

// handle queue submission
app.post('/submit', async (request, response) => {
    try {
        // if needed, specify alternative region or credentials
        const s3 = new AWS.S3();
        const id = crypto.randomBytes(16).toString('hex');
        const { inputFile } = request.files;

        // use metadata to store conversion parameters
        // since metadata keys are converted to lowercase, do not use camelcase
        await s3.upload({
            Bucket: config.s3.bucket,
            Key: `${config.s3.inputPrefix}${id}/${inputFile.name}`,
            Body: fs.createReadStream(inputFile.path),
            Metadata: { 
                id, 
                email: request.form.email, 
                tile_size_x: request.form.tileSizeX, 
                tile_size_y: request.form.tileSizeY, 
                pyramid_resolutions: request.form.pyramidResolutions, 
                pyramid_Scale: request.form.pyramidScale 
            }
        }).promise();

        // clean up input file
        await fs.promises.unlink(inputFile.path);
        response.end('Your request has been submitted and will be processed shortly. Results will be sent to the specified email.');
    } catch(error) {
        logger.error(error);
        response.status(500).end('Your request could not be processed due to an internal error.');
    }
});

// start application
app.listen(config.server.port, async () => {
    logger.info(`Application is running on port: ${config.server.port}`)

    // create required folders 
    for (let folder of [config.logs.folder, config.uploads.folder]) {
        fs.mkdirSync(folder, {recursive: true});
    }
}).setTimeout(1000 * 60 * 60 * 6); // 6 hour request timeout