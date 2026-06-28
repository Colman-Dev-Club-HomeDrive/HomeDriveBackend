import { Router } from 'express';
import {
	addAccessUser,
	listAccessAdminUsers,
	listAccessUsers,
	removeAccessUser,
	updateAccessUserRole,
} from '../controllers/access.controller.js';

export const accessRouter = Router();

accessRouter.get('/users', listAccessUsers);
accessRouter.get('/admin/users', listAccessAdminUsers);
accessRouter.post('/users', addAccessUser);
accessRouter.delete('/users', removeAccessUser);
accessRouter.patch('/users/role', updateAccessUserRole);
