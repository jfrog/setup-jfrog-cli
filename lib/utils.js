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
const http_client_1 = require("@actions/http-client");
const toolCache = __importStar(require("@actions/tool-cache"));
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const semver_1 = require("semver");
const path = __importStar(require("node:path"));
class Utils {
    /**
     * Retrieves server credentials for accessing JFrog's server
     * searching for existing environment variables such as JF_ACCESS_TOKEN or the combination of JF_USER and JF_PASSWORD.
     * If the 'oidc-provider-name' argument was provided, it generates an access token for the specified JFrog's server using the OpenID Connect mechanism.
     * @returns JfrogCredentials struct filled with collected credentials
     */
    static getJfrogCredentials() {
        return __awaiter(this, void 0, void 0, function* () {
            let jfrogCredentials = this.collectJfrogCredentialsFromEnvVars();
            const oidcProviderName = core.getInput(Utils.OIDC_INTEGRATION_PROVIDER_NAME);
            if (!oidcProviderName) {
                // Use JF_ENV or the credentials found in the environment variables
                return jfrogCredentials;
            }
            if (!jfrogCredentials.jfrogUrl) {
                throw new Error(`JF_URL must be provided when oidc-provider-name is specified`);
            }
            core.info('Obtaining an access token through OpenID Connect...');
            const audience = core.getInput(Utils.OIDC_AUDIENCE_ARG);
            let jsonWebToken;
            try {
                core.debug('Fetching JSON web token');
                jsonWebToken = yield core.getIDToken(audience);
            }
            catch (error) {
                throw new Error(`Getting openID Connect JSON web token failed: ${error.message}`);
            }
            try {
                return yield this.getJfrogAccessTokenThroughOidcProtocol(jfrogCredentials, jsonWebToken, oidcProviderName);
            }
            catch (error) {
                throw new Error(`Exchanging JSON web token with an access token failed: ${error.message}`);
            }
        });
    }
    /**
     * Gathers JFrog's credentials from environment variables and delivers them in a JfrogCredentials structure
     * @returns JfrogCredentials struct with all credentials found in environment variables
     * @throws Error if a password provided without a username
     */
    static collectJfrogCredentialsFromEnvVars() {
        let jfrogCredentials = {
            jfrogUrl: process.env.JF_URL,
            accessToken: process.env.JF_ACCESS_TOKEN,
            username: process.env.JF_USER,
            password: process.env.JF_PASSWORD
        };
        if (jfrogCredentials.password && !jfrogCredentials.username) {
            throw new Error('JF_PASSWORD is configured, but the JF_USER environment variable was not set.');
        }
        if (jfrogCredentials.username && !jfrogCredentials.accessToken && !jfrogCredentials.password) {
            throw new Error('JF_USER is configured, but the JF_PASSWORD or JF_ACCESS_TOKEN environment variables were not set.');
        }
        return jfrogCredentials;
    }
    /**
     * Exchanges GitHub JWT with a valid JFrog access token
     * @param jfrogCredentials existing JFrog credentials - url, access token, username + password
     * @param jsonWebToken JWT achieved from GitHub JWT provider
     * @param oidcProviderName OIDC provider name
     * @returns an access token for the requested Artifactory server
     */
    static getJfrogAccessTokenThroughOidcProtocol(jfrogCredentials, jsonWebToken, oidcProviderName) {
        return __awaiter(this, void 0, void 0, function* () {
            // If we've reached this stage, the jfrogCredentials.jfrogUrl field should hold a non-empty value obtained from process.env.JF_URL
            const exchangeUrl = jfrogCredentials.jfrogUrl.replace(/\/$/, '') + '/access/api/v1/oidc/token';
            core.debug('Exchanging GitHub JSON web token with a JFrog access token...');
            const httpClient = new http_client_1.HttpClient();
            const data = `{
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
            "subject_token": "${jsonWebToken}",
            "provider_name": "${oidcProviderName}"
        }`;
            const additionalHeaders = {
                'Content-Type': 'application/json'
            };
            const response = yield httpClient.post(exchangeUrl, data, additionalHeaders);
            const responseString = yield response.readBody();
            const responseJson = JSON.parse(responseString);
            jfrogCredentials.accessToken = responseJson.access_token;
            if (jfrogCredentials.accessToken) {
                core.setSecret(jfrogCredentials.accessToken);
            }
            if (responseJson.errors) {
                throw new Error(`${JSON.stringify(responseJson.errors)}`);
            }
            return jfrogCredentials;
        });
    }
    static getAndAddCliToPath(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            let version = core.getInput(Utils.CLI_VERSION_ARG);
            let cliRemote = core.getInput(Utils.CLI_REMOTE_ARG);
            let major = version.split('.')[0];
            if (version === Utils.LATEST_CLI_VERSION) {
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
            let downloadDetails = Utils.extractDownloadDetails(cliRemote, jfrogCredentials);
            let url = Utils.getCliUrl(major, version, jfrogFileName, downloadDetails);
            core.info('Downloading JFrog CLI from ' + url);
            let downloadDir = yield toolCache.downloadTool(url, undefined, downloadDetails.auth);
            // Cache 'jf' and 'jfrog' executables
            yield this.cacheAndAddPath(downloadDir, version, jfFileName);
            yield this.cacheAndAddPath(downloadDir, version, jfrogFileName);
        });
    }
    /**
     * Fetch the JFrog CLI path from the tool cache and append it to the PATH environment variable. Employ this approach during the cleanup phase.
     */
    static addCachedCliToPath() {
        let version = core.getInput(Utils.CLI_VERSION_ARG);
        if (version === Utils.LATEST_CLI_VERSION) {
            version = Utils.LATEST_RELEASE_VERSION;
        }
        let jfrogCliPath = toolCache.find(Utils.getJfExecutableName(), version);
        if (!jfrogCliPath) {
            core.warning(`Could not find JFrog CLI version '${version}' in tool cache`);
            return false;
        }
        core.addPath(jfrogCliPath);
        return true;
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
        return new Set(Object.keys(process.env)
            .filter((envKey) => envKey.match(Utils.CONFIG_TOKEN_PREFIX))
            .filter((envKey) => process.env[envKey])
            .map((envKey) => { var _a; return ((_a = process.env[envKey]) === null || _a === void 0 ? void 0 : _a.trim()) || ''; }));
    }
    /**
     * Get separate env config for the URL and connection details and return args to add to the config add command
     * @param jfrogCredentials existing JFrog credentials - url, access token, username + password
     */
    static getSeparateEnvConfigArgs(jfrogCredentials) {
        /**
         * @name url - JFrog Platform URL
         * @name user&password - JFrog Platform basic authentication
         * @name accessToken - Jfrog Platform access token
         */
        let url = jfrogCredentials.jfrogUrl;
        let user = jfrogCredentials.username;
        let password = jfrogCredentials.password;
        let accessToken = jfrogCredentials.accessToken;
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
        let projectKey = process.env.JFROG_CLI_PROJECT;
        if (projectKey) {
            Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_PROJECT', projectKey);
        }
    }
    static exportVariableIfNotSet(key, value) {
        if (!process.env[key]) {
            core.exportVariable(key, value);
        }
    }
    static configJFrogServers(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            let cliConfigCmd = ['config'];
            for (let configToken of Utils.getConfigTokens()) {
                yield Utils.runCli(cliConfigCmd.concat('import', configToken));
            }
            let configArgs = Utils.getSeparateEnvConfigArgs(jfrogCredentials);
            if (configArgs) {
                yield Utils.runCli(cliConfigCmd.concat('add', ...configArgs));
            }
        });
    }
    static removeJFrogServers() {
        return __awaiter(this, void 0, void 0, function* () {
            yield Utils.runCli(['c', 'rm', '--quiet']);
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
     * @param jfrogCredentials All collected JFrog credentials
     * @returns the download details.
     */
    static extractDownloadDetails(repository, jfrogCredentials) {
        if (repository === '') {
            return Utils.DEFAULT_DOWNLOAD_DETAILS;
        }
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
            if (!jfrogCredentials.jfrogUrl) {
                throw new Error(`'download-repository' input provided, but no JFrog environment details found. ` +
                    `Hint - Ensure that the JFrog connection details environment variables are set: ` +
                    `either a Config Token with a JF_ENV_ prefix or separate env config (JF_URL, JF_USER, JF_PASSWORD, JF_ACCESS_TOKEN)`);
            }
            serverObj.artifactoryUrl = jfrogCredentials.jfrogUrl.replace(/\/$/, '') + '/artifactory';
            serverObj.user = jfrogCredentials.username;
            serverObj.password = jfrogCredentials.password;
            serverObj.accessToken = jfrogCredentials.accessToken;
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
     * Generates GitHub Job Summary markdown file
     * This function runs as part of post-workflow cleanup function,
     * collects section markdown files and generates a single markdown file.
     */
    static generateJobSummary() {
        return __awaiter(this, void 0, void 0, function* () {
            const endFilePath = process.env.GITHUB_STEP_SUMMARY;
            if (!endFilePath) {
                core.error('GITHUB_STEP_SUMMARY is not set. Job summary will not be generated.');
                return;
            }
            try {
                // Read all sections and construct the final markdown file
                const fileContent = yield this.constructJobSummary();
                if (fileContent.length == 0) {
                    return;
                }
                // Copy the content to the step summary path, to be displayed in the GitHub UI.
                yield fs_1.promises.writeFile(endFilePath, fileContent);
                yield this.clearJobSummaryDir();
                core.debug(`Content written to ${endFilePath}`);
            }
            catch (error) {
                core.error(`Failed to generate job summary: ${error}`);
            }
        });
    }
    static constructJobSummary() {
        return __awaiter(this, void 0, void 0, function* () {
            const homedir = Utils.getCliJobSummaryPathByOs();
            let fileContent = '';
            let isAnySectionFound = false;
            // Read each section
            for (const fileName of Utils.JOB_SUMMARY_SECTIONS) {
                try {
                    const content = yield fs_1.promises.readFile(path.join(homedir, fileName), 'utf-8');
                    if (content.trim() !== '') {
                        isAnySectionFound = true;
                    }
                    fileContent += '\n\n' + content;
                }
                catch (error) {
                    core.debug(`Section ${fileName} not found or empty, skipping...`);
                }
            }
            if (isAnySectionFound) {
                fileContent = this.getInitialContent() + fileContent;
            }
            return fileContent;
        });
    }
    static getInitialContent() {
        // Add title and JFrog logo as bitmap.
        return '<p >\n' +
            '  <h1> \n' +
            '    <picture><img src="data:image/png;base64,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"    ' +
            '     style="margin: 0 0 -10px 0"width="65px" alt=""></picture> JFrog Platform Job Summary \n' +
            '     </h1> \n' +
            '</p>  ';
    }
    static getCliJobSummaryPathByOs() {
        switch (process.env.RUNNER_OS) {
            case 'Windows':
                return (0, path_1.join)(process.env.USERPROFILE || '', this.JOB_SUMMARY_DIR_PATH);
            case 'Linux':
            case 'macOS':
                return (0, path_1.join)(process.env.HOME || '', this.JOB_SUMMARY_DIR_PATH);
            default:
                throw new Error(`Unsupported OS: ${process.env.RUNNER_OS}`);
        }
    }
    static clearJobSummaryDir() {
        return __awaiter(this, void 0, void 0, function* () {
            const homedir = Utils.getCliJobSummaryPathByOs();
            yield fs_1.promises.rmdir(homedir, { recursive: true });
        });
    }
}
exports.Utils = Utils;
// eslint-disable-next-line @typescript-eslint/no-var-requires
Utils.USER_AGENT = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
// Default artifactory URL and repository for downloading JFrog CLI
Utils.DEFAULT_DOWNLOAD_DETAILS = {
    artifactoryUrl: 'https://releases.jfrog.io/artifactory',
    repository: 'jfrog-cli'
};
// The JF_ENV_* prefix for Config Tokens
Utils.CONFIG_TOKEN_PREFIX = /^JF_ENV_.*$/;
// Minimum JFrog CLI version supported
Utils.MIN_CLI_VERSION = '1.46.4';
// The value in "version" argument to set to get the latest JFrog CLI version
Utils.LATEST_CLI_VERSION = 'latest';
// The value in the download URL to set to get the latest version
Utils.LATEST_RELEASE_VERSION = '[RELEASE]';
// The default server id name for separate env config
Utils.SETUP_JFROG_CLI_SERVER_ID = 'setup-jfrog-cli-server';
// Directory path which holds markdown files for the job summary
Utils.JOB_SUMMARY_DIR_PATH = '.jfrog/jfrog-job-summary';
// Job summary section files
Utils.JOB_SUMMARY_SECTIONS = ['upload-data.md', 'build-publish.md', 'security.md'];
// Inputs
// Version input
Utils.CLI_VERSION_ARG = 'version';
// Download repository input
Utils.CLI_REMOTE_ARG = 'download-repository';
// OpenID Connect audience input
Utils.OIDC_AUDIENCE_ARG = 'oidc-audience';
// OpenID Connect provider_name input
Utils.OIDC_INTEGRATION_PROVIDER_NAME = 'oidc-provider-name';
