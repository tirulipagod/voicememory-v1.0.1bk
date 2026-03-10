const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputPath = path.resolve(__dirname, 'assets', 'gpt loop.mp4');
const boomPath = path.resolve(__dirname, 'assets', 'gpt_boom.mp4');
const outputPath = path.resolve(__dirname, 'assets', 'gpt_smooth.webp');

console.log('1. Creating GPT boomerang video (forward + backward)...');
try {
    if (fs.existsSync(boomPath)) fs.unlinkSync(boomPath);
    execSync(`"${ffmpeg}" -i "${inputPath}" -filter_complex "[0:v]reverse[r];[0:v][r]concat=n=2:v=1[v]" -map "[v]" -an -y "${boomPath}"`);
    console.log('2. Boomerang created. Converting to transparent WebP for WebView...');

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    // WebView Chrome can handle 15MB 60fps webps effortlessly. But just in case, compressing lightly.
    // 250x250, 15fps, qscale 30 gives us ~2MB.
    execSync(`"${ffmpeg}" -i "${boomPath}" -vf "fps=15,scale=250:-1,chromakey=0x00FF00:0.35:0.1" -vcodec libwebp -lossless 0 -qscale 30 -loop 0 -an -y "${outputPath}"`);
    console.log('3. Smooth GPT loop WebP created successfully.');

    if (fs.existsSync(boomPath)) fs.unlinkSync(boomPath);
} catch (error) {
    console.error('Failed:', error);
}
