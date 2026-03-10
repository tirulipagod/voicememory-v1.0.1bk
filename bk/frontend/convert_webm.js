const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const inputDir = path.resolve(__dirname, 'assets', 'maskot');
const outputDir = path.resolve(__dirname, 'assets', 'maskot');

const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.mp4'));

// Also convert the idle reverse.mp4
files.push('../reverse.mp4');

files.forEach(file => {
    const inputPath = path.join(inputDir, file);
    const outputPath = path.resolve(inputDir, file.replace('.mp4', '.webm'));

    console.log(`\nConverting to WebM transparent: ${file} -> ${path.basename(outputPath)}`);

    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }

    // Convert to WebM VP9 with yuva420p (alpha channel)
    const cmd = `"${ffmpeg}" -i "${inputPath}" -vf "chromakey=0x00FF00:0.35:0.1" -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 1M -y "${outputPath}"`;

    try {
        execSync(cmd, { stdio: 'inherit' });
        console.log(`Success! ${path.basename(outputPath)} created.`);
    } catch (error) {
        console.error(`Error converting ${file}:`, error);
    }
});
console.log('\nAll WebM conversions finished!');
