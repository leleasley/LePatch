export const env = {
  get appUrl() { return process.env.APP_URL || "http://localhost:3000"; },
  get sessionSecret() {
    const val = process.env.SESSION_SECRET;
    if (val) return val;
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    return "development-session-secret-change-me";
  },
  get redisUrl() { return process.env.REDIS_URL || "redis://localhost:6379"; },
  get trustProxy() { return process.env.TRUST_PROXY === "true"; },
};
