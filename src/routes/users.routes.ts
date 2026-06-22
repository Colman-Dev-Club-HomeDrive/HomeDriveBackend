import { Router } from 'express';
import { getUserById, listUsers, registerUser } from '../controllers/users.controller.js';
import { validateRegisterUser, validateUserId } from '../validators/users.validator.js';

export const usersRouter = Router();

usersRouter.get('/', listUsers);
usersRouter.post('/register', validateRegisterUser, registerUser);
usersRouter.get('/:id', validateUserId, getUserById);
