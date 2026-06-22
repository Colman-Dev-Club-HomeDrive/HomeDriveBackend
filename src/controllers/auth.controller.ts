import type { Request, Response } from 'express';
import { compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel, type UserDocument } from '../models/User.model.js';
import type { AuthRegisterResponse, AuthTokenResponse, LoginUserBody } from '../types/auth.types.js';
import type { RegisterUserBody } from '../types/user.types.js';

const UNAUTHORIZED_MESSAGE = 'invalid email or password';

function createAuthToken(user: Pick<UserDocument, '_id' | 'email'>, jwtSecret: string): string {
  return jwt.sign({ userId: user._id.toString(), email: user.email }, jwtSecret);
}

function buildAuthResponse(
  user: Pick<UserDocument, '_id' | 'name' | 'email'>,
  token: string,
): AuthTokenResponse {
  return {
    success: true,
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  };
}

export async function register(req: Request, res: Response) {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ message: 'server configuration error' });
    }

    const { email, name, password } = req.body as RegisterUserBody;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'user already exists' });
    }

    const user = await UserModel.create({
      email: normalizedEmail,
      name: name.trim(),
      password,
      posts: [],
    });

    const token = createAuthToken(user, jwtSecret);
    const response: AuthRegisterResponse = buildAuthResponse(user, token);

    return res.status(201).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'server error' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ message: 'server configuration error' });
    }

    const { email, password } = req.body as LoginUserBody;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await UserModel.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({ message: UNAUTHORIZED_MESSAGE });
    }

    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: UNAUTHORIZED_MESSAGE });
    }

    const token = createAuthToken(user, jwtSecret);
    const response = buildAuthResponse(user, token);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'server error' });
  }
}
