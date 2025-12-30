import { Mutex } from 'async-mutex';
import FilenSDK, { FSStats } from '@filen/sdk';
export default function processFile(filen: FilenSDK, writeAccess: Mutex, rootPath: string, fileName: string, stats: FSStats, destPath?: string, dirPattern?: string, filePattern?: string, convertHeic?: boolean, keepOriginal?: boolean, dryRun?: boolean): Promise<void>;
