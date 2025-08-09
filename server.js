import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { execFile } from 'child_process';
import { tmpdir } from 'os';

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

app.listen(PORT, () => {
  console.log(`Shared grid server running on http://localhost:${PORT}`);
}); 