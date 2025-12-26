interface Return {
    numFiles: number;
    numErrors: number;
    errors: string[];
}
export default function organizePhotos(credentials: {
    email: string;
    password: string;
    twoFactorCode: string | undefined;
    twoFactorSecret: string | undefined;
}, rootPath: string, recursive?: boolean, convertHeic?: boolean, keepOriginals?: boolean, destPath?: string, dirPattern?: string, filePattern?: string, fallbackTimeZone?: string, // Filen.io location
dryRun?: boolean): Promise<Return>;
export {};
