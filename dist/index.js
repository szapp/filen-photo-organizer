"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const async_mutex_1 = require("async-mutex");
const fs_1 = __importDefault(require("fs"));
const luxon_1 = require("luxon");
const path_1 = require("path");
const process_js_1 = __importDefault(require("./process.js"));
async function organizePhotos(rootPath, dirPattern = 'yyyy-MM', filePattern = 'yyyy-MM-dd_HH.mm.ss', fallbackTimeZone = 'Europe/Berlin', dryRun = false) {
    // Replace environment variables in path
    rootPath = rootPath.replace(/%([^%]+)%/g, (full, name) => process.env[name] || full);
    // Update time zone
    luxon_1.Settings.defaultZone = fallbackTimeZone;
    if (luxon_1.DateTime.local().zoneName === null)
        throw new Error('Error: Invalid time zone. Please specify a valid IANA zone');
    // Report
    let numFiles = 0;
    let numErrors = 0;
    let errors = [];
    try {
        // Read directory
        let dirContents = fs_1.default.readdirSync(rootPath);
        // Exclude directories by inspecting file extensions
        dirContents = dirContents.filter((name) => name.indexOf('.') !== -1).sort();
        // Individually process each file asynchronously
        // Nevertheless, create a mutex for writing operations to avoid file name collisions
        const writeAccess = new async_mutex_1.Mutex(new Error('Something went wrong with the mutex!'));
        console.log(`Process ${dirContents.length} files in '${rootPath}'`);
        const processOutputs = await Promise.allSettled(dirContents.map((fileName) => (0, process_js_1.default)(path_1.posix.join(rootPath, fileName), dirPattern, filePattern, writeAccess, dryRun)));
        // Collect rate of success
        numFiles = dirContents.length;
        errors = processOutputs
            .filter((p) => p.status === 'rejected')
            .reduce((out, p) => out.concat(p.reason), [])
            .map((r) => { var _a; return (_a = r === null || r === void 0 ? void 0 : r.message) !== null && _a !== void 0 ? _a : String(r); });
        numErrors = errors.length;
    }
    finally {
        // Reset
    }
    console.log(`Done (${numFiles - numErrors}/${numFiles} files succeeded)`);
    return { numFiles, numErrors, errors };
}
exports.default = organizePhotos;
module.exports = organizePhotos;
//# sourceMappingURL=index.js.map