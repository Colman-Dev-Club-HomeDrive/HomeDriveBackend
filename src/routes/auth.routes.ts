import { Router } from 'express';
import { login, logout, me, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateLogin, validateRegister } from '../validators/auth.validator.js';

export const authRouter = Router();

authRouter.post('/register', validateRegister, register);
authRouter.post('/login', validateLogin, login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
