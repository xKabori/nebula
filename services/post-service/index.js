
const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'nebula_postgres',
  database: process.env.DB_NAME || 'nebula',
  user: process.env.DB_USER || 'nebula',
  password: process.env.DB_PASSWORD || 'nebula_password',
});

// Créer la table posts au démarrage
pool.query(`
  CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    content VARCHAR(280) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

// GET /health
app.get('/posts/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'post' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /posts — créer une publication
app.post('/posts', async (req, res) => {
  try {
    const { user_id, content } = req.body;

    const result = await pool.query(
      'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING *',
      [user_id, content]
    );

    // Prévenir les autres services via RabbitMQ
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://nebula:rabbit_password@nebula_rabbitmq');
      const channel = await conn.createChannel();
      await channel.assertQueue('post_created');
      channel.sendToQueue('post_created', Buffer.from(JSON.stringify(result.rows[0])));
      await channel.close();
      await conn.close();
    } catch (mqErr) {
      console.log('RabbitMQ non dispo, événement non publié');
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /posts — lire les publications (les 50 plus récentes)
app.get('/posts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM posts ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log('Post service sur le port 3001'));
