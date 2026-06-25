import express, { type NextFunction, type Request, type Response } from 'express';
import 'dotenv/config';
import { connectToMongoDB, resolveMongoUri, startServer } from './utils.js';
import { authRouter } from './routes/auth.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { postsRouter } from './routes/posts.routes.js';
import { workspacesRouter } from './routes/workspace.routes.js';
import { filesRouter } from './routes/files.routes.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { registerFileRelay } from './sockets/file-relay.socket.js';
import { requireAuth } from './middleware/auth.middleware.js';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);

app.use(cookieParser());

// express.json() is a middleware that parses the request body and makes it available in req.body
app.use(express.json());

// express.urlencoded() is a middleware that parses the request body and makes it available in req.body
// extended: true means that the parser will support nested objects and arrays
app.use(express.urlencoded({ extended: true }));

const apiRouter = express.Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', requireAuth, postsRouter);
apiRouter.use('/workspaces', requireAuth, workspacesRouter);
apiRouter.use('/files', requireAuth, filesRouter);

app.use('/api', apiRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// error handler (must be last)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// get the port and uri from the environment variables
const port = Number(process.env.PORT) || 3000;
// main function to start the server
async function main() {
  await connectToMongoDB(resolveMongoUri());

  const server = await startServer(app, port);
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
    transports: ['websocket'],
  });

  registerFileRelay(io);

  console.log(`✅ Server is running on port ${port}! 🚀`);
}

// catch any errors and exit the process
main().catch((error) => {
  console.error(`❌ Failed to start: ${error}`);
  process.exit(1);
});
