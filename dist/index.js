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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const async_mutex_1 = require("async-mutex");
const sdk_1 = __importDefault(require("@filen/sdk"));
const luxon_1 = require("luxon");
const OTPAuth = __importStar(require("otpauth"));
const path_1 = require("path");
const process_js_1 = __importDefault(require("./process.js"));
async function organizePhotos(credentials, rootPath, dirPattern = 'yyyy-MM', filePattern = 'yyyy-MM-dd_HH.mm.ss', fallbackTimeZone = 'Europe/Berlin', // Filen.io location
dryRun = false) {
    const filen = new sdk_1.default({
        metadataCache: true,
    });
    // Update time zone
    luxon_1.Settings.defaultZone = fallbackTimeZone;
    if (luxon_1.DateTime.local().zoneName === null)
        throw new Error('Error: Invalid time zone. Please specify a valid IANA zone');
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
        const writeAccess = new async_mutex_1.Mutex();
        console.log(`Process ${dirContents.length} files in '${rootPath}'`);
        await Promise.allSettled(dirContents.map((fileName) => (0, process_js_1.default)(filen, path_1.posix.join(rootPath, fileName), dirPattern, filePattern, writeAccess, dryRun)));
    }
    finally {
        filen.logout();
        filen.clearTemporaryDirectory();
    }
    console.log('Done');
}
exports.default = organizePhotos;
module.exports = organizePhotos;
//# sourceMappingURL=index.js.map