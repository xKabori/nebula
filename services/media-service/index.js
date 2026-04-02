const express = require('express');
const Minio = require('minio');
const multer = require('multer');

const app = express();
const upload = multer({ dest: '/tmp/uploads' });

// Connexion à MinIO
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_HOST || 'nebula_minio',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_USER || 'nebula',
  secretKey: process.env.MINIO_PASSWORD || 'minio_secret_key',
});

const BUCKET = 'nebula-media';

// Au démarrage : créer le bucket s'il n'existe pas
async function initBucket() {
  try {
    const exists = await minioClient.bucketExists(BUCKET);
    if (!exists) {
      await minioClient.makeBucket(BUCKET);
      console.log('Bucket créé:', BUCKET);
    }
    console.log('MinIO connecté');
  } catch (err) {
    console.log('MinIO non dispo:', err.message);
    setTimeout(initBucket, 5000);
  }
}

initBucket();

// GET /health
app.get('/upload/health', async (req, res) => {
  try {
    await minioClient.bucketExists(BUCKET);
    res.json({ status: 'ok', service: 'media' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /upload — envoyer un fichier
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier envoyé' });
    }

    const fileName = Date.now() + '-' + req.file.originalname;
    await minioClient.fPutObject(BUCKET, fileName, req.file.path);

    res.status(201).json({ fileName, message: 'Fichier uploadé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /files — lister les fichiers
app.get('/files', async (req, res) => {
  try {
    const files = [];
    const stream = minioClient.listObjects(BUCKET);

    stream.on('data', (obj) => files.push(obj));
    stream.on('end', () => res.json(files));
    stream.on('error', (err) => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3004, () => console.log('Media service sur le port 3004'));
