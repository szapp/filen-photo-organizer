import { Mutex } from 'async-mutex';
import FilenSDK from '@filen/sdk';
export default function processFile(filen: FilenSDK, filePath: string, dirPattern: string | undefined, filePattern: string | undefined, writeAccess: Mutex, dryRun?: boolean): Promise<void>;
