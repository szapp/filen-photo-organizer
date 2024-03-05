export default function organizePhotos(credentials: {
    email: string;
    password: string;
    twoFactorCode: string | undefined;
}, rootPath: string, dirPattern?: string, filePattern?: string, timeZone?: string, // Filen.io location
dryRun?: boolean): Promise<void>;
