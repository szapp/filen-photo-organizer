import { Mutex } from 'async-mutex';
export default function processFile(filePath: string, dirPattern: string | undefined, filePattern: string | undefined, writeAccess: Mutex, dryRun?: boolean): Promise<void>;
