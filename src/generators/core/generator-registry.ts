import type { Generator } from './generator.js';
import { BaseProjectGenerator } from '../project/base-project.generator.js';
import { ConfigGenerator } from '../features/config/config.generator.js';
import { LoggingGenerator } from '../features/logging/logging.generator.js';
import { ErrorHandlingGenerator } from '../features/error-handling/error-handling.generator.js';
import { SecurityGenerator } from '../features/security/security.generator.js';
import { HealthGenerator } from '../features/health/health.generator.js';
import { PrismaGenerator } from '../features/prisma/prisma.generator.js';
import { RedisGenerator } from '../features/redis/redis.generator.js';
import { QueueGenerator } from '../features/queue/queue.generator.js';
import { AuthGenerator } from '../features/auth/auth.generator.js';
import { SwaggerGenerator } from '../features/swagger/swagger.generator.js';
import { TestingGenerator } from '../features/testing/testing.generator.js';
import { LintGenerator } from '../features/lint/lint.generator.js';
import { DockerGenerator } from '../features/docker/docker.generator.js';
import { CiGenerator } from '../features/ci/ci.generator.js';
import { AgentsGenerator } from '../features/agents/agents.generator.js';
import { ManifestGenerator } from '../features/manifest/manifest.generator.js';

export function createGenerators(): readonly Generator[] {
  return Object.freeze([
    new BaseProjectGenerator(),
    new ConfigGenerator(),
    new LoggingGenerator(),
    new SecurityGenerator(),
    new ErrorHandlingGenerator(),
    new HealthGenerator(),
    new PrismaGenerator(),
    new RedisGenerator(),
    new QueueGenerator(),
    new AuthGenerator(),
    new SwaggerGenerator(),
    new TestingGenerator(),
    new LintGenerator(),
    new DockerGenerator(),
    new CiGenerator(),
    new AgentsGenerator(),
    new ManifestGenerator(),
  ]);
}