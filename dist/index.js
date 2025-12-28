"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = organizePhotos;
const async_mutex_1 = require("async-mutex");
const sdk_1 = __importDefault(require("@filen/sdk"));
const luxon_1 = require("luxon");
const OTPAuth = __importStar(require("otpauth"));
const path_1 = require("path");
const process_js_1 = __importDefault(require("./process.js"));
async function organizePhotos(credentials, rootPath, recursive = false, convertHeic = true, keepOriginals = false, destPath = '', dirPattern = 'yyyy-MM', filePattern = 'yyyy-MM-dd_HH.mm.ss', fallbackTimeZone = 'Europe/Berlin', // Filen.io location
dryRun = false) {
    const filen = new sdk_1.default({
        metadataCache: true,
    });
    // Update time zone
    luxon_1.Settings.defaultZone = fallbackTimeZone;
    if (luxon_1.DateTime.local().zoneName === null)
        throw new Error('Error: Invalid time zone. Please specify a valid IANA zone');
    // Prevent recursive infinite loop
    const potentialDestDir = path_1.posix.join(destPath, dirPattern);
    if (recursive && !potentialDestDir.startsWith('/') && !potentialDestDir.startsWith('..')) {
        throw new Error('Error: Destination cannot be inside the root directory when recursive is set to true');
    }
    // Report
    let numFiles = 0;
    let numErrors = 0;
    let errors = [];
    try {
        await filen.login({
            email: credentials.email,
            password: credentials.password,
            twoFactorCode: credentials.twoFactorCode
                ? credentials.twoFactorCode
                : credentials.twoFactorSecret
                    ? new OTPAuth.TOTP({ secret: credentials.twoFactorSecret }).generate()
                    : undefined,
        });
        // Read directory
        let dirContents = await filen.fs().readdir({
            path: rootPath,
            recursive: recursive,
        });
        // Exclude directories by inspecting file extensions
        dirContents = dirContents.filter((name) => name.indexOf('.') !== -1).sort();
        // Individually process each file asynchronously
        // Nevertheless, create a mutex for writing operations to avoid file name collisions
        const writeAccess = new async_mutex_1.Mutex(new Error('Something went wrong with the mutex!'));
        console.log(`Process ${dirContents.length} files in '${rootPath}'`);
        const processOutputs = await Promise.allSettled(dirContents.map((fileName) => (0, process_js_1.default)(filen, writeAccess, rootPath, fileName, destPath, dirPattern, filePattern, convertHeic, keepOriginals, dryRun)));
        // Collect rate of success
        numFiles = dirContents.length;
        errors = processOutputs
            .filter((p) => p.status === 'rejected')
            .reduce((out, p) => out.concat(p.reason), [])
            .map((r) => r?.message ?? String(r));
        numErrors = errors.length;
    }
    finally {
        filen.logout();
        filen.clearTemporaryDirectory();
    }
    console.log(`Done (${numFiles - numErrors}/${numFiles} files succeeded)`);
    return { numFiles, numErrors, errors };
}
module.exports = organizePhotos;
//# sourceMappingURL=index.js.map