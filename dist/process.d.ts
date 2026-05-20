import type { FilenSDK, FSStats } from '@filen/sdk';
import type { Mutex } from 'async-mutex';
export default function processFile(filen: FilenSDK, writeAccess: Mutex, rootPath: string, fileName: string, stats: FSStats, destPath?: string, dirPattern?: string, filePattern?: string, convertHeic?: boolean, keepOriginal?: boolean, dryRun?: boolean): Promise<void>;
