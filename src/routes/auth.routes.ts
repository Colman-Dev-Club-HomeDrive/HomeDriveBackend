import { Router } from 'express';
import { changePassword, login, logout, me, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateChangePassword, validateLogin, validateRegister } from '../validators/auth.validator.js';

export const authRouter = Router();

authRouter.post('/register', validateRegister, register);
authRouter.post('/login', validateLogin, login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
authRouter.post('/change-password', requireAuth, validateChangePassword, changePassword);
authRouter.patch('/change-password', requireAuth, validateChangePassword, changePassword);
