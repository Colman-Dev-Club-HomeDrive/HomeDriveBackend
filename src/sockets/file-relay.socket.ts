import jwt from 'jsonwebtoken';
import type {
  TransferCancelDto,
  TransferChunkDto,
  TransferCompleteDto,
  TransferDurableAckDto,
  TransferErrorDto,
  TransferPermissionResponseDto,
  TransferRequestDto,
  TransferResumeSyncDto,
  TransferStartDto,
} from '@homedrive/types';
import { Server, type Socket } from 'socket.io';
import { UserModel } from '../models/User.model.js';
import type { JwtPayload } from '../types/auth.types.js';

type SocketData = {
  userId: string;
  email: string;
};

type ClientToServerEvents = {
  'file:request': (payload: TransferRequestDto) => void;
  'file:permission-response': (payload: TransferPermissionResponseDto) => void;
  'file:stream-start': (payload: TransferStartDto) => void;
  'file:chunk': (payload: TransferChunkDto) => void;
  'file:durable-ack': (payload: TransferDurableAckDto) => void;
  'file:resume-sync': (payload: TransferResumeSyncDto) => void;
  'file:complete': (payload: TransferCompleteDto) => void;
  'file:cancel': (payload: TransferCancelDto) => void;
  'file:error': (payload: TransferErrorDto) => void;
};

type ServerToClientEvents = {
  'file:permission-prompt': (payload: TransferRequestDto) => void;
  'file:permission-result': (payload: TransferPermissionResponseDto) => void;
  'file:stream-start': (payload: TransferStartDto) => void;
  'file:chunk': (payload: TransferChunkDto) => void;
  'file:durable-ack': (payload: TransferDurableAckDto) => void;
  'file:resume-sync': (payload: TransferResumeSyncDto) => void;
  'file:complete': (payload: TransferCompleteDto) => void;
  'file:cancel': (payload: TransferCancelDto) => void;
  'file:error': (payload: TransferErrorDto) => void;
};

type PendingRequest = {
  requestId: string;
  requesterUserId: string;
  requesterEmail: string;
  ownerUserId: string;
  expiresAt: number;
};

type TransferSession = {
  transferId: string;
  requestId: string;
  ownerUserId: string;
  requesterUserId: string;
  lastDurableSequence: number;
  durableBytesWritten: number;
  expiresAt: number;
};

type RelaySocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const REQUEST_TTL_MS = 5 * 60 * 1000;
const TRANSFER_TTL_MS = 30 * 60 * 1000;
const MAX_CHUNK_BYTES = 512 * 1024;
const DEBUG_TRANSFER = process.env.DEBUG_TRANSFER === '1' || process.env.NODE_ENV !== 'production';

const pendingRequests = new Map<string, PendingRequest>();
const transferSessions = new Map<string, TransferSession>();

function relayDebugLog(...args: unknown[]): void {
  if (!DEBUG_TRANSFER) return;
  console.log('[file-relay]', ...args);
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function nowMs(): number {
  return Date.now();
}

function getPayloadByteLength(payload: TransferChunkDto['payload']): number {
  if (payload instanceof ArrayBuffer) {
    return payload.byteLength;
  }

  return payload.byteLength;
}

function cleanupExpiredSessions(): void {
  const now = nowMs();

  for (const [requestId, request] of pendingRequests) {
    if (request.expiresAt <= now) {
      pendingRequests.delete(requestId);
    }
  }

  for (const [transferId, transfer] of transferSessions) {
    if (transfer.expiresAt <= now) {
      transferSessions.delete(transferId);
    }
  }
}

function parseBearerToken(rawAuthorization?: string): string | undefined {
  if (!rawAuthorization) return undefined;
  if (!rawAuthorization.toLowerCase().startsWith('bearer ')) return undefined;
  return rawAuthorization.slice('bearer '.length).trim();
}

function getSocketToken(socket: Socket): string | undefined {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim().length > 0) {
    return authToken;
  }

  const headerToken = parseBearerToken(socket.handshake.headers.authorization);
  if (headerToken) return headerToken;

  const queryToken = socket.handshake.query.token;
  if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
    return queryToken;
  }

  return undefined;
}

function emitSocketError(socket: RelaySocket, payload: TransferErrorDto): void {
  socket.emit('file:error', payload);
}

function isUserOnline(io: Server, userId: string): boolean {
  const sockets = io.sockets.adapter.rooms.get(userRoom(userId));
  return Boolean(sockets && sockets.size > 0);
}

async function resolveOwnerUserId(payload: TransferRequestDto): Promise<string | null> {
  if (payload.ownerUserId) {
    return payload.ownerUserId;
  }

  if (!payload.ownerEmail) {
    return null;
  }

  const owner = await UserModel.findOne({ email: payload.ownerEmail.toLowerCase() }).select('_id').lean();
  if (!owner?._id) {
    return null;
  }

  return String(owner._id);
}

function assertRequesterSession(
  socket: RelaySocket,
  transferId: string,
): TransferSession | null {
  const session = transferSessions.get(transferId);
  if (!session) {
    emitSocketError(socket, {
      transferId,
      code: 'transfer_not_found',
      message: 'Transfer session does not exist',
    });
    return null;
  }

  if (session.requesterUserId !== socket.data.userId) {
    emitSocketError(socket, {
      transferId,
      code: 'forbidden',
      message: 'Only requester can emit this event',
    });
    return null;
  }

  return session;
}

function assertOwnerSession(socket: RelaySocket, transferId: string): TransferSession | null {
  const session = transferSessions.get(transferId);
  if (!session) {
    emitSocketError(socket, {
      transferId,
      code: 'transfer_not_found',
      message: 'Transfer session does not exist',
    });
    return null;
  }

  if (session.ownerUserId !== socket.data.userId) {
    emitSocketError(socket, {
      transferId,
      code: 'forbidden',
      message: 'Only owner can emit this event',
    });
    return null;
  }

  return session;
}

export function registerFileRelay(io: Server): void {
  io.use((socket: RelaySocket, next) => {
    const token = getSocketToken(socket);
    const jwtSecret = process.env.JWT_SECRET;

    if (!token || !jwtSecret) {
      relayDebugLog('auth failed: missing token or secret', {
        hasToken: Boolean(token),
        hasSecret: Boolean(jwtSecret),
        handshakeAuthKeys: Object.keys(socket.handshake.auth ?? {}),
      });
      next(new Error('Unauthorized'));
      return;
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
      socket.data.userId = decoded.userId;
      socket.data.email = decoded.email;
      relayDebugLog('auth success', { userId: decoded.userId, socketId: socket.id });
      next();
    } catch (_error) {
      relayDebugLog('auth failed: token verification error', { socketId: socket.id });
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: RelaySocket) => {
    socket.join(userRoom(socket.data.userId));
    relayDebugLog('socket connected and room joined', {
      userId: socket.data.userId,
      email: socket.data.email,
      socketId: socket.id,
      room: userRoom(socket.data.userId),
    });

    socket.on('disconnect', (reason) => {
      relayDebugLog('socket disconnected', {
        userId: socket.data.userId,
        socketId: socket.id,
        reason,
      });
    });

    socket.on('file:request', async (payload: TransferRequestDto) => {
      relayDebugLog('received file:request', {
        fromUserId: socket.data.userId,
        socketId: socket.id,
        payload,
      });

      if (!payload.requestId || !payload.fileId || !payload.fileName) {
        emitSocketError(socket, {
          requestId: payload.requestId,
          code: 'bad_request',
          message: 'requestId, fileId, and fileName are required',
        });
        return;
      }

      const ownerUserId = await resolveOwnerUserId(payload);
      if (!ownerUserId) {
        emitSocketError(socket, {
          requestId: payload.requestId,
          code: 'owner_not_found',
          message: 'Target owner could not be resolved',
        });
        return;
      }

      if (ownerUserId === socket.data.userId) {
        emitSocketError(socket, {
          requestId: payload.requestId,
          code: 'invalid_owner',
          message: 'Requester and owner must be different users',
        });
        return;
      }

      relayDebugLog('resolved owner for request', {
        requestId: payload.requestId,
        requesterUserId: socket.data.userId,
        ownerUserId,
        ownerOnline: isUserOnline(io, ownerUserId),
      });

      if (!isUserOnline(io, ownerUserId)) {
        relayDebugLog('owner offline, returning denied permission-result', {
          requestId: payload.requestId,
          requesterUserId: socket.data.userId,
          ownerUserId,
        });
        io.to(userRoom(socket.data.userId)).emit('file:permission-result', {
          requestId: payload.requestId,
          approved: false,
          reason: 'Owner is offline',
          ownerUserId,
        } satisfies TransferPermissionResponseDto);
        return;
      }

      pendingRequests.set(payload.requestId, {
        requestId: payload.requestId,
        requesterUserId: socket.data.userId,
        requesterEmail: socket.data.email,
        ownerUserId,
        expiresAt: nowMs() + REQUEST_TTL_MS,
      });

      io.to(userRoom(ownerUserId)).emit('file:permission-prompt', {
        ...payload,
        ownerUserId,
        requesterUserId: socket.data.userId,
        requesterEmail: socket.data.email,
        requestedAt: new Date().toISOString(),
      } satisfies TransferRequestDto);

      relayDebugLog('emitted file:permission-prompt', {
        requestId: payload.requestId,
        room: userRoom(ownerUserId),
        ownerUserId,
        requesterUserId: socket.data.userId,
      });
    });

    socket.on('file:permission-response', (payload: TransferPermissionResponseDto) => {
      const pending = pendingRequests.get(payload.requestId);
      if (!pending) {
        emitSocketError(socket, {
          requestId: payload.requestId,
          code: 'request_not_found',
          message: 'Request is expired or unknown',
        });
        return;
      }

      if (pending.ownerUserId !== socket.data.userId) {
        emitSocketError(socket, {
          requestId: payload.requestId,
          code: 'forbidden',
          message: 'Only owner can respond to the request',
        });
        return;
      }

      if (!payload.approved) {
        io.to(userRoom(pending.requesterUserId)).emit('file:permission-result', {
          requestId: payload.requestId,
          approved: false,
          reason: payload.reason ?? 'Request denied by owner',
          ownerUserId: pending.ownerUserId,
          ownerEmail: socket.data.email,
        } satisfies TransferPermissionResponseDto);
        pendingRequests.delete(payload.requestId);
        return;
      }

      if (!isUserOnline(io, pending.requesterUserId)) {
        emitSocketError(socket, {
          requestId: payload.requestId,
          code: 'requester_offline',
          message: 'Requester is offline, cannot start transfer',
        });
        pendingRequests.delete(payload.requestId);
        return;
      }

      const transferId = payload.transferId ?? payload.requestId;
      transferSessions.set(transferId, {
        transferId,
        requestId: payload.requestId,
        ownerUserId: pending.ownerUserId,
        requesterUserId: pending.requesterUserId,
        lastDurableSequence: -1,
        durableBytesWritten: 0,
        expiresAt: nowMs() + TRANSFER_TTL_MS,
      });
      pendingRequests.delete(payload.requestId);

      io.to(userRoom(pending.requesterUserId)).emit('file:permission-result', {
        requestId: payload.requestId,
        transferId,
        approved: true,
        ownerUserId: pending.ownerUserId,
        ownerEmail: socket.data.email,
      } satisfies TransferPermissionResponseDto);
    });

    socket.on('file:stream-start', (payload: TransferStartDto) => {
      const session = assertOwnerSession(socket, payload.transferId);
      if (!session) return;

      transferSessions.set(payload.transferId, {
        ...session,
        expiresAt: nowMs() + TRANSFER_TTL_MS,
      });

      io.to(userRoom(session.requesterUserId)).emit('file:stream-start', payload);
    });

    socket.on('file:chunk', (payload: TransferChunkDto) => {
      const session = assertOwnerSession(socket, payload.transferId);
      if (!session) return;

      const payloadBytes = getPayloadByteLength(payload.payload);
      if (payloadBytes > MAX_CHUNK_BYTES) {
        emitSocketError(socket, {
          transferId: payload.transferId,
          code: 'chunk_too_large',
          message: `Chunk exceeds ${MAX_CHUNK_BYTES} bytes limit`,
        });
        return;
      }

      transferSessions.set(payload.transferId, {
        ...session,
        expiresAt: nowMs() + TRANSFER_TTL_MS,
      });

      io.to(userRoom(session.requesterUserId)).emit('file:chunk', payload);
    });

    socket.on('file:durable-ack', (payload: TransferDurableAckDto) => {
      const session = assertRequesterSession(socket, payload.transferId);
      if (!session) return;

      if (payload.sequence <= session.lastDurableSequence) {
        emitSocketError(socket, {
          transferId: payload.transferId,
          code: 'invalid_ack_sequence',
          message: 'Ack sequence must increase monotonically',
        });
        return;
      }

      const updatedSession: TransferSession = {
        ...session,
        lastDurableSequence: payload.sequence,
        durableBytesWritten: payload.durableBytesWritten,
        expiresAt: nowMs() + TRANSFER_TTL_MS,
      };
      transferSessions.set(payload.transferId, updatedSession);

      io.to(userRoom(session.ownerUserId)).emit('file:durable-ack', payload);
    });

    socket.on('file:resume-sync', (payload: TransferResumeSyncDto) => {
      const session = assertRequesterSession(socket, payload.transferId);
      if (!session) return;

      const updatedSession: TransferSession = {
        ...session,
        lastDurableSequence: payload.lastDurableSequence,
        durableBytesWritten: payload.durableBytesWritten,
        expiresAt: nowMs() + TRANSFER_TTL_MS,
      };
      transferSessions.set(payload.transferId, updatedSession);

      io.to(userRoom(session.ownerUserId)).emit('file:resume-sync', payload);
    });

    socket.on('file:complete', (payload: TransferCompleteDto) => {
      const session = transferSessions.get(payload.transferId);
      if (!session) {
        emitSocketError(socket, {
          transferId: payload.transferId,
          code: 'transfer_not_found',
          message: 'Transfer session does not exist',
        });
        return;
      }

      const isOwner = session.ownerUserId === socket.data.userId;
      const isRequester = session.requesterUserId === socket.data.userId;
      if (!isOwner && !isRequester) {
        emitSocketError(socket, {
          transferId: payload.transferId,
          code: 'forbidden',
          message: 'User is not part of this transfer',
        });
        return;
      }

      const peerUserId = isOwner ? session.requesterUserId : session.ownerUserId;
      io.to(userRoom(peerUserId)).emit('file:complete', payload);
      transferSessions.delete(payload.transferId);
    });

    socket.on('file:cancel', (payload: TransferCancelDto) => {
      const session = transferSessions.get(payload.transferId);
      if (!session) {
        return;
      }

      const isOwner = session.ownerUserId === socket.data.userId;
      const isRequester = session.requesterUserId === socket.data.userId;
      if (!isOwner && !isRequester) {
        emitSocketError(socket, {
          transferId: payload.transferId,
          code: 'forbidden',
          message: 'User is not part of this transfer',
        });
        return;
      }

      const peerUserId = isOwner ? session.requesterUserId : session.ownerUserId;
      io.to(userRoom(peerUserId)).emit('file:cancel', payload);
      transferSessions.delete(payload.transferId);
    });

    socket.on('file:error', (payload: TransferErrorDto) => {
      if (!payload.transferId) {
        return;
      }

      const session = transferSessions.get(payload.transferId);
      if (!session) {
        return;
      }

      const isOwner = session.ownerUserId === socket.data.userId;
      const isRequester = session.requesterUserId === socket.data.userId;
      if (!isOwner && !isRequester) {
        return;
      }

      const peerUserId = isOwner ? session.requesterUserId : session.ownerUserId;
      io.to(userRoom(peerUserId)).emit('file:error', payload);
    });
  });

  const cleanupTimer = setInterval(cleanupExpiredSessions, 60_000);
  cleanupTimer.unref();
}