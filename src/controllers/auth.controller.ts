import type { Request, Response } from 'express';
import { UserModel, type UserDocument } from '../models/User.model.js';
import type {
  AuthRegisterResponse,
  AuthMeResponse,
  AuthTokenResponse,
  AuthLocals,
  ChangePasswordBody,
  ChangePasswordResponse,
  LoginUserBody,
} from '../types/auth.types.js';
import type { RegisterUserBody } from '../types/user.types.js';
import { clearAuthCookie, getJwtExpiresIn, setAuthCookie } from '../utils/auth-cookie.js';
import { jwt, type SignOptions } from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const UNAUTHORIZED_MESSAGE = 'invalid email or password';

function createAuthToken(user: Pick<UserDocument, '_id' | 'email'>, jwtSecret: string): string {
  const signOptions: SignOptions = { expiresIn: getJwtExpiresIn() as SignOptions['expiresIn'] };
  return jwt.sign({ userId: user._id.toString(), email: user.email }, jwtSecret, signOptions);
}

function getAuthUserId(res: Response<unknown, AuthLocals>): string | null {
  const userId = res.locals.auth?.userId;
  return typeof userId === 'string' && userId.trim() ? userId : null;
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
    setAuthCookie(res, token);
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

    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: UNAUTHORIZED_MESSAGE });
    }

    const token = createAuthToken(user, jwtSecret);
    setAuthCookie(res, token);
    const response = buildAuthResponse(user, token);

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'server error' });
  }
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  return res.status(200).json({ success: true });
}

export async function me(_req: Request, res: Response<unknown, AuthLocals>) {
  try {
    const userId = getAuthUserId(res);
    if (!userId) {
      return res.status(401).json({ message: 'missing or invalid authentication token' });
    }

    const user = await UserModel.findById(userId).select('name email');
    if (!user) {
      return res.status(404).json({ message: 'user not found' });
    }

    const response: AuthMeResponse = {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'server error' });
  }
}

export async function changePassword(req: Request, res: Response<unknown, AuthLocals>) {
  try {
    const userId = getAuthUserId(res);
    if (!userId) {
      return res.status(401).json({ message: 'missing or invalid authentication token' });
    }

    const { currentPassword, newPassword } = req.body as ChangePasswordBody;
    const normalizedCurrentPassword = currentPassword.trim();
    const normalizedNewPassword = newPassword.trim();

    const user = await UserModel.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'user not found' });
    }

    const isCurrentPasswordValid = await verifyPassword(normalizedCurrentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ message: 'current password is incorrect' });
    }

    const hashedPassword = await hashPassword(normalizedNewPassword);
    const updateResult = await UserModel.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
    if (updateResult.matchedCount === 0) {
      return res.status(404).json({ message: 'user not found' });
    }

    const updatedUser = await UserModel.findById(user._id).select('+password');
    if (!updatedUser || !(await verifyPassword(normalizedNewPassword, updatedUser.password))) {
      return res.status(500).json({ message: 'failed to update password' });
    }

    const response: ChangePasswordResponse = {
      success: true,
      message: 'password updated successfully',
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'server error' });
  }
}
