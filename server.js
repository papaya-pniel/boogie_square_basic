import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { execFile } from 'child_process';
import { tmpdir } from 'os';
import nodemailer from 'nodemailer';
import https from 'https';
import http from 'http';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const SHARED_DATA_FILE = path.join(__dirname, 'public', 'shared-grid-data.json');

// Static uploads
import fsSync from 'fs';
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const uploadsDir = path.join(__dirname, 'uploads');
if (!fsSync.existsSync(uploadsDir)) { fsSync.mkdirSync(uploadsDir, { recursive: true }); }

// Raw upload (single webm)
app.post('/api/upload', express.raw({ type: 'video/webm', limit: '200mb' }), async (req, res) => {
  try {
    if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
      return res.status(400).json({ error: 'Empty body' });
    }
    const filename = `video_${Date.now()}.webm`;
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, req.body);
    const url = `http://localhost:${PORT}/uploads/${filename}`;
    res.json({ url });
  } catch (error) {
    console.error('Error saving upload:', error);
    res.status(500).json({ error: 'Failed to save upload' });
  }
});

// Concat multiple takes server-side
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/concat', upload.array('clips', 3), async (req, res) => {
  try {
    const count = (req.files && req.files.length) || 0;
    console.log('concat received files:', count, count ? req.files.map((f,i)=>`${i}:${f.originalname||'clip'}.${(f.mimetype||'').split('/')[1]||''}(${f.size}B)`) : '');
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No clips' });
    const dir = tmpdir();
    const files = [];
    for (let i = 0; i < req.files.length; i++) {
      const p = path.join(dir, `clip${i}.webm`);
      await fs.writeFile(p, req.files[i].buffer);
      files.push(p);
    }
    if (files.length < 3) return res.status(400).json({ error: 'Need 3 clips' });

    const outName = `video_${Date.now()}.webm`;
    const outPath = path.join(uploadsDir, outName);

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const run = (args) => new Promise((resolve, reject) => {
      execFile(ffmpegPath, args, (err) => err ? reject(err) : resolve());
    });

    // Force re-encode with scaling/fps/audio format to ensure WebM compliance
    await run([
      '-y',
      '-i', files[0],
      '-i', files[1],
      '-i', files[2],
      '-filter_complex',
      '[0:v]fps=30,scale=640:360,format=yuv420p[v0];' +
      '[1:v]fps=30,scale=640:360,format=yuv420p[v1];' +
      '[2:v]fps=30,scale=640:360,format=yuv420p[v2];' +
      '[0:a]aformat=sample_rates=48000:channel_layouts=mono[a0];' +
      '[1:a]aformat=sample_rates=48000:channel_layouts=mono[a1];' +
      '[2:a]aformat=sample_rates=48000:channel_layouts=mono[a2];' +
      '[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]',
      '-map','[v]','-map','[a]',
      '-c:v','libvpx','-b:v','900k',
      '-c:a','libopus','-b:a','96k',
      outPath,
    ]);

    const url = `http://localhost:${PORT}/uploads/${outName}`;
    res.json({ url });
  } catch (e) {
    console.error('Concat error:', e);
    res.status(500).json({ error: 'concat failed' });
  }
});

// Shared grid endpoints
app.get('/api/shared-grid', async (req, res) => {
  try {
    const data = await fs.readFile(SHARED_DATA_FILE, 'utf8');
    try {
      const parsed = JSON.parse(data);
      return res.json(parsed);
    } catch (e) {
      // fall through to default
    }
  } catch (error) {
    // file missing or unreadable; fall through to default
  }
  try {
    const fallback = {
      videos: Array(16).fill(null),
      contributions: [],
      lastUpdated: new Date().toISOString(),
      gridId: 'shared-grid-1',
      totalContributions: 0,
    };
    await fs.writeFile(SHARED_DATA_FILE, JSON.stringify(fallback, null, 2));
    return res.json(fallback);
  } catch (e) {
    console.error('Error initializing shared grid data:', e);
    return res.status(500).json({ error: 'Failed to read shared grid data' });
  }
});

app.post('/api/shared-grid', async (req, res) => {
  try {
    const { videos, contributions } = req.body || {};
    const updatedData = {
      videos: Array.isArray(videos) ? videos : Array(16).fill(null),
      contributions: Array.isArray(contributions) ? contributions : [],
      lastUpdated: new Date().toISOString(),
      gridId: "shared-grid-1",
      totalContributions: (Array.isArray(contributions) ? contributions : []).length
    };
    await fs.writeFile(SHARED_DATA_FILE, JSON.stringify(updatedData, null, 2));
    res.json(updatedData);
  } catch (error) {
    console.error('Error updating shared grid data:', error);
    res.status(500).json({ error: 'Failed to update shared grid data' });
  }
});

async function downloadToTemp(url) {
  const dir = tmpdir();
  const name = `dl_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`;
  const dest = path.join(dir, name);
  await new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = fsSync.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
  return dest;
}

async function uploadFinalToS3(localPath, key) {
  const bucket = process.env.FINAL_S3_BUCKET;
  if (!bucket) return null;
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const s3 = new S3Client({ region });
  const body = await fs.readFile(localPath);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'video/mp4' }));
  const publicBase = process.env.FINAL_S3_PUBLIC_BASE || `https://${bucket}.s3.${region}.amazonaws.com/`;
  return publicBase.replace(/\/?$/, '/') + key;
}

app.post('/api/finalize', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const { videos, recipients } = req.body || {};
    if (!Array.isArray(videos) || videos.length !== 16) return res.status(400).json({ error: 'Need 16 videos' });
    const files = [];
    for (let i = 0; i < 16; i++) {
      const v = videos[i];
      if (typeof v !== 'string') return res.status(400).json({ error: `Invalid video at index ${i}` });
      if (v.startsWith(`http://localhost:${PORT}/uploads/`)) {
        const localPath = path.join(__dirname, 'uploads', path.basename(v));
        files.push(localPath);
      } else {
        files.push(await downloadToTemp(v));
      }
    }

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const run = (args) => new Promise((resolve, reject) => execFile(ffmpegPath, args, (err) => err ? reject(err) : resolve()));

    const norm = [];
    for (let i = 0; i < 16; i++) {
      const out = path.join(tmpdir(), `norm_${i}_${Date.now()}.mp4`);
      await run(['-y','-i', files[i], '-vf','fps=30,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black', '-c:v','libx264','-preset','veryfast','-crf','23','-c:a','aac','-b:a','128k', out]);
      norm.push(out);
    }

    const outName = `final_${Date.now()}.mp4`;
    const outPath = path.join(uploadsDir, outName);
    const args = ['-y'];
    norm.forEach((p) => { args.push('-i', p); });
    const row0 = '[0:v][1:v][2:v][3:v]hstack=inputs=4[row0]';
    const row1 = '[4:v][5:v][6:v][7:v]hstack=inputs=4[row1]';
    const row2 = '[8:v][9:v][10:v][11:v]hstack=inputs=4[row2]';
    const row3 = '[12:v][13:v][14:v][15:v]hstack=inputs=4[row3]';
    const vstack = '[row0][row1][row2][row3]vstack=inputs=4[outv]';
    const filter = `${row0};${row1};${row2};${row3};${vstack}`;
    args.push('-filter_complex', filter, '-map','[outv]','-an','-c:v','libx264','-preset','veryfast','-crf','23', outPath);
    await run(args);

    const localUrl = `http://localhost:${PORT}/uploads/${outName}`;
    let s3Url = null;
    try {
      s3Url = await uploadFinalToS3(outPath, `finals/${outName}`);
    } catch (e) {
      console.warn('S3 upload failed (continuing with local URL):', e?.message || e);
    }

    const finalUrl = s3Url || localUrl;

    if (Array.isArray(recipients) && recipients.length > 0) {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      const unique = [...new Set(recipients.filter(Boolean))];

      // Attach MP4 if not too large
      let attachments = [];
      try {
        const stat = await fs.stat(outPath);
        const maxBytes = Number(process.env.EMAIL_ATTACH_MAX_MB || 20) * 1024 * 1024; // default 20MB
        if (stat.size <= maxBytes) {
          attachments = [{ filename: outName, path: outPath, contentType: 'video/mp4' }];
        } else {
          console.warn(`Final video too large to attach (${stat.size} bytes). Sending link only.`);
        }
      } catch (e) {
        console.warn('Could not stat final video for attachment:', e?.message || e);
      }

      await transport.sendMail({
        from: process.env.FROM_EMAIL || 'no-reply@example.com',
        to: unique.join(','),
        subject: 'Your Boogie Square Final Video',
        text: `Thanks for contributing! Download the final video here: ${finalUrl}`,
        html: `<p>Thanks for contributing! Download the final video here:</p><p><a href="${finalUrl}">${finalUrl}</a></p>`,
        attachments,
      });
    }

    res.json({ url: finalUrl });
  } catch (e) {
    console.error('Finalize error:', e);
    res.status(500).json({ error: 'finalize failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Shared grid server running on http://localhost:${PORT}`);
}); 