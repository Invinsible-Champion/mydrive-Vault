import express from 'express';
import * as amqp from 'amqplib';
import * as dotenv from 'dotenv';
import { processFilePipeline } from './pipeline/scanner';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Render/Koyeb Health Check Route
app.get('/', (req, res) => {
  res.status(200).send('Worker is awake and chewing the queue!');
});

// A quick health endpoint for cloud monitoring platforms
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

async function startWorker() {
  const url = process.env.CLOUDAMQP_URL;
  if (!url) {
    console.error('[Fatal] CLOUDAMQP_URL is missing in .env');
    throw new Error('CLOUDAMQP_URL is missing in .env');
  }

  console.log('[Worker] Connecting to CloudAMQP...');
  const connection = await amqp.connect(url);
  
  // Handle unexpected connection drops gracefully
  connection.on('error', (err) => {
    console.error('[RabbitMQ] Connection error:', err);
    process.exit(1);
  });
  
  connection.on('close', () => {
    console.error('[RabbitMQ] Connection closed. Restarting worker...');
    process.exit(1);
  });

  const channel = await connection.createChannel();
  const queueName = 'file-processing-queue';

  // Ensure queue exists and is durable across broker restarts
  await channel.assertQueue(queueName, { durable: true });

  // Prefetch(1) ensures this worker only pulls 1 task at a time, balancing load evenly
  channel.prefetch(1); 

  console.log(`[Worker] Listening for tasks on queue: ${queueName}`);

  channel.consume(queueName, async (msg) => {
    if (!msg) return;

    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch (parseError) {
      console.error('[Worker] Fatal: Received invalid JSON payload. Dropping message.');
      // Do NOT requeue malformed JSON, it will cause an infinite loop
      channel.reject(msg, false);
      return;
    }

    const { fileId, userId } = payload;

    if (!fileId || !userId) {
      console.error('[Worker] Fatal: Missing fileId or userId in payload. Dropping message.');
      channel.reject(msg, false);
      return;
    }

    try {
      console.log(`[Worker] Processing task for User: ${userId} | File: ${fileId}`);
      const success = await processFilePipeline(fileId, userId);

      if (success) {
        console.log(`[Worker] ✓ Successfully processed file: ${fileId}`);
        channel.ack(msg); 
      } else {
        console.warn(`[Worker] ⚠ Pipeline processing returned false for file: ${fileId}. Requeueing...`);
        // Something transient failed inside the pipeline, retry later
        channel.nack(msg, false, true); 
      }

    } catch (error) {
      console.error(`[Worker] Exception caught while processing file ${fileId}:`, error);
      // Requeue the task only if it was a transient infrastructure failure
      channel.nack(msg, false, true); 
    }
  }, { noAck: false });
}

// 1. Start the Express HTTP Server first so Render/Koyeb health checks pass immediately
app.listen(PORT, () => {
  console.log(`[System] HTTP Server bound and listening on port ${PORT}`);
  
  // 2. Fire up the RabbitMQ worker loop inside the server context
  startWorker().catch((error) => {
    console.error('[Worker] Fatal crash during initialization:', error);
    process.exit(1);
  });
});