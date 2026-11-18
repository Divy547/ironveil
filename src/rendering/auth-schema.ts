/**
 * The Prisma schema and SQL that JWT auth adds. `create --auth jwt` puts them
 * into the first schema and migration; `ironveil add auth` reuses the same
 * text for an additive migration, so the two can never drift apart.
 */

/** Lines added inside `model User`, each starting with a newline-free indent. */
export const PRISMA_AUTH_USER_FIELD_LINES = [
  '  role         Role     @default(USER)',
  '  refreshTokens RefreshToken[]',
] as const;

export const PRISMA_AUTH_ENUM = ['enum Role {', '  USER', '  ADMIN', '}'].join('\n');

export const PRISMA_AUTH_REFRESH_TOKEN_MODEL = [
  'model RefreshToken {',
  '  id        String    @id @default(cuid())',
  '  tokenHash String    @unique',
  '  familyId  String',
  '  userId    String',
  '  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)',
  '  expiresAt DateTime',
  '  revokedAt DateTime?',
  '  createdAt DateTime  @default(now())',
  '',
  '  @@index([userId])',
  '  @@index([familyId])',
  '}',
].join('\n');

export const MIGRATION_AUTH_ENUM =
  '-- CreateEnum\nCREATE TYPE "Role" AS ENUM (\'USER\', \'ADMIN\');';

export const MIGRATION_AUTH_USER_COLUMN = '    "role" "Role" NOT NULL DEFAULT \'USER\',';

/** Statements after the enum and the User column: the RefreshToken table. */
export const MIGRATION_AUTH_TABLES = [
  '-- CreateTable',
  'CREATE TABLE "RefreshToken" (',
  '    "id" TEXT NOT NULL,',
  '    "tokenHash" TEXT NOT NULL,',
  '    "familyId" TEXT NOT NULL,',
  '    "userId" TEXT NOT NULL,',
  '    "expiresAt" TIMESTAMP(3) NOT NULL,',
  '    "revokedAt" TIMESTAMP(3),',
  '    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '',
  '    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")',
  ');',
  '',
  '-- CreateIndex',
  'CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");',
  '',
  '-- CreateIndex',
  'CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");',
  '',
  '-- CreateIndex',
  'CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");',
  '',
  '-- AddForeignKey',
  'ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
].join('\n');
