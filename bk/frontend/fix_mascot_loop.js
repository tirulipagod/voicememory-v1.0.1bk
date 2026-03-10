const ffmpeg = require('ffmpeg-static');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const inputPath = path.resolve(__dirname, 'assets', 'reverse.mp4');
const outputPath = path.resolve(__dirname, 'assets', 'reverse_smooth_fixed.webp');

console.log('1. Fixing GPT boomerang video blinking issue and increasing quality...');
try {
    const framesDir = path.resolve(__dirname, 'assets', 'frames_tmp');
    if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir);
    }
    fs.readdirSync(framesDir).forEach(f => fs.unlinkSync(path.join(framesDir, f)));

    execSync(`"${ffmpeg}" -i "../reverse.mp4" -vf "fps=15,scale=250:-1,chromakey=0x00FF00:0.35:0.1" "frame_%04d.png"`, { cwd: framesDir, stdio: 'inherit' });

    const frames = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).sort();

    const sequenceDir = path.resolve(__dirname, 'assets', 'seq_tmp');
    if (!fs.existsSync(sequenceDir)) {
        fs.mkdirSync(sequenceDir);
    }
    fs.readdirSync(sequenceDir).forEach(f => fs.unlinkSync(path.join(sequenceDir, f)));

    // We will discard the first 5 and last 5 frames of the original video. 
    // This avoids the part where the mascot is stationary (which causes a perceived blink/freeze)
    const framesToKeep = frames.slice(5, frames.length - 5);

    let counter = 0;
    // Copy forward
    for (let i = 0; i < framesToKeep.length; i++) {
        fs.copyFileSync(path.join(framesDir, framesToKeep[i]), path.join(sequenceDir, `seq_${String(counter).padStart(4, '0')}.png`));
        counter++;
    }

    // Copy backward, skipping the very last frame and the very first frame to make it seamless
    for (let i = framesToKeep.length - 2; i > 0; i--) {
        fs.copyFileSync(path.join(framesDir, framesToKeep[i]), path.join(sequenceDir, `seq_${String(counter).padStart(4, '0')}.png`));
        counter++;
    }

    console.log(`Created boomerang sequence with ${counter} frames. Generating high quality WebP...`);

    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    // Use -qscale 90 for much better quality
    execSync(`"${ffmpeg}" -framerate 15 -i "seq_%04d.png" -vcodec libwebp -lossless 0 -qscale 90 -loop 0 -an -y "${outputPath}"`, { cwd: sequenceDir, stdio: 'inherit' });

    console.log('3. Smooth high-quality GPT loop WebP created successfully.');

    // cleanup
    fs.readdirSync(framesDir).forEach(f => fs.unlinkSync(path.join(framesDir, f)));
    fs.rmdirSync(framesDir);
    fs.readdirSync(sequenceDir).forEach(f => fs.unlinkSync(path.join(sequenceDir, f)));
    fs.rmdirSync(sequenceDir);

} catch (error) {
    console.error('Failed:', error);
}
