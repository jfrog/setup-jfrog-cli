"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
const fs = __importStar(require("fs-extra"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
class Utils {
    static downloadCli() {
        return __awaiter(this, void 0, void 0, function* () {
            let cli_url = core.getInput(Utils.CLI_URL);
            let version = core.getInput(Utils.CLI_VERSION_ARG);
            if (semver.lt(version, this.MIN_CLI_VERSION)) {
                throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
            }
            let fileName = Utils.getCliExecutableName();
            let cliDir = toolCache.find(fileName, version);
            if (cliDir) {
                core.addPath(cliDir);
                return path.join(cliDir, fileName);
            }
            let url = Utils.getCliUrl(cli_url, version, fileName);
            core.debug('Downloading JFrog CLI from ' + url);
            let downloadDir = yield toolCache.downloadTool(url);
            cliDir = yield toolCache.cacheFile(downloadDir, fileName, fileName, version);
            let cliPath = path.join(cliDir, fileName);
            if (!Utils.isWindows()) {
                fs.chmodSync(cliPath, 0o555);
            }
            core.addPath(cliDir);
            return cliPath;
        });
    }
    static getCliUrl(cli_url, version, fileName) {
        let architecture = 'jfrog-cli-' + Utils.getArchitecture();
        let major = version.split('.')[0];
        return cli_url + '/v' + major + '/' + version + '/' + architecture + '/' + fileName;
    }
    static getServerTokens() {
        return Object.keys(process.env)
            .filter((env) => env.match(Utils.SERVER_TOKEN_PREFIX))
            .map((envKey) => process.env[envKey] || '');
    }
    static setCliEnv() {
        core.exportVariable('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;JF_ARTIFACTORY_*');
        core.exportVariable('JFROG_CLI_OFFER_CONFIG', 'false');
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
    static configArtifactoryServers(cliPath) {
        return __awaiter(this, void 0, void 0, function* () {
            let useOldConfig = Utils.useOldConfig();
            if (useOldConfig) {
                let version = core.getInput(Utils.CLI_VERSION_ARG);
                core.warning('JFrog CLI ' + version + ' on Setup JFrog CLI GitHub Action is deprecated. Please use version 1.46.4 or above.');
            }
            for (let serverToken of Utils.getServerTokens()) {
                let importCmd = useOldConfig ? ['rt', 'c', 'import', serverToken] : ['c', 'import', serverToken];
                yield Utils.runCli(cliPath, importCmd);
            }
        });
    }
    static removeArtifactoryServers(cliPath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (Utils.useOldConfig()) {
                yield Utils.runCli(cliPath, ['rt', 'c', 'clear', '--interactive=false']);
            }
            else {
                yield Utils.runCli(cliPath, ['c', 'rm', '--quiet']);
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
    static getCliExecutableName() {
        return Utils.isWindows() ? 'jfrog.exe' : 'jfrog';
    }
    static isWindows() {
        return os.platform().startsWith('win');
    }
    static runCli(cliPath, args) {
        return __awaiter(this, void 0, void 0, function* () {
            let res = yield exec_1.exec(cliPath, args);
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
        return semver.lt(version, this.NEW_CONFIG_CLI_VERSION);
    }
}
exports.Utils = Utils;
Utils.USER_AGENT = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
Utils.SERVER_TOKEN_PREFIX = /^JF_ARTIFACTORY_.*$/;
// Since 1.45.0, 'jfrog rt c' command changed to 'jfrog c add'
Utils.NEW_CONFIG_CLI_VERSION = '1.45.0';
Utils.CLI_VERSION_ARG = 'version';
Utils.CLI_URL = 'cli_url';
Utils.MIN_CLI_VERSION = '1.29.0';
