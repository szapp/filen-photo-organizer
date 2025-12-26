import { Mutex } from 'async-mutex';
import FilenSDK from '@filen/sdk';
export default function processFile(filen: FilenSDK, rootPath: string, fileName: string, destPath: string | undefined, dirPattern: string | undefined, filePattern: string | undefined, keepOriginals: boolean | undefined, writeAccess: Mutex, dryRun?: boolean): Promise<void>;
