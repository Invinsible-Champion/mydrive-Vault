import * as amqp from 'amqplib';
import * as dotenv from 'dotenv';
import { processFilePipeline } from './pipeline/scanner';

dotenv.config();

async function startWorker() {
  const url = process.env.CLOUDAMQP_URL;
  if (!url) throw new Error('CLOUDAMQP_URL is missing in .env');

  console.log('[Worker] Connecting to CloudAMQP...');
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();

  const queueName = 'file-processing-queue';
  await channel.assertQueue(queueName, { durable: true });

  channel.prefetch(1); 

  console.log(`[Worker] Listening for tasks on queue: ${queueName}`);

  channel.consume(queueName, async (msg) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      const { fileId, userId } = payload;

      if (!fileId || !userId) {
        throw new Error('Invalid payload structure');
      }

      const success = await processFilePipeline(fileId, userId);

      if (success) {
        channel.ack(msg); 
      } else {
        channel.reject(msg, false); 
      }

    } catch (error) {
      console.error('[Worker] Message processing failed. Requeueing task...', error);
      channel.nack(msg, false, true); 
    }
  }, { noAck: false });
}

startWorker().catch((error) => {
  console.error('[Worker] Fatal crash:', error);
  process.exit(1);
});