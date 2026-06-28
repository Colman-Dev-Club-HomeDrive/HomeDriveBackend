export type JwtPayload = {
  userId: string;
  email: string;
};

export type AuthLocals = {
  auth?: JwtPayload;
};

export type LoginUserBody = {
  email: string;
  password: string;
};

export type AuthTokenResponse = {
  success: true;
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export type AuthRegisterResponse = AuthTokenResponse;

export type AuthMeResponse = {
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export type ChangePasswordBody = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

export type ChangePasswordResponse = {
  success: true;
  message: string;
};
