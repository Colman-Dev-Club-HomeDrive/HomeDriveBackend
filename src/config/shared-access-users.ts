export type SharedAccessRole = 'manager' | 'editor' | 'viewer';

export const SHARED_ACCESS_ROLES: SharedAccessRole[] = ['manager', 'editor', 'viewer'];

export type SharedAccessUser = {
	email: string;
	role: SharedAccessRole;
};

export const SHARED_ACCESS_USERS: SharedAccessUser[] = [
	{ email: 'snir@test.com', role: 'manager' },
	{ email: 'tal@test.com', role: 'manager' },
];
