import type { Generator } from './generator.js';
import { BaseProjectGenerator } from '../project/base-project.generator.js';
import { ConfigGenerator } from '../features/config/config.generator.js';
import { PrismaGenerator } from '../features/prisma/prisma.generator.js';
import { AuthGenerator } from '../features/auth/auth.generator.js';
import { SwaggerGenerator } from '../features/swagger/swagger.generator.js';

export function createGenerators(): readonly Generator[] {
  return Object.freeze([
    new BaseProjectGenerator(),
    new ConfigGenerator(),
    new PrismaGenerator(),
    new AuthGenerator(),
    new SwaggerGenerator(),
  ]);
}