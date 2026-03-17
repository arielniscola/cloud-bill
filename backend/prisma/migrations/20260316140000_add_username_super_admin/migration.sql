-- Add SUPER_ADMIN to UserRole enum
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN' BEFORE 'ADMIN';

-- Add username column (populated from email initially)
ALTER TABLE users ADD COLUMN username TEXT;
UPDATE users SET username = email;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);

-- Make email optional
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
