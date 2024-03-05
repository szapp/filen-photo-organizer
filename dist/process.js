"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exifr_1 = __importDefault(require("exifr"));
const heic_jpg_exif_1 = __importDefault(require("heic-jpg-exif"));
const luxon_1 = require("luxon");
const path_1 = require("path");
async function processFile(filen, filePath, dirPattern = 'yyyy-MM', filePattern = 'yyyy-MM-dd_HH.mm.ss', writeAccess, dryRun = false) {
    var _a;
    const fileName = path_1.posix.basename(filePath);
    const rootPath = path_1.posix.dirname(filePath);
    let fileExt = path_1.posix.extname(fileName);
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
            const exifDate = (_a = (await exifr_1.default.parse(fileContents, ['DateTimeOriginal']))) === null || _a === void 0 ? void 0 : _a.DateTimeOriginal;
            if (typeof exifDate !== 'undefined')
                dateTaken = luxon_1.DateTime.fromJSDate(exifDate, { zone: 'utc' }).toLocal();
        }
        // Fall back to date in file name or file creation date or file modification date
        if (!dateTaken) {
            const dateCreated = luxon_1.DateTime.fromMillis(stats.birthtimeMs, { zone: 'utc' }).toLocal();
            const dateModified = luxon_1.DateTime.fromMillis(stats.mtimeMs, { zone: 'utc' }).toLocal();
            const baseName = path_1.posix.basename(fileName, fileExt);
            const regex = /(?<!\d)(?<year>(?:19|20)?\d{2})(?:_|-|\.)?(?<month>0[1-9]|1[0-2])(?:_|-|\.)?(?<day>[0-3]\d)(?:_|-|\.)?(?<hour>[0-1][0-9]|2[0-4])?(?:_|-|\.)?(?<min>[0-6]\d)?(?:_|-|\.)?(?<sec>[0-6]\d)?/;
            const match = baseName.match(regex);
            if (match) {
                const { year: yy, month, day, hour, min, sec } = match.groups;
                let year = Number(yy);
                if (year < 100) {
                    const currentYear = Number(String(new Date().getFullYear()).substring(2));
                    year += year > currentYear ? 1900 : 2000;
                }
                // Ensure correct timezone for comparison
                const fileNameDate = luxon_1.DateTime.fromISO(`${year}-${month}-${day}T${hour !== null && hour !== void 0 ? hour : '12'}:${min !== null && min !== void 0 ? min : '00'}:${sec !== null && sec !== void 0 ? sec : '00'}`);
                // Cross-check if date matches file times
                const sameDayCreated = fileNameDate.hasSame(dateCreated, 'day');
                const sameDayModified = fileNameDate.hasSame(dateModified, 'day');
                if (sameDayCreated && sameDayModified)
                    dateTaken = luxon_1.DateTime.min(dateCreated, dateModified);
                else if (sameDayCreated)
                    dateTaken = dateCreated;
                else if (sameDayModified)
                    dateTaken = dateModified;
                else
                    dateTaken = fileNameDate;
            }
            else {
                // Fall back to file creation or modification date - whichever is older
                dateTaken = luxon_1.DateTime.min(dateCreated, dateModified);
            }
        }
        // Make path names
        const newDirName = dirPattern ? dateTaken.toFormat(dirPattern) : '';
        const newDirPath = path_1.posix.join(rootPath, newDirName);
        let newBaseName = filePattern ? dateTaken.toFormat(filePattern) : path_1.posix.basename(filePath, fileExt);
        // Convert HEIF
        if (mime === 'image/heic' || mime === 'image/heif') {
            fileContents = (await (0, heic_jpg_exif_1.default)(fileContents));
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
                        path: path_1.posix.join(newDirPath, checkFileName),
                    });
                    // Files are identical: Abort and delete one
                    if (!fileContents.compare(checkFileContents)) {
                        console.log(`Delete '${fileName}', because it already exists: '${path_1.posix.join(newDirName, checkFileName)}'`);
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
            const newFileSubpath = path_1.posix.join(newDirName, newFileName);
            const newFilePath = path_1.posix.join(rootPath, newFileSubpath);
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
                const tmpFilePath1 = path_1.posix.join(rootPath, tmpFileName);
                const tmpFileSubpath2 = path_1.posix.join(newDirName, tmpFileName);
                const tmpFilePath2 = path_1.posix.join(rootPath, tmpFileSubpath2);
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
exports.default = processFile;
//# sourceMappingURL=process.js.map