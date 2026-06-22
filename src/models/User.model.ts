import { hash } from 'bcryptjs';
import { Schema, model, Types, type HydratedDocument } from 'mongoose';

const SALT_ROUNDS = 10;

type UserProps = {
  email: string;
  name: string;
  password: string;
  posts: Types.ObjectId[];
};

export type UserDocument = HydratedDocument<UserProps>;

const UserSchema = new Schema<UserProps>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    password: { type: String, required: true, select: false },
    posts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const { password: _password, ...user } = ret;
        return user;
      },
    },
    toObject: {
      transform(_doc, ret) {
        const { password: _password, ...user } = ret;
        return user;
      },
    },
  },
);

UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await hash(this.password, SALT_ROUNDS);
});

export const UserModel = model<UserProps>('User', UserSchema);
