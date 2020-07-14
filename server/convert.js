const path = require('path');
const { execFileSync } = require('child_process');
module.exports = convert;

function convert(options) {  
    const scriptExt = process.platform === 'win32' ? '.bat' : '';
    const converter = path.resolve(__dirname, `bftools`, `bfconvert${scriptExt}`);
    return execFileSync(converter, [
        '-tilex', options.tileSizeX,
        '-tiley', options.tileSizeY,
        '-noflat',
        '-overwrite',
        '-bigtiff',
        '-pyramid-resolutions', options.pyramidResolutions,
        '-pyramid-scale', options.pyramidScale,
        options.inputFile,
        options.outputFile
    ], {
        env: {
            ...process.env,
            BF_MAX_MEM: '4g',
        }
    });
}