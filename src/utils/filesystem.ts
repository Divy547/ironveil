import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export interface FileSystem {
  ensureDirectory(directoryPath: string): Promise<void>;
  writeFile(
    filePath: string,
    content: string,
  ): Promise<void>;
  readFile(filePath: string): Promise<string>;
  exists(filePath: string): Promise<boolean>;
  remove(targetPath: string): Promise<void>;
  move(sourcePath: string, destinationPath: string): Promise<void>;
}

export function createFileSystem(): FileSystem {
  return {
    async ensureDirectory(directoryPath: string): Promise<void> {
      await mkdir(directoryPath, { recursive: true });
    },

    async writeFile(
      filePath: string,
      content: string,
    ): Promise<void> {
      await mkdir(path.dirname(filePath), {
        recursive: true,
      });

      await writeFile(filePath, content, 'utf8');
    },

    async readFile(filePath: string): Promise<string> {
      return readFile(filePath, 'utf8');
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        await access(filePath, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },

    async remove(targetPath: string): Promise<void> {
      await rm(targetPath, {
        recursive: true,
        force: true,
      });
    },

    async move(
      sourcePath: string,
      destinationPath: string,
    ): Promise<void> {
      try {
        await rename(sourcePath, destinationPath);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'EXDEV'
        ) {
          // Compatibility path for cross-device moves (not atomic)
          await cp(sourcePath, destinationPath, {
            recursive: true,
          });
          await rm(sourcePath, {
            recursive: true,
            force: true,
          });
          return;
        }

        throw error;
      }
    },
  };
}