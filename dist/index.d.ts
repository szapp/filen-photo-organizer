interface Return {
    numFiles: number;
    numErrors: number;
    errors: string[];
}
export default function organizePhotos(rootPath: string, dirPattern?: string, filePattern?: string, fallbackTimeZone?: string, dryRun?: boolean): Promise<Return>;
export {};
