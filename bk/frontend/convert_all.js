const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const inputDir = path.resolve(__dirname, 'assets', 'maskot');
const outputDir = path.resolve(__dirname, 'assets', 'maskot');

const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.mp4'));

files.forEach(file => {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.join(outputDir, file.replace('.mp4', '.webp'));

    console.log(`\nCompressing: ${file} -> ${path.basename(outputPath)}`);

    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }

    // Resize to 250x250, drop to 15 fps, compress aggressively to prevent React Native out of memory black screens
    const cmd = `"${ffmpeg}" -i "${inputPath}" -vf "fps=15,scale=250:-1,chromakey=0x00FF00:0.35:0.1" -vcodec libwebp -lossless 0 -qscale 30 -loop 0 -an -y "${outputPath}"`;

    try {
        execSync(cmd, { stdio: 'inherit' });
        console.log(`Success! ${path.basename(outputPath)} created.`);
    } catch (error) {
        console.error(`Error converting ${file}:`, error);
    }
});
console.log('\nAll compressions finished!');
