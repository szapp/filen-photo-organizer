"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = processFile;
const exifr_1 = __importDefault(require("exifr"));
const fs_1 = __importDefault(require("fs"));
const geo_tz_1 = require("geo-tz");
const heic_jpg_exif_1 = __importDefault(require("heic-jpg-exif"));
const luxon_1 = require("luxon");
const os_1 = __importDefault(require("os"));
const path_1 = require("path");
const uuid_1 = require("uuid");
const UNIQUE_FILENAME_NAMESPACE = 'fa3d2ab8-2a92-44fd-96b7-1a85861159ae';
async function processFile(filen, writeAccess, rootPath, fileName, destPath = '', dirPattern = 'yyyy-MM', filePattern = 'yyyy-MM-dd_HH.mm.ss', convertHeic = true, keepOriginal = false, dryRun = false) {
    const filePath = path_1.posix.join(rootPath, fileName);
    const srcPath = fileName;
    fileName = path_1.posix.basename(fileName);
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
        let tz = luxon_1.DateTime.now().zoneName;
        let { mime } = stats;
        // If no date-time related operations are desired, skip this block in favor of performance
        if (dirPattern.length > 0 || filePattern.length > 0) {
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
                // Retrieve date-taken and time zone based off of EXIF data
                // As raw string! exifr converts to Date in system time zone - which is incorrect here
                const meta = await exifr_1.default.parse(fileContents, {
                    pick: ['DateTimeOriginal', 'OffsetTimeOriginal'],
                    reviveValues: false,
                });
                const exifDate = meta?.DateTimeOriginal;
                const tzOffset = meta?.OffsetTimeOriginal;
                // Obtain time zone
                if (typeof tzOffset === 'string' && tzOffset.match(/^[+-]\d{2}:\d{2}$/) && luxon_1.DateTime.now().setZone(`utc${tzOffset}`).isValid) {
                    tz = `utc${tzOffset}`;
                }
                else {
                    // Otherwise retrieve time zone based off of GPS data (EXIF < 2.31 does not support OffsetTimeOriginal)
                    try {
                        const { latitude, longitude } = await exifr_1.default.gps(fileContents);
                        const tzCandidates = (0, geo_tz_1.find)(latitude, longitude);
                        if (tzCandidates.length > 0 && luxon_1.DateTime.now().setZone(tzCandidates[0]).isValid) {
                            tz = tzCandidates[0];
                        }
                    }
                    catch {
                        // Fall back and assume default time zone
                    }
                }
                // Parse date-taken
                if (typeof exifDate === 'string') {
                    // Parse string date according to EXIF specifications 'yyyy:MM:dd HH:mm:ss'. Just in case also test for 'yyyy-MM-dd HH:mm:ss'
                    let exifDateParsed = luxon_1.DateTime.fromFormat(exifDate, 'yyyy:MM:dd HH:mm:ss', { zone: tz });
                    if (!exifDateParsed.isValid) {
                        exifDateParsed = luxon_1.DateTime.fromFormat(exifDate, 'yyyy-MM-dd HH:mm:ss', { zone: tz });
                    }
                    // Fallback to only date and possibly omit time (unlikely)
                    if (!exifDateParsed.isValid) {
                        const [year, month, day, hour, minute, second] = exifDate
                            .trim()
                            .split(/[-: ]/g)
                            .map((ele) => (typeof ele === 'string' ? Number(ele) : undefined));
                        if (typeof year !== 'undefined' && month && day) {
                            exifDateParsed = luxon_1.DateTime.fromObject({ year, month, day, hour: hour ?? 12, minute, second }, { zone: tz });
                        }
                    }
                    if (exifDateParsed.isValid)
                        dateTaken = exifDateParsed;
                }
            }
            // Fall back to date in file name or file creation date or file modification date
            if (!dateTaken) {
                const dateCreated = luxon_1.DateTime.fromMillis(stats.birthtimeMs, { zone: 'utc' }).setZone(tz);
                const dateModified = luxon_1.DateTime.fromMillis(stats.mtimeMs, { zone: 'utc' }).setZone(tz);
                const baseName = path_1.posix.basename(fileName, fileExt);
                const regex = /(?<!\d)(?<year>(?:19|20)?\d{2})(?:_|-|\.)?(?<month>0[1-9]|1[0-2])(?:_|-|\.)?(?<day>[0-3]\d)(?:_|-|\.)?(?<hour>[0-1][0-9]|2[0-4])?(?:_|-|\.)?(?<min>[0-6]\d)?(?:_|-|\.)?(?<sec>[0-6]\d)?/;
                const match = baseName.match(regex);
                if (match) {
                    const res = match.groups;
                    const [yy, month, day, hour, minute, second] = Object.values(res).map((ele) => typeof ele === 'string' ? Number(ele) : undefined);
                    let year = Number(yy);
                    if (year < 100) {
                        const currentYear = Number(String(new Date().getFullYear()).substring(2));
                        year += year > currentYear ? 1900 : 2000;
                    }
                    // Ensure correct timezone for comparison
                    const fileNameDate = luxon_1.DateTime.fromObject({ year, month, day, hour: hour ?? 12, minute, second }, { zone: tz });
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
        }
        // Make path names
        const newDirName = dirPattern ? dateTaken.toFormat(dirPattern) : '';
        const newDirPath = path_1.posix.resolve(rootPath, destPath, newDirName);
        let newBaseName = filePattern ? dateTaken.toFormat(filePattern) : path_1.posix.basename(filePath, fileExt);
        // Convert HEIF
        if ((mime === 'image/heic' || mime === 'image/heif') && convertHeic) {
            try {
                fileContents = (await (0, heic_jpg_exif_1.default)(fileContents));
            }
            catch (e) {
                if (!(e instanceof Error) || e?.message !== 'Input is already a JPEG image')
                    throw e;
                mime = 'image/jpeg';
            }
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
            catch {
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
                    // Files are identical: Abort and skip/delete one
                    if (!fileContents.compare(checkFileContents)) {
                        const operation = keepOriginal ? 'Skip' : 'Delete';
                        console.log(`${operation} '${srcPath}', because it already exists as '${path_1.posix.join(newDirName, checkFileName)}'`);
                        if (!dryRun && !keepOriginal) {
                            await filen.fs().unlink({
                                path: filePath,
                                permanent: false,
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
                const idxTaken = newDirContents.map((item) => Number(item.match(fileNamePattern)?.groups?.index ?? '000'));
                const idxNext = Math.min(...idxCandidates.filter((x) => x && !idxTaken.includes(x)));
                newBaseName += '_' + String(idxNext).padStart(3, '0');
            }
            // Rename (move/copy) or upload and delete (convert)
            const newFileName = `${newBaseName}${fileExt}`;
            const newFilePath = path_1.posix.resolve(rootPath, destPath, newDirName, newFileName);
            const newFileSubpath = path_1.posix.relative(rootPath, newFilePath);
            if ((mime === 'image/heic' || mime === 'image/heif') && convertHeic) {
                console.log(`Convert '${srcPath}' to '${newFileSubpath}'`);
                if (!dryRun) {
                    // In order to retain the modification date, write the file locally, upload it, and delete the local file
                    const localTmpDirPath = path_1.posix.join(filen.config.tmpPath || os_1.default.tmpdir(), 'filen-sdk', 'filen-photo-organizer');
                    const localTmpFilePath = path_1.posix.join(localTmpDirPath, (0, uuid_1.v5)(filePath, UNIQUE_FILENAME_NAMESPACE));
                    if (!fs_1.default.existsSync(localTmpDirPath))
                        fs_1.default.mkdirSync(localTmpDirPath, { recursive: true });
                    fs_1.default.writeFileSync(localTmpFilePath, fileContents);
                    fs_1.default.utimesSync(localTmpFilePath, stats.birthtimeMs / 1000, stats.mtimeMs / 1000);
                    await filen.fs().upload({
                        path: newFilePath,
                        source: localTmpFilePath,
                    });
                    fs_1.default.unlinkSync(localTmpFilePath);
                    if (!keepOriginal) {
                        await filen.fs().unlink({
                            path: filePath,
                            permanent: false,
                        });
                    }
                }
            }
            else {
                const operation = keepOriginal ? 'Copy' : 'Move';
                console.log(`${operation} '${srcPath}' to '${newFileSubpath}'`);
                if (!dryRun) {
                    if (keepOriginal) {
                        await filen.fs().copy({
                            from: filePath,
                            to: newFilePath,
                        });
                    }
                    else {
                        await filen.fs().rename({
                            from: filePath,
                            to: newFilePath,
                        });
                    }
                }
            }
        }
        finally {
            release();
        }
    }
    catch (e) {
        // Format, print, and throw (reject promise)
        let message;
        if (e instanceof Error) {
            const err = e;
            message = `${err?.message || e}`;
            if (err?.name !== 'Error')
                message += ` (${err?.name})`;
        }
        else {
            message = String(e);
        }
        const error = new Error(`Error for '${fileName}': ${message}`);
        console.error(error.message);
        try {
            error.stack = undefined;
        }
        catch {
            // If stack not supported
        }
        throw error;
    }
}
//# sourceMappingURL=process.js.map