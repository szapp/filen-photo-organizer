export default function organizePhotos(credentials: {
    email: string;
    password: string;
    twoFactorCode: string | undefined;
}, rootPath: string, dirPattern?: string, filePattern?: string, dryRun?: boolean): Promise<void>;
