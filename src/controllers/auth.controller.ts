import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/User.model.js';
import type { AuthRegisterResponse } from '../types/auth.types.js';
import type { RegisterUserBody } from '../types/user.types.js';

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

    const token = jwt.sign({ userId: user._id.toString(), email: user.email }, jwtSecret);

    const response: AuthRegisterResponse = {
      success: true,
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    };

    return res.status(201).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'server error' });
  }
}
