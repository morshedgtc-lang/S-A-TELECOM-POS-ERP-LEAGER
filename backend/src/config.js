const DEV_SECRET = 'dev-only-change-me';

export const config = {
  port: Number(process.env.PORT || 4000),
  dbFile: process.env.DB_FILE || './data/sa_pos.db',
  jwtSecret: process.env.JWT_SECRET || DEV_SECRET,
  // Comma-separated web origins. The Android/iOS app origins are always allowed (see NATIVE_ORIGINS).
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  bootstrapOwnerId: process.env.OWNER_ID || 'owner',
  bootstrapOwnerPassword: process.env.OWNER_PASSWORD || 'change-me-now',
};

/** Origins the Capacitor apps load from (Android: https://localhost, iOS: capacitor://localhost). */
export const NATIVE_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

if (process.env.NODE_ENV === 'production' && config.jwtSecret === DEV_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
