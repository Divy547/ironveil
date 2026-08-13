export interface AppConfig {
  readonly nodeEnv: string;
  readonly port: number;
  readonly auth: {
    readonly jwtSecret: string | undefined;
  };
}

export function loadConfiguration(): AppConfig {
  return {
    nodeEnv:
      process.env.NODE_ENV ?? 'development',

    port: Number(
      process.env.PORT ?? 3000,
    ),

    auth: {
      jwtSecret:
        process.env.JWT_SECRET,
    },
  };
}