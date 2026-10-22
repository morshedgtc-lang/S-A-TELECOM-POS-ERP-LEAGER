const DEV_SECRET = 'dev-only-change-me';

export const config = {
  port: Number(process.env.PORT || 4000),
  dbFile: process.env.DB_FILE || './data/sa_pos.db',
  jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  bootstrapOwnerId: process.env.OWNER_ID || 'owner',
  bootstrapOwnerPassword: process.env.OWNER_PASSWORD || 'change-me-now',
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret === DEV_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
