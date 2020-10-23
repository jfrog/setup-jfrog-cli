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
            let version = core.getInput(Utils.CLI_VERSION_ARG);
            if (semver.lt(version, this.MIN_CLI_VERSION)) {
                throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
            }
            let fileName = Utils.getCliExecutableName();
            let cliDir = toolCache.find(fileName, version);
            if (cliDir) {
                return path.join(cliDir, fileName);
            }
            let url = Utils.getCliUrl(version, fileName);
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
    static getCliUrl(version, fileName) {
        let bintrayPackage = 'jfrog-cli-' + Utils.getArchitecture();
        return ('https://api.bintray.com/content/jfrog/jfrog-cli-go/' + version + '/' + bintrayPackage + '/' + fileName + '?bt_package=' + bintrayPackage);
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
        let buildNumberEnv = process.env.GITHUB_SHA;
        if (buildNumberEnv) {
            core.exportVariable('JFROG_CLI_BUILD_NUMBER', buildNumberEnv);
        }
        core.exportVariable('JFROG_CLI_BUILD_URL', 'https://github.com/' + process.env.GITHUB_REPOSITORY + '/commit/' + buildNumberEnv + '/checks');
    }
    static configArtifactoryServers(cliPath) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let serverToken of Utils.getServerTokens()) {
                yield Utils.runCli(cliPath, ['rt', 'c', 'import', serverToken]);
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
}
exports.Utils = Utils;
Utils.SERVER_TOKEN_PREFIX = /^JF_ARTIFACTORY_.*$/;
Utils.CLI_VERSION_ARG = 'version';
Utils.MIN_CLI_VERSION = '1.29.0';
