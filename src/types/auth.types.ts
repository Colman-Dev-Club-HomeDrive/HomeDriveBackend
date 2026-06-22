export type JwtPayload = {
  userId: string;
  email: string;
};

export type AuthRegisterResponse = {
  success: true;
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};
