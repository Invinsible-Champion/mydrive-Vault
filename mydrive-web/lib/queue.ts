import * as amqp from 'amqplib';

let cachedConnection: amqp.ChannelModel | null = null;
let cachedChannel: amqp.Channel | null = null;

export async function getQueueChannel(): Promise<amqp.Channel> {
  const url = process.env.CLOUDAMQP_URL;
  if (!url) {
    throw new Error('CLOUDAMQP_URL environment variable is missing');
  }

  if (cachedConnection && cachedChannel) {
    return cachedChannel;
  }

  try {

    cachedConnection = await amqp.connect(url);
    cachedChannel = await cachedConnection.createChannel();

    const queueName = 'file-processing-queue';
    await cachedChannel.assertQueue(queueName, {
      durable: true,
    });

    cachedConnection.on('error', () => {
      console.warn('[AMQP] Connection error detected, clearing cache.');
      cachedConnection = null;
      cachedChannel = null;
    });

    cachedConnection.on('close', () => {
      console.warn('[AMQP] Connection closed manually or by server.');
      cachedConnection = null;
      cachedChannel = null;
    });

    return cachedChannel;
  } catch (error) {
    console.error('[AMQP] Failed to initialize queue channel:', error);
    cachedConnection = null;
    cachedChannel = null;
    throw error;
  }
}