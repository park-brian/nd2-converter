const path = require('path');
const convert = require('./convert');

const start = new Date().getTime();

try {
    convert({
        // inputFile: path.resolve(__dirname, 'input', 'small_image.nd2'),
        inputFile: 'D:\\Development\\Projects\\nd2-converter\\uploads\\4342a31c08470f9bc74dc6ae475c5eac\\MeOh_high_fluo_011.nd2',
        outputFile: path.resolve(__dirname, 'input', 'med_image.ome.tiff'), // extension specifies output format
        tileSizeX: 512,
        tileSizeY: 512,
        pyramidResolutions: 4,
        pyramidScale: 3,
    })
} catch (e) {
    e.stdout && console.log('stdout', String(e.stdout))
    e.stderr && console.log('stderr', String(e.stdout))

} finally {
    const duration = new Date().getTime() - start;
    console.log(duration / 1000);
}

