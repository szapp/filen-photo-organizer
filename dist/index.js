import { Mutex } from 'async-mutex';
import FilenSDK from '@filen/sdk';
import * as OTPAuth from 'otpauth';
import { posix } from 'path';
import processFile from './process.js';
export default async function organizePhotos(credentials, rootPath, dirPattern = 'YYYY-MM', filePattern = 'YYYY-MM-DD_HH.mm.ss', dryRun = false) {
    const filen = new FilenSDK({
        metadataCache: true,
    });
    try {
        await filen.login({
            email: credentials.email,
            password: credentials.password,
            twoFactorCode: credentials.twoFactorCode ? new OTPAuth.TOTP({ secret: credentials.twoFactorCode }).generate() : undefined,
        });
        // Read directory
        let dirContents = await filen.fs().readdir({
            path: rootPath,
        });
        // Exclude directories by inspecting file extensions
        dirContents = dirContents.filter((name) => name.indexOf('.') !== -1).sort();
        // Individually process each file asynchronously
        // Nevertheless, create a mutex for writing operations to avoid file name collisions
        const writeAccess = new Mutex();
        console.log(`Process ${dirContents.length} files in '${rootPath}'`);
        await Promise.allSettled(dirContents.map((fileName) => processFile(filen, posix.join(rootPath, fileName), dirPattern, filePattern, writeAccess, dryRun)));
    }
    finally {
        filen.logout();
        filen.clearTemporaryDirectory();
    }
    console.log('Done');
}
//# sourceMappingURL=index.js.map