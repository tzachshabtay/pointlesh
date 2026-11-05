import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

const media = resolve(import.meta.dirname, 'public/media');
const clips = [
  { name: 'ground-3', image: 'workflow-walkable-changed', focus: [1370, 94], start: [1150, 400], promote: true },
  { name: 'animation-0', image: 'workflow-animation-generate', focus: [1166, 786], start: [1040, 580] },
  { name: 'animation-1', image: 'workflow-animation-choose', focus: [674, 491], start: [369, 491], sweep: true },
  { name: 'animation-2', image: 'workflow-animation-play', focus: [803, 717], start: [318, 812], sweep: true },
  { name: 'animation-3', image: 'workflow-animation-generate', focus: [1334, 831], start: [1133, 740], promote: true },
  { name: 'interaction-0', image: 'workflow-interaction-matrix', focus: [881, 285], start: [420, 129] },
  { name: 'interaction-1', image: 'workflow-interaction-coin-editor', focus: [936, 714], start: [679, 526] },
  { name: 'interaction-2', image: 'workflow-interaction-test', focus: [577, 734], start: [517, 845] },
  { name: 'interaction-3', image: 'workflow-interaction-matrix', focus: [1366, 134], start: [1169, 263], promote: true },
  { name: 'dialogue-0', image: 'dialog-designer', focus: [182, 759], start: [132, 387] },
  { name: 'dialogue-1', image: 'workflow-dialogue-voice', focus: [181, 804], start: [520, 590] },
  { name: 'dialogue-2', image: 'dialog-choice', focus: [710, 780], start: [805, 570] },
  { name: 'dialogue-3', image: 'dialog-designer', focus: [628, 33], start: [471, 216], promote: true },
];
const selectedClips = process.argv[2] ? clips.filter(clip => clip.name === process.argv[2]) : clips;

async function trimGround(index, start, duration) {
  await new Promise((resolveDone, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-loglevel', 'error', '-ss', String(start), '-i', resolve(media, 'walkable-workflow.webm'),
      '-t', String(duration), '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38',
      resolve(media, `workflow-ground-${index}.webm`),
    ], { stdio: 'inherit' });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => code === 0 ? resolveDone() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}

const browser = await chromium.launch({ headless: true });
try {
  for (const clip of selectedClips) {
    const page = await browser.newPage({ viewport: { width: 960, height: 667 } });
    const bytes = await readFile(resolve(media, `${clip.image}.jpg`));
    const result = await page.evaluate(async ({ source, focus, start, sweep, promote, activateAssetPromote }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 667;
      const context = canvas.getContext('2d');
      const stream = canvas.captureStream(20);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1100000 });
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const smooth = value => value * value * (3 - 2 * value);
      const duration = 3200;
      const origin = performance.now();
      recorder.start();
      await new Promise(resolveDone => {
        function draw(now) {
          const progress = Math.min(1, (now - origin) / duration);
          const ratio = canvas.width / canvas.height;
          const cropWidth = Math.min(image.width, image.height * ratio);
          const cropHeight = Math.min(image.height, image.width / ratio);
          const cropX = Math.max(0, Math.min(image.width - cropWidth, (start[0] + focus[0]) / 2 - cropWidth / 2));
          const cropY = Math.max(0, Math.min(image.height - cropHeight, focus[1] - cropHeight / 2));
          context.fillStyle = '#101a16';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
          if (activateAssetPromote) {
            const x = (1260 - cropX) * canvas.width / cropWidth;
            const y = (813 - cropY) * canvas.height / cropHeight;
            const width = 151 * canvas.width / cropWidth;
            const height = 38 * canvas.height / cropHeight;
            context.fillStyle = '#584a78';
            context.strokeStyle = '#9d8ac1';
            context.lineWidth = 1;
            context.beginPath();
            context.roundRect(x, y, width, height, 5);
            context.fill();
            context.stroke();
            context.fillStyle = '#fff';
            context.font = '600 14px system-ui';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText('Promote', x + width / 2, y + height / 2);
          }
          const travel = smooth(Math.min(1, progress / 0.7));
          const sourceX = start[0] + (focus[0] - start[0]) * travel;
          const sourceY = start[1] + (focus[1] - start[1]) * travel;
          const x = (sourceX - cropX) * canvas.width / cropWidth;
          const y = (sourceY - cropY) * canvas.height / cropHeight;
          if (promote && progress > 0.4) {
            const opacity = Math.min(0.4, (progress - 0.4) * 1.5);
            context.fillStyle = `rgba(232,186,112,${opacity})`;
            context.beginPath();
            context.arc(x, y, 32 + Math.sin(progress * 15) * 3, 0, Math.PI * 2);
            context.fill();
          }
          if (progress > 0.66) {
            const phase = (progress - 0.66) / 0.34;
            context.strokeStyle = `rgba(255,226,161,${0.7 * (1 - phase)})`;
            context.lineWidth = 3;
            context.beginPath();
            context.arc(x, y, 12 + phase * 23, 0, Math.PI * 2);
            context.stroke();
          }
          context.fillStyle = '#f7edcb';
          context.strokeStyle = '#172620';
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + 1, y + 21);
          context.lineTo(x + 6, y + 16);
          context.lineTo(x + 12, y + 22);
          context.lineTo(x + 16, y + 18);
          context.lineTo(x + 10, y + 12);
          context.lineTo(x + 17, y + 11);
          context.closePath();
          context.fill();
          context.stroke();
          if (sweep) {
            context.strokeStyle = 'rgba(232,186,112,.75)';
            context.lineWidth = 2;
            context.beginPath();
            context.arc(x, y, 19, 0, Math.PI * 2);
            context.stroke();
          }
          if (progress < 1) requestAnimationFrame(draw);
          else resolveDone();
        }
        requestAnimationFrame(draw);
      });
      await new Promise(resolveDone => { recorder.onstop = resolveDone; recorder.stop(); });
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks, { type: 'video/webm' });
      return [...new Uint8Array(await blob.arrayBuffer())];
    }, { source: `data:image/jpeg;base64,${bytes.toString('base64')}`, focus: clip.focus, start: clip.start, sweep: clip.sweep, promote: clip.promote, activateAssetPromote: clip.name === 'animation-3' });
    await writeFile(resolve(media, `workflow-${clip.name}.webm`), Buffer.from(result));
    await page.close();
    process.stdout.write(`Created ${clip.name}\n`);
  }
} finally {
  await browser.close();
}
if (!process.argv[2]) {
  await trimGround(0, 0, 3.8);
  await trimGround(1, 3.8, 6.2);
  await trimGround(2, 10, 5);
}
for (const clip of process.argv[2] === '--normalize-only' ? clips : selectedClips) {
  const file = resolve(media, `workflow-${clip.name}.webm`);
  const duration = Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ], { encoding: 'utf8' }).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid clip duration: ${file}`);
  if (Math.abs(duration - 3.2) > 0.1) {
    const retimed = file.replace(/\.webm$/, '.retimed.webm');
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-itsscale', String(3.2 / duration),
      '-i', file, '-c', 'copy', retimed,
    ]);
    await rename(retimed, file);
  }
}
