import date from 'date-and-time';
import exifr from 'exifr';
import convert from 'heic-jpg-exif';
import { posix } from 'path';
export default async function processFile(filen, filePath, dirPattern = 'YYYY-MM', filePattern = 'YYYY-MM-DD_HH.mm.ss', writeAccess, dryRun = false) {
    var _a;
    const fileName = posix.basename(filePath);
    const rootPath = posix.dirname(filePath);
    let fileExt = posix.extname(fileName);
    try {
        // Only operate on files
        const stats = await filen.fs().stat({
            path: filePath,
        });
        if (!stats.isFile())
            return;
        let dateTaken;
        let fileContents;
        const { mime } = stats;
        // Look for date-created in EXIF metadata
        if (mime === 'image/jpeg' ||
            mime === 'image/png' ||
            mime === 'image/heic' ||
            mime === 'image/heif' ||
            mime === 'image/avif' ||
            mime === 'image/tiff') {
            // Read the file
            fileContents = await filen.fs().readFile({
                path: filePath,
            });
            // Retrieve date-taken from EXIF
            dateTaken = (_a = (await exifr.parse(fileContents, ['DateTimeOriginal']))) === null || _a === void 0 ? void 0 : _a.DateTimeOriginal;
        }
        // Fall back to date in file name or file creation date or file modification date
        if (!dateTaken) {
            const birthtimeMsDate = new Date(stats.birthtimeMs);
            const mtimeMsDate = new Date(stats.mtimeMs);
            const baseName = posix.basename(fileName, fileExt);
            const regex = /(?<!\d)(?<year>(?:19|20)?\d{2})(?:_|-|\.)?(?<month>0[1-9]|1[0-2])(?:_|-|\.)?(?<day>[0-3]\d)(?:_|-|\.)?(?<hour>[0-1][0-9]|2[0-4])?(?:_|-|\.)?(?<min>[0-6]\d)?(?:_|-|\.)?(?<sec>[0-6]\d)?/;
            const match = baseName.match(regex);
            if (match) {
                const res = match.groups;
                const [yy, month, day, hour, min, sec] = Object.values(res).map(Number);
                let year = yy;
                if (year < 100) {
                    const currentYear = Number(String(new Date().getFullYear()).substring(2));
                    year += year > currentYear ? 1900 : 2000;
                }
                const fileNameDate = new Date(year, month - 1, day, Number.isNaN(hour) ? 12 : hour, Number.isNaN(min) ? 0 : min, Number.isNaN(sec) ? 0 : sec);
                // Cross-check if date matches file times
                if (date.isSameDay(fileNameDate, birthtimeMsDate))
                    dateTaken = birthtimeMsDate;
                else if (date.isSameDay(fileNameDate, mtimeMsDate))
                    dateTaken = mtimeMsDate;
                else
                    dateTaken = fileNameDate;
            }
            else {
                // Fall back to file creation or modification date - whichever is older
                dateTaken = birthtimeMsDate < mtimeMsDate ? birthtimeMsDate : mtimeMsDate;
            }
        }
        // Make path names
        const newDirName = dirPattern ? date.format(dateTaken, dirPattern) : '';
        const newDirPath = posix.join(rootPath, newDirName);
        let newBaseName = filePattern ? date.format(dateTaken, filePattern) : posix.basename(filePath, fileExt);
        // Convert HEIF
        if (mime === 'image/heic' || mime === 'image/heif') {
            fileContents = (await convert(fileContents));
            fileExt = '.jpg';
        }
        // Check for existing files with the same name sequentially to avoid file name collisions
        const release = await writeAccess.acquire();
        try {
            // Check destination directory for files with matching file name
            let newDirContents;
            try {
                newDirContents = await filen.fs().readdir({
                    path: newDirPath,
                });
            }
            catch (_b) {
                newDirContents = [];
            }
            const fileNamePattern = new RegExp(`^${newBaseName}(?:_(?<index>\\d{3}))?${fileExt}$`);
            newDirContents = newDirContents.filter((item) => item.match(fileNamePattern)).sort();
            // If there are files with similar file name, check for identical files
            if (newDirContents.length > 0) {
                // Load the current file into memory for comparison
                if (!fileContents) {
                    fileContents = await filen.fs().readFile({
                        path: filePath,
                    });
                }
                // Check if the file is identical to any of the existing files
                let duplicate = false;
                for (let idx = 0; idx < newDirContents.length; idx++) {
                    const checkFileName = newDirContents[idx];
                    const checkFileContents = await filen.fs().readFile({
                        path: posix.join(newDirPath, checkFileName),
                    });
                    // Files are identical: Abort and delete one
                    if (!fileContents.compare(checkFileContents)) {
                        console.log(`Delete '${fileName}', because it already exists: '${posix.join(newDirName, checkFileName)}'`);
                        if (!dryRun) {
                            await filen.fs().unlink({
                                path: filePath,
                                permanent: true,
                            });
                        }
                        duplicate = true;
                        break;
                    }
                }
                if (duplicate)
                    return;
                // Find the next lowest available suffix index
                const idxCandidates = [...Array(newDirContents.length + 2).keys()];
                const idxTaken = newDirContents.map((item) => { var _a, _b, _c; return Number((_c = (_b = (_a = item.match(fileNamePattern)) === null || _a === void 0 ? void 0 : _a.groups) === null || _b === void 0 ? void 0 : _b.index) !== null && _c !== void 0 ? _c : '000'); });
                const idxNext = Math.min(...idxCandidates.filter((x) => x && !idxTaken.includes(x)));
                newBaseName += '_' + String(idxNext).padStart(3, '0');
            }
            // Rename (move) or upload and delete (convert)
            const newFileName = `${newBaseName}${fileExt}`;
            const newFileSubpath = posix.join(newDirName, newFileName);
            const newFilePath = posix.join(rootPath, newFileSubpath);
            if (mime === 'image/heic' || mime === 'image/heif') {
                console.log(`Convert '${fileName}' to '${newFileSubpath}'`);
                if (!dryRun) {
                    await filen.fs().writeFile({
                        content: fileContents,
                        path: newFilePath,
                    });
                    await filen.fs().unlink({
                        path: filePath,
                        permanent: false,
                    });
                }
            }
            else {
                // Three-step process to prevent possible failure in filen-sdk if a file of the same name exists in the destication
                const tmpFileName = `${newBaseName}_${fileName}`;
                const tmpFilePath1 = posix.join(rootPath, tmpFileName);
                const tmpFileSubpath2 = posix.join(newDirName, tmpFileName);
                const tmpFilePath2 = posix.join(rootPath, tmpFileSubpath2);
                console.log(`Move '${fileName}' to '${newFileSubpath}'`);
                if (!dryRun) {
                    // Rename file within same folder
                    await filen.fs().rename({
                        from: filePath,
                        to: tmpFilePath1,
                    });
                    // Move renamed file into destination folder
                    await filen.fs().rename({
                        from: tmpFilePath1,
                        to: tmpFilePath2,
                    });
                    // Read directory contents in-between to avoid zero-size files
                    newDirContents = await filen.fs().readdir({
                        path: newDirPath,
                    });
                    // Rename renamed file in destination folder to final file name
                    await filen.fs().rename({
                        from: tmpFilePath2,
                        to: newFilePath,
                    });
                }
            }
        }
        finally {
            release();
        }
    }
    catch (e) {
        const error = e;
        console.log(`Error on '${fileName}': ${(error === null || error === void 0 ? void 0 : error.message) || error}`);
    }
}
//# sourceMappingURL=process.js.map