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

// Table qui stocke les entrées de timeline par utilisateur
pool.query(`
  CREATE TABLE IF NOT EXISTS timeline (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    content VARCHAR(280),
    author_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

// Écouter RabbitMQ : quand un post est créé, l'ajouter aux timelines
async function listenForPosts() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://nebula:rabbit_password@nebula_rabbitmq');
    const channel = await conn.createChannel();
    await channel.assertQueue('post_created');

    console.log('En écoute sur la queue post_created...');

    channel.consume('post_created', async (msg) => {
      const post = JSON.parse(msg.content.toString());
      console.log('Nouveau post reçu:', post);

      // Pour simplifier : on ajoute le post à la timeline de l'auteur
      // En vrai, on l'ajouterait aux timelines de tous ses abonnés
      await pool.query(
        'INSERT INTO timeline (user_id, post_id, content, author_id) VALUES ($1, $2, $3, $4)',
        [post.user_id, post.id, post.content, post.user_id]
      );

      channel.ack(msg);
    });
  } catch (err) {
    console.log('RabbitMQ non dispo, retry dans 5s...');
    setTimeout(listenForPosts, 5000);
  }
}

listenForPosts();

// GET /health
app.get('/timeline/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'timeline' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /timeline/:userId — récupérer le fil d'un utilisateur
app.get('/timeline/:userId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM timeline WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.params.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3002, () => console.log('Timeline service sur le port 3002'));
