import type { Server } from 'node:http';
import type { Express } from 'express';
import mongoose from 'mongoose';

// Boots the HTTP server and returns the Server instance.
// Startup failures are propagated to the caller for handling.
export async function startServer(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, (error) => {
      if (error) return reject(error);
      resolve(server);
    });
  });
}

export function resolveMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!uri.includes('<db_password>')) {
    return uri;
  }

  const password = process.env.DB_PASSWORD;
  if (!password) {
    throw new Error('DB_PASSWORD is not set (required to resolve MONGODB_URI placeholder)');
  }

  return uri.replace('<db_password>', encodeURIComponent(password));
}

export async function connectToMongoDB(uri: string): Promise<void> {
  try {
    console.log('❔ Connecting to MongoDB...');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB!');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}
