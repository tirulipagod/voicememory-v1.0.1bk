const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const inputPath = path.resolve(__dirname, 'assets', 'gpt loop.mp4');
const outputPath = path.resolve(__dirname, 'assets', 'gpt loop.webp');

console.log('Compressing GPT Loop MP4 to small transparent WebP...');

if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
}

// Compress to 250x250, drop to 15fps, medium quality. Essential for React Native Android hardware decoding limits.
const cmd = `"${ffmpeg}" -i "${inputPath}" -vf "fps=15,scale=250:-1,chromakey=0x00FF00:0.35:0.1" -vcodec libwebp -lossless 0 -qscale 30 -loop 0 -an -y "${outputPath}"`;

try {
    execSync(cmd, { stdio: 'inherit' });
    console.log('Success!');
} catch (error) {
    console.error('Conversion Failed', error);
}
