import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import fsSync from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const SHARED_DATA_FILE = path.join(__dirname, 'public', 'shared-grid-data.json');

// Get shared grid data
app.get('/api/shared-grid', async (req, res) => {
  try {
    const data = await fs.readFile(SHARED_DATA_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading shared grid data:', error);
    res.status(500).json({ error: 'Failed to read shared grid data' });
  }
});

// Update shared grid data
app.post('/api/shared-grid', async (req, res) => {
  try {
    const { videos, contributions } = req.body;
    const updatedData = {
      videos: videos || Array(16).fill(null),
      contributions: contributions || [],
      lastUpdated: new Date().toISOString(),
      gridId: "shared-grid-1",
      totalContributions: (contributions || []).length
    };
    
    await fs.writeFile(SHARED_DATA_FILE, JSON.stringify(updatedData, null, 2));
    res.json(updatedData);
  } catch (error) {
    console.error('Error updating shared grid data:', error);
    res.status(500).json({ error: 'Failed to update shared grid data' });
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

// Upload endpoint: accept raw webm bytes and store on disk
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

app.listen(PORT, () => {
  console.log(`Shared grid server running on http://localhost:${PORT}`);
}); 