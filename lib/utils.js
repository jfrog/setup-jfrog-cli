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
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const semver_1 = require("semver");
const http_client_1 = require("@actions/http-client");
const jwt_decode = __importStar(require("jwt-decode"));
class Utils {
    /**
     * Gets access details to allow Accessing JFrog's servers
     * Initially searches for JF_ACCESS_TOKEN or JF_USER + JF_PASSWORD in existing environment variables
     * If none of the above found, returns an access token from the addressed Jfrog's server, if request and requester are authorized, using
     * OpenID Connect mechanism
     */
    static getJfrogAccessToken() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!process.env.JF_URL) {
                return "";
            }
            let basicUrl = process.env.JF_URL;
            console.log("Searching for JF_ACCESS_TOKEN or JF_USER + JF_PASSWORD in exising env variables");
            if (process.env.JF_ACCESS_TOKEN || (process.env.JF_USER && process.env.JF_PASSWORD)) {
                return "";
            }
            console.log("JF_ACCESS_TOKEN and JF_USER + JF_PASSWORD weren't found. Getting access token using OpenID Connect");
            const audience = core.getInput(Utils.OIDC_AUDIENCE_ARG, { required: false });
            let jsonWebToken;
            try {
                console.log("Fetching JSON web token");
                jsonWebToken = yield core.getIDToken(); // TODO add audience?
            }
            catch (error) {
                throw new Error(`getting openID Connect JSON web token failed: ${error.message}`);
            }
            // todo del
            const decodedJwt2 = jwt_decode.jwtDecode(jsonWebToken);
            console.log(`ERAN CHECK: JWT 2 content: \n aud: ${decodedJwt2.aud} | sub: ${decodedJwt2.sub} | iss: ${decodedJwt2.iss}`);
            // todo up to here
            try {
                return yield this.getAccessTokenFromJWT(basicUrl, jsonWebToken);
            }
            catch (error) {
                throw new Error(`Exchanging JSON web token with an access token failed: ${error.message}`);
            }
        });
    }
    /**
     * Exchanges JWT with a valid access token
     * @param basicUrl basic Url achieved as an env var
     * @param jsonWebToken JWT achieved from GitHub JWT provider
     * @private
     */
    static getAccessTokenFromJWT(basicUrl, jsonWebToken) {
        return __awaiter(this, void 0, void 0, function* () {
            const exchangeUrl = basicUrl.replace(/\/$/, '') + "/access/api/v1/oidc/token";
            console.log(`ERAN CHECK: Exchanging JWT with ACCESS TOKEN. Url for REST command: ${exchangeUrl}`); // TODO del
            console.log("Exchanging JSON web token with access token");
            const audience = core.getInput(Utils.OIDC_AUDIENCE_ARG, { required: false });
            const httpClient = new http_client_1.HttpClient();
            // TODO fix request
            try {
                /*
                const dataString: string = JSON.stringify({
                    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
                    subject_token_type: "urn:ietf:params:oauth:token-type:access_token", //TODO try: id-token -> access_token
                    subject_token: jsonWebToken,
                    provider_name: "github-oidc" // https://token.actions.githubusercontent.com
                    //assertion: jsonWebToken,
                    //audience: audience, //TODO should I pass audience here as well? it was passed to the JWT generator
                });
                 */
                const data = `{
                "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
                "subject_token": "${jsonWebToken}",
                "provider_name": "jfrog-eran"
            }`;
                // TODO make sure to pass provider_name as input to the action and insert it here
                // provider_name: github-oidc
                const additionalHeaders = {
                    'Content-Type': 'application/json',
                };
                console.log(`ERAN CHECK: starting POST`); // TODO del
                const response = yield httpClient.post(exchangeUrl, data, additionalHeaders);
                console.log(`ERAN CHECK: POST succeeded`); // TODO del
                const responseData = yield response.readBody();
                console.log(`ERAN CHECK: response string: ${responseData}`); // TODO del
            }
            catch (error) {
                throw new Error(`POST REST command failed with error ${error.message}`);
            }
            // TODO print the json content in order to ensure the fields name
            return "";
        });
    }
    static getAndAddCliToPath() {
        return __awaiter(this, void 0, void 0, function* () {
            let version = core.getInput(Utils.CLI_VERSION_ARG);
            let cliRemote = core.getInput(Utils.CLI_REMOTE_ARG);
            let major = version.split('.')[0];
            if (version === this.LATEST_CLI_VERSION) {
                version = Utils.LATEST_RELEASE_VERSION;
                major = '2';
            }
            else if ((0, semver_1.lt)(version, this.MIN_CLI_VERSION)) {
                throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
            }
            let jfFileName = Utils.getJfExecutableName();
            let jfrogFileName = Utils.getJFrogExecutableName();
            if (this.loadFromCache(jfFileName, jfrogFileName, version)) {
                // Download is not needed
                return;
            }
            // Download JFrog CLI
            let downloadDetails = Utils.extractDownloadDetails(cliRemote);
            let url = Utils.getCliUrl(major, version, jfrogFileName, downloadDetails);
            core.info('Downloading JFrog CLI from ' + url);
            let downloadDir = yield toolCache.downloadTool(url, undefined, downloadDetails.auth);
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
                (0, fs_1.chmodSync)((0, path_1.join)(cliDir, fileName), 0o555);
            }
            core.addPath(cliDir);
        });
    }
    static getCliUrl(major, version, fileName, downloadDetails) {
        let architecture = 'jfrog-cli-' + Utils.getArchitecture();
        let artifactoryUrl = downloadDetails.artifactoryUrl.replace(/\/$/, '');
        return `${artifactoryUrl}/${downloadDetails.repository}/v${major}/${version}/${architecture}/${fileName}`;
    }
    // Get Config Tokens created on your local machine using JFrog CLI.
    // The Tokens configured with JF_ENV_ environment variables.
    static getConfigTokens() {
        let configTokens = new Set(Object.keys(process.env)
            .filter((envKey) => envKey.match(Utils.CONFIG_TOKEN_PREFIX))
            .filter((envKey) => process.env[envKey])
            .map((envKey) => { var _a; return ((_a = process.env[envKey]) === null || _a === void 0 ? void 0 : _a.trim()) || ''; }));
        let legacyConfigTokens = new Set(Object.keys(process.env)
            .filter((envKey) => envKey.match(Utils.CONFIG_TOKEN_LEGACY_PREFIX))
            .filter((envKey) => process.env[envKey])
            .map((envKey) => { var _a; return ((_a = process.env[envKey]) === null || _a === void 0 ? void 0 : _a.trim()) || ''; }));
        if (legacyConfigTokens.size > 0) {
            core.warning('The "JF_ARTIFACTORY_" prefix for environment variables is deprecated and is expected to be removed in v3. ' +
                'Please use the "JF_ENV_" prefix instead. The environment variables value should not be changed.');
        }
        legacyConfigTokens.forEach((configToken) => configTokens.add(configToken));
        return configTokens;
    }
    // Get separate env config for the URL and connection details and return args to add to the config add command
    static getSeparateEnvConfigArgs() {
        /**
         * @name url - JFrog Platform URL
         * @name user&password - JFrog Platform basic authentication
         * @name accessToken - Jfrog Platform access token
         */
        let url = process.env.JF_URL;
        let user = process.env.JF_USER;
        let password = process.env.JF_PASSWORD;
        let accessToken = process.env.JF_ACCESS_TOKEN;
        if (url) {
            let configCmd = [Utils.SETUP_JFROG_CLI_SERVER_ID, '--url', url, '--interactive=false', '--overwrite=true'];
            if (accessToken) {
                configCmd.push('--access-token', accessToken);
            }
            else if (user && password) {
                configCmd.push('--user', user, '--password', password);
            }
            return configCmd;
        }
    }
    static setCliEnv() {
        Utils.exportVariableIfNotSet('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*;JF_URL;JF_USER;JF_PASSWORD;JF_ACCESS_TOKEN');
        Utils.exportVariableIfNotSet('JFROG_CLI_OFFER_CONFIG', 'false');
        Utils.exportVariableIfNotSet('CI', 'true');
        let buildNameEnv = process.env.GITHUB_WORKFLOW;
        if (buildNameEnv) {
            Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_NAME', buildNameEnv);
        }
        let buildNumberEnv = process.env.GITHUB_RUN_NUMBER;
        if (buildNumberEnv) {
            Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_NUMBER', buildNumberEnv);
        }
        Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_URL', process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID);
        Utils.exportVariableIfNotSet('JFROG_CLI_USER_AGENT', Utils.USER_AGENT);
    }
    static exportVariableIfNotSet(key, value) {
        if (!process.env[key]) {
            core.exportVariable(key, value);
        }
    }
    static configJFrogServers() {
        return __awaiter(this, void 0, void 0, function* () {
            let cliConfigCmd = ['config'];
            let useOldConfig = Utils.useOldConfig();
            if (useOldConfig) {
                // Add 'rt' prefix to the beginning of the config command
                cliConfigCmd.unshift('rt');
                let version = core.getInput(Utils.CLI_VERSION_ARG);
                core.warning('JFrog CLI ' + version + ' on Setup JFrog CLI GitHub Action is deprecated. Please use version 1.46.4 or above.');
            }
            for (let configToken of Utils.getConfigTokens()) {
                yield Utils.runCli(cliConfigCmd.concat('import', configToken));
            }
            let configArgs = Utils.getSeparateEnvConfigArgs();
            if (configArgs) {
                yield Utils.runCli(cliConfigCmd.concat('add', ...configArgs));
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
        if ((0, os_1.platform)().includes('darwin')) {
            return (0, os_1.arch)() === 'arm64' ? 'mac-arm64' : 'mac-386';
        }
        if ((0, os_1.arch)().includes('arm')) {
            return (0, os_1.arch)().includes('64') ? 'linux-arm64' : 'linux-arm';
        }
        return (0, os_1.arch)().includes('64') ? 'linux-amd64' : 'linux-386';
    }
    static getJfExecutableName() {
        return Utils.isWindows() ? 'jf.exe' : 'jf';
    }
    static getJFrogExecutableName() {
        return Utils.isWindows() ? 'jfrog.exe' : 'jfrog';
    }
    static isWindows() {
        return (0, os_1.platform)().startsWith('win');
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
     * If repository input was set, extract CLI download details,
     * from either a Config Token with a JF_ENV_ prefix or separate env config (JF_URL, JF_USER, JF_PASSWORD, JF_ACCESS_TOKEN).
     * @param repository - Remote repository in Artifactory pointing to https://releases.jfrog.io/artifactory/jfrog-cli/. If empty, use the default download details.
     * @returns the download details.
     */
    static extractDownloadDetails(repository) {
        if (repository === '') {
            return Utils.DEFAULT_DOWNLOAD_DETAILS;
        }
        // TODO: we enter here if we have no internet connection..
        let results = { repository: repository };
        let serverObj = {};
        for (let configToken of Utils.getConfigTokens()) {
            serverObj = JSON.parse(Buffer.from(configToken, 'base64').toString());
            if (serverObj && serverObj.artifactoryUrl) {
                break;
            }
        }
        if (!serverObj.artifactoryUrl) {
            // No Config Tokens found, check if Separate Env config exist.
            if (!process.env.JF_URL) {
                throw new Error(`'download-repository' input provided, but no JFrog environment details found. ` +
                    `Hint - Ensure that the JFrog connection details environment variables are set: ` +
                    `either a Config Token with a JF_ENV_ prefix or separate env config (JF_URL, JF_USER, JF_PASSWORD, JF_ACCESS_TOKEN)`);
            }
            serverObj.artifactoryUrl = process.env.JF_URL.replace(/\/$/, '') + '/artifactory';
            serverObj.user = process.env.JF_USER;
            serverObj.password = process.env.JF_PASSWORD;
            serverObj.accessToken = process.env.JF_ACCESS_TOKEN;
        }
        results.artifactoryUrl = serverObj.artifactoryUrl;
        let authString = Utils.generateAuthString(serverObj);
        if (authString) {
            results.auth = authString;
        }
        return results;
    }
    static generateAuthString(serverObj) {
        if (serverObj.accessToken) {
            return 'Bearer ' + Buffer.from(serverObj.accessToken).toString();
        }
        else if (serverObj.user && serverObj.password) {
            return 'Basic ' + Buffer.from(serverObj.user + ':' + serverObj.password).toString('base64');
        }
        return;
    }
    /**
     * Return true if should use 'jfrog rt c' instead of 'jfrog c'.
     * @returns true if should use 'jfrog rt c' instead of 'jfrog c'.
     */
    static useOldConfig() {
        let version = core.getInput(Utils.CLI_VERSION_ARG);
        if (version === this.LATEST_CLI_VERSION) {
            return false;
        }
        return (0, semver_1.lt)(version, this.NEW_CONFIG_CLI_VERSION);
    }
}
exports.Utils = Utils;
// eslint-disable-next-line @typescript-eslint/no-var-requires
Utils.USER_AGENT = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
// Default artifactory URL and repository for downloading JFrog CLI
Utils.DEFAULT_DOWNLOAD_DETAILS = {
    artifactoryUrl: 'https://releases.jfrog.io/artifactory',
    repository: 'jfrog-cli',
};
// The old JF_ARTIFACTORY_* prefix for Config Tokens
Utils.CONFIG_TOKEN_LEGACY_PREFIX = /^JF_ARTIFACTORY_.*$/;
// The JF_ENV_* prefix for Config Tokens
Utils.CONFIG_TOKEN_PREFIX = /^JF_ENV_.*$/;
// Since 1.45.0, 'jfrog rt c' command changed to 'jfrog c add'
Utils.NEW_CONFIG_CLI_VERSION = '1.45.0';
// Minimum JFrog CLI version supported
Utils.MIN_CLI_VERSION = '1.29.0';
// The value in "version" argument to set to get the latest JFrog CLI version
Utils.LATEST_CLI_VERSION = 'latest';
// The value in the download URL to set to get the latest version
Utils.LATEST_RELEASE_VERSION = '[RELEASE]';
// The default server id name for separate env config
Utils.SETUP_JFROG_CLI_SERVER_ID = 'setup-jfrog-cli-server';
// Inputs
// Version input
Utils.CLI_VERSION_ARG = 'version';
// Download repository input
Utils.CLI_REMOTE_ARG = 'download-repository';
// OpenID Connect audience input
Utils.OIDC_AUDIENCE_ARG = 'aud';
