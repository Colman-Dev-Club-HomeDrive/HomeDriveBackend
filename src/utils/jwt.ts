import * as jwtModule from 'jsonwebtoken';

// jsonwebtoken is CommonJS; in ESM its API is exposed on the default export.
export const jwt = jwtModule.default;

export type { SignOptions } from 'jsonwebtoken';
