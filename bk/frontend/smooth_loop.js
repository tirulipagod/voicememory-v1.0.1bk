const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputPath = path.resolve(__dirname, 'assets', 'reverse.mp4');
const boomPath = path.resolve(__dirname, 'assets', 'reverse_boom.mp4');
const outputPath = path.resolve(__dirname, 'assets', 'reverse_smooth.webp');

console.log('1. Creating boomerang video (forward + backward)...');
try {
    if (fs.existsSync(boomPath)) fs.unlinkSync(boomPath);
    // [0:v]reverse[r] creates a reversed copy. concat joins original and reversed. This guarantees a seamless loop point.
    execSync(`"${ffmpeg}" -i "${inputPath}" -filter_complex "[0:v]reverse[r];[0:v][r]concat=n=2:v=1[v]" -map "[v]" -an -y "${boomPath}"`);
    console.log('2. Boomerang created. Converting to high-quality transparent WebP...');

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    // Using original high quality settings from the first successful attempt
    execSync(`"${ffmpeg}" -i "${boomPath}" -vf "chromakey=0x00FF00:0.35:0.1" -vcodec libwebp -lossless 0 -qscale 50 -loop 0 -an -y "${outputPath}"`);
    console.log('3. Smooth loop WebP created successfully.');

    // Clean up temp file
    if (fs.existsSync(boomPath)) fs.unlinkSync(boomPath);
} catch (error) {
    console.error('Failed:', error);
}
