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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = void 0;
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const toolCache = __importStar(require("@actions/tool-cache"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
class Utils {
    static addCliToPath() {
        return __awaiter(this, void 0, void 0, function* () {
            let version = core.getInput(Utils.CLI_VERSION_ARG);
            let major = version.split('.')[0];
            if (version === this.LATEST_CLI_VERSION_ARG) {
                version = Utils.LATEST_RELEASE_VERSION;
                major = '2';
            }
            else if (semver.lt(version, this.MIN_CLI_VERSION)) {
                throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
            }
            let jfFileName = Utils.getJfExecutableName();
            let jfrogFileName = Utils.getJFrogExecutableName();
            if (this.loadFromCache(jfFileName, jfrogFileName, version)) {
                // Download is not needed
                return;
            }
            // Download JFrog CLI
            let url = Utils.getCliUrl(major, version, jfrogFileName);
            core.debug('Downloading JFrog CLI from ' + url);
            let downloadDir = yield toolCache.downloadTool(url);
            // Cache 'jf' and 'jfrog' executables
            yield this.cacheAndAddPath(downloadDir, version, jfFileName);
            yield this.cacheAndAddPath(downloadDir, version, jfrogFileName);
        });
    }
    /**
     * Try to load the JFrog CLI executables from cache.
     *
     * @param jfFileName    - 'jf' or 'jf.exe'
     * @param jfrogFileName - 'jfrog' or 'jfrog.exe'
     * @param version       - JFrog CLI version
     * @returns true if the CLI executable was loaded from cache and added to path
     */
    static loadFromCache(jfFileName, jfrogFileName, version) {
        if (version === Utils.LATEST_RELEASE_VERSION) {
            return false;
        }
        let jfExecDir = toolCache.find(jfFileName, version);
        let jfrogExecDir = toolCache.find(jfrogFileName, version);
        if (jfExecDir && jfrogExecDir) {
            core.addPath(jfExecDir);
            core.addPath(jfrogExecDir);
            return true;
        }
        return false;
    }
    /**
     * Add JFrog CLI executables to cache and to the system path.
     * @param downloadDir - The directory whereby the CLI was downloaded to
     * @param version     - JFrog CLI version
     * @param fileName    - 'jf', 'jfrog', 'jf.exe', or 'jfrog.exe'
     */
    static cacheAndAddPath(downloadDir, version, fileName) {
        return __awaiter(this, void 0, void 0, function* () {
            let cliDir = yield toolCache.cacheFile(downloadDir, fileName, fileName, version);
            if (!Utils.isWindows()) {
                fs.chmodSync(path.join(cliDir, fileName), 0o555);
            }
            core.addPath(cliDir);
        });
    }
    static getCliUrl(major, version, fileName) {
        let architecture = 'jfrog-cli-' + Utils.getArchitecture();
        return 'https://releases.jfrog.io/artifactory/jfrog-cli/v' + major + '/' + version + '/' + architecture + '/' + fileName;
    }
    static getServerTokens() {
        let serverTokens = new Set(Object.keys(process.env)
            .filter((envKey) => envKey.match(Utils.SERVER_TOKEN_PREFIX))
            .filter((envKey) => process.env[envKey])
            .map((envKey) => { var _a; return ((_a = process.env[envKey]) === null || _a === void 0 ? void 0 : _a.trim()) || ''; }));
        let legacyServerTokens = new Set(Object.keys(process.env)
            .filter((envKey) => envKey.match(Utils.SERVER_TOKEN_LEGACY_PREFIX))
            .filter((envKey) => process.env[envKey])
            .map((envKey) => { var _a; return ((_a = process.env[envKey]) === null || _a === void 0 ? void 0 : _a.trim()) || ''; }));
        if (legacyServerTokens.size > 0) {
            core.warning('The "JF_ARTIFACTORY_" prefix for environment variables is deprecated and is expected to be removed in v3. ' +
                'Please use the "JF_ENV_" prefix instead. The environment variables value should not be changed.');
        }
        legacyServerTokens.forEach((serverToken) => serverTokens.add(serverToken));
        return serverTokens;
    }
    static setCliEnv() {
        core.exportVariable('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*');
        core.exportVariable('JFROG_CLI_OFFER_CONFIG', 'false');
        core.exportVariable('CI', 'true');
        let buildNameEnv = process.env.GITHUB_WORKFLOW;
        if (buildNameEnv) {
            core.exportVariable('JFROG_CLI_BUILD_NAME', buildNameEnv);
        }
        let buildNumberEnv = process.env.GITHUB_RUN_NUMBER;
        if (buildNumberEnv) {
            core.exportVariable('JFROG_CLI_BUILD_NUMBER', buildNumberEnv);
        }
        core.exportVariable('JFROG_CLI_BUILD_URL', process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID);
        core.exportVariable('JFROG_CLI_USER_AGENT', Utils.USER_AGENT);
    }
    static configJFrogServers() {
        return __awaiter(this, void 0, void 0, function* () {
            let useOldConfig = Utils.useOldConfig();
            if (useOldConfig) {
                let version = core.getInput(Utils.CLI_VERSION_ARG);
                core.warning('JFrog CLI ' + version + ' on Setup JFrog CLI GitHub Action is deprecated. Please use version 1.46.4 or above.');
            }
            for (let serverToken of Utils.getServerTokens()) {
                let importCmd = useOldConfig ? ['rt', 'c', 'import', serverToken] : ['c', 'import', serverToken];
                yield Utils.runCli(importCmd);
            }
        });
    }
    static removeJFrogServers() {
        return __awaiter(this, void 0, void 0, function* () {
            if (Utils.useOldConfig()) {
                yield Utils.runCli(['rt', 'c', 'clear', '--interactive=false']);
            }
            else {
                yield Utils.runCli(['c', 'rm', '--quiet']);
            }
        });
    }
    static getArchitecture() {
        if (Utils.isWindows()) {
            return 'windows-amd64';
        }
        if (os.platform().includes('darwin')) {
            return 'mac-386';
        }
        if (os.arch().includes('arm')) {
            return os.arch().includes('64') ? 'linux-arm64' : 'linux-arm';
        }
        return os.arch().includes('64') ? 'linux-amd64' : 'linux-386';
    }
    static getJfExecutableName() {
        return Utils.isWindows() ? 'jf.exe' : 'jf';
    }
    static getJFrogExecutableName() {
        return Utils.isWindows() ? 'jfrog.exe' : 'jfrog';
    }
    static isWindows() {
        return os.platform().startsWith('win');
    }
    /**
     * Execute JFrog CLI command.
     * This GitHub Action downloads the requested 'jfrog' executable and stores it as 'jfrog' and 'jf'.
     * Therefore the 'jf' executable is expected to be in the path also for older CLI versions.
     * @param args - CLI arguments
     */
    static runCli(args) {
        return __awaiter(this, void 0, void 0, function* () {
            let res = yield (0, exec_1.exec)('jf', args);
            if (res !== core.ExitCode.Success) {
                throw new Error('JFrog CLI exited with exit code ' + res);
            }
        });
    }
    /**
     * Return true if should use 'jfrog rt c' instead of 'jfrog c'.
     * @returns true if should use 'jfrog rt c' instead of 'jfrog c'.
     */
    static useOldConfig() {
        let version = core.getInput(Utils.CLI_VERSION_ARG);
        if (version === this.LATEST_CLI_VERSION_ARG) {
            return false;
        }
        return semver.lt(version, this.NEW_CONFIG_CLI_VERSION);
    }
}
exports.Utils = Utils;
Utils.USER_AGENT = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
Utils.SERVER_TOKEN_LEGACY_PREFIX = /^JF_ARTIFACTORY_.*$/;
Utils.SERVER_TOKEN_PREFIX = /^JF_ENV_.*$/;
// Since 1.45.0, 'jfrog rt c' command changed to 'jfrog c add'
Utils.NEW_CONFIG_CLI_VERSION = '1.45.0';
Utils.CLI_VERSION_ARG = 'version';
Utils.MIN_CLI_VERSION = '1.29.0';
Utils.LATEST_CLI_VERSION_ARG = 'latest';
Utils.LATEST_RELEASE_VERSION = '[RELEASE]';
