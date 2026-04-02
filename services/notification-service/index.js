const express = require('express');
const amqp = require('amqplib');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);

// WebSocket : les clients se connectent ici pour recevoir les notifications en direct
const wss = new WebSocketServer({ server });

const clients = [];

wss.on('connection', (ws) => {
  console.log('Nouveau client WebSocket connecté');
  clients.push(ws);

  ws.on('close', () => {
    const index = clients.indexOf(ws);
    if (index !== -1) clients.splice(index, 1);
    console.log('Client WebSocket déconnecté');
  });
});

// Envoyer une notification à tous les clients connectés
function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

// Écouter RabbitMQ pour les nouveaux posts
async function listenForEvents() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://nebula:rabbit_password@nebula_rabbitmq');
    const channel = await conn.createChannel();

    // Écouter les nouveaux posts
    await channel.assertQueue('notif_post_created');
    channel.consume('notif_post_created', (msg) => {
      const post = JSON.parse(msg.content.toString());
      console.log('Notification: nouveau post', post);
      broadcast({ type: 'new_post', post });
      channel.ack(msg);
    });

    // Écouter les inscriptions
    await channel.assertQueue('notif_user_registered');
    channel.consume('notif_user_registered', (msg) => {
      const user = JSON.parse(msg.content.toString());
      console.log('Notification: nouvel utilisateur', user);
      broadcast({ type: 'new_user', user });
      channel.ack(msg);
    });

    console.log('En écoute sur les queues de notification...');
  } catch (err) {
    console.log('RabbitMQ non dispo, retry dans 5s...');
    setTimeout(listenForEvents, 5000);
  }
}

listenForEvents();

// GET /health
app.get('/notifications/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification', clients_connectes: clients.length });
});

server.listen(3003, () => console.log('Notification service sur le port 3003'));
