const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const inputPath = path.resolve(__dirname, 'assets', 'reverse.mp4');
const outputPath = path.resolve(__dirname, 'assets', 'reverse.webp');

console.log('Using ffmpeg at:', ffmpeg);
console.log('Converting:', inputPath, '->', outputPath);

// Remove the old webp if it exists
if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
}

// 0x00FF00 is green. similarity=0.35, smoothness=0.1
// Output as animated WebP, lossless=0, loop=0 (infinite)
const cmd = `"${ffmpeg}" -i "${inputPath}" -vf "chromakey=0x00FF00:0.35:0.1" -vcodec libwebp -lossless 0 -qscale 40 -loop 0 -an -vsync 0 -y "${outputPath}"`;

try {
    execSync(cmd, { stdio: 'inherit' });
    console.log('Success! WEBP created at', outputPath);
} catch (error) {
    console.error('Error during ffmpeg conversion:', error);
    process.exit(1);
}
