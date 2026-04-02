const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());

// Connexion à PostgreSQL (les infos viennent des variables d'environnement)
const pool = new Pool({
  host: process.env.DB_HOST || 'nebula_postgres',
  database: process.env.DB_NAME || 'nebula',
  user: process.env.DB_USER || 'nebula',
  password: process.env.DB_PASSWORD || 'nebula_password',
});

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Au démarrage : créer la table users si elle n'existe pas
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

// GET /health — vérifier que le service tourne
app.get('/auth/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'auth', version: '2.0' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// POST /register — inscrire un utilisateur
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Hasher le mot de passe
    const hashed = await bcrypt.hash(password, 10);

    // Insérer en base
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashed]
    );

    // Publier un événement dans RabbitMQ pour prévenir les autres services
    try {
      const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://nebula:rabbit_password@nebula_rabbitmq');
      const channel = await conn.createChannel();
      await channel.assertQueue('user_registered');
      channel.sendToQueue('user_registered', Buffer.from(JSON.stringify(result.rows[0])));
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

// POST /login — se connecter et recevoir un token JWT
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Chercher l'utilisateur en base
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Utilisateur inconnu' });
    }

    // Vérifier le mot de passe
    const valid = await bcrypt.compare(password, result.rows[0].password);
    if (!valid) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Générer un token JWT
    const token = jwt.sign({ id: result.rows[0].id, username }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Auth service sur le port 3000'));
