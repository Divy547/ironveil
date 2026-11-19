import { z } from 'zod';

export const IronveilConfigSchema = z.object({
  projectName: z
    .string()
    .trim()
    .min(1, 'Project name is required')
    .regex(
      /^[a-z0-9][a-z0-9._-]*$/,
      'Project name must contain only lowercase letters, numbers, dots, underscores, and hyphens',
    ),

  database: z.literal('postgres').default('postgres'),

  orm: z.literal('prisma').default('prisma'),

  redis: z.boolean().default(false),

  queue: z.boolean().default(false),

  mail: z.boolean().default(false),

  otel: z.boolean().default(false),

  auth: z.enum(['none', 'jwt']).default('none'),

  swagger: z.boolean().default(true),

  docker: z.boolean().default(true),

  ci: z.boolean().default(true),

  testing: z.boolean().default(true),

  packageManager: z.enum(['npm', 'pnpm', 'yarn']).default('npm'),

  ai: z.enum(['none', 'agents', 'all']).default('agents'),
});

export type IronveilConfigInput = z.input<typeof IronveilConfigSchema>;

export type IronveilConfigOutput = z.output<typeof IronveilConfigSchema>;