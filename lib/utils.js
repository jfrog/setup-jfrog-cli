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
const oidc_utils_1 = require("./oidc-utils");
const job_summary_1 = require("./job-summary");
class Utils {
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
            password: process.env.JF_PASSWORD,
            oidcProviderName: core.getInput(Utils.OIDC_INTEGRATION_PROVIDER_NAME),
            oidcAudience: core.getInput(Utils.OIDC_AUDIENCE_ARG) || '',
            oidcTokenId: '',
        };
        if (jfrogCredentials.password && !jfrogCredentials.username) {
            throw new Error('JF_PASSWORD is configured, but the JF_USER environment variable was not set.');
        }
        if (jfrogCredentials.username && !jfrogCredentials.accessToken && !jfrogCredentials.password) {
            throw new Error('JF_USER is configured, but the JF_PASSWORD or JF_ACCESS_TOKEN environment variables were not set.');
        }
        // Mark the credentials as secrets to prevent them from being printed in the logs or exported to other workflows
        if (jfrogCredentials.accessToken) {
            core.setSecret(jfrogCredentials.accessToken);
        }
        if (jfrogCredentials.password) {
            core.setSecret(jfrogCredentials.password);
        }
        return jfrogCredentials;
    }
    static getGheBaseUrl() {
        const v = core.getInput(Utils.GHE_BASE_URL_INPUT, { required: false }) || core.getInput(Utils.GHE_BASE_URL_ALIAS_INPUT, { required: false }) || '';
        return v.trim();
    }
    static getAndAddCliToPath(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            let version = core.getInput(Utils.CLI_VERSION_ARG);
            let cliRemote = core.getInput(Utils.CLI_REMOTE_ARG);
            const isLatestVer = version === Utils.LATEST_CLI_VERSION;
            if (!isLatestVer && (0, semver_1.lt)(version, this.MIN_CLI_VERSION)) {
                throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
            }
            if (!isLatestVer && this.loadFromCache(version)) {
                core.info('Found JFrog CLI in cache. No need to download');
                return;
            }
            // To download CLI from a remote repository, we first need to fetch an access token.
            // Force manual OIDC flow since CLI is not yet available.
            if (jfrogCredentials.oidcProviderName && cliRemote != '') {
                core.debug('Fetching OIDC access token to download CLI from remote repository using manual flow');
                jfrogCredentials.accessToken = yield oidc_utils_1.OidcUtils.exchangeOidcToken(jfrogCredentials, true);
            }
            // Download JFrog CLI
            let downloadDetails = Utils.extractDownloadDetails(cliRemote, jfrogCredentials);
            let url = Utils.getCliUrl(version, Utils.getJFrogExecutableName(), downloadDetails);
            core.info('Downloading JFrog CLI from ' + url);
            let downloadedExecutable = yield toolCache.downloadTool(url, undefined, downloadDetails.auth);
            // Cache 'jf' and 'jfrog' executables
            yield this.cacheAndAddPath(downloadedExecutable, version);
        });
    }
    /**
     * Try to load the JFrog CLI executables from cache.
     *
     * @param version       - JFrog CLI version
     * @returns true if the CLI executable was loaded from cache and added to path
     */
    static loadFromCache(version) {
        const jfFileName = Utils.getJfExecutableName();
        const jfrogFileName = Utils.getJFrogExecutableName();
        if (version === Utils.LATEST_CLI_VERSION) {
            // If the version is 'latest', we keep it on cache as 100.100.100
            version = Utils.LATEST_SEMVER;
        }
        const jfExecDir = toolCache.find(jfFileName, version);
        const jfrogExecDir = toolCache.find(jfrogFileName, version);
        if (jfExecDir && jfrogExecDir) {
            core.addPath(jfExecDir);
            core.addPath(jfrogExecDir);
            return true;
        }
        return false;
    }
    /**
     * Add JFrog CLI executables to cache and to the system path.
     * @param downloadedExecutable - Path to the downloaded JFrog CLI executable
     * @param version              - JFrog CLI version
     */
    static cacheAndAddPath(downloadedExecutable, version) {
        return __awaiter(this, void 0, void 0, function* () {
            if (version === Utils.LATEST_CLI_VERSION) {
                // If the version is 'latest', we keep it on cache as 100.100.100 as GitHub actions cache supports only semver versions
                version = Utils.LATEST_SEMVER;
            }
            const jfFileName = Utils.getJfExecutableName();
            const jfrogFileName = Utils.getJFrogExecutableName();
            let jfCacheDir = yield toolCache.cacheFile(downloadedExecutable, jfFileName, jfFileName, version);
            core.addPath(jfCacheDir);
            let jfrogCacheDir = yield toolCache.cacheFile(downloadedExecutable, jfrogFileName, jfrogFileName, version);
            core.addPath(jfrogCacheDir);
            if (!Utils.isWindows()) {
                (0, fs_1.chmodSync)((0, path_1.join)(jfCacheDir, jfFileName), 0o555);
                (0, fs_1.chmodSync)((0, path_1.join)(jfrogCacheDir, jfrogFileName), 0o555);
            }
        });
    }
    /**
     * Get the JFrog CLI download URL.
     * @param version - Requested version
     * @param fileName - Executable file name
     * @param downloadDetails - Source Artifactory details
     */
    static getCliUrl(version, fileName, downloadDetails) {
        const architecture = 'jfrog-cli-' + Utils.getArchitecture();
        const artifactoryUrl = downloadDetails.artifactoryUrl.replace(/\/$/, '');
        let major;
        if (version === Utils.LATEST_CLI_VERSION) {
            version = Utils.LATEST_RELEASE_VERSION;
            major = '2';
        }
        else {
            major = version.split('.')[0];
        }
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
    static getJfrogCliConfigArgs(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            /**
             * @name url - JFrog Platform URL
             * @name user - JFrog Platform basic authentication
             * @name password - JFrog Platform basic authentication
             * @name accessToken - Jfrog Platform access token
             * @name oidcProviderName - OpenID Connect provider name defined in the JFrog Platform
             */
            let url = jfrogCredentials.jfrogUrl;
            let user = jfrogCredentials.username;
            let password = jfrogCredentials.password;
            let accessToken = jfrogCredentials.accessToken;
            let oidcProviderName = jfrogCredentials.oidcProviderName;
            // Url is mandatory for JFrog CLI configuration
            if (!url) {
                return;
            }
            // Check for OIDC authentication
            if (!!oidcProviderName) {
                accessToken = yield oidc_utils_1.OidcUtils.exchangeOidcToken(jfrogCredentials);
            }
            const configCmd = [Utils.getServerIdForConfig(), '--url', url, '--interactive=false', '--overwrite=true'];
            if (!!accessToken) {
                // Access Token / OIDC Token
                configCmd.push('--access-token', accessToken);
            }
            else if (!!user && !!password) {
                // Basic Auth
                configCmd.push('--user', user, '--password', password);
            }
            return configCmd;
        });
    }
    /**
     * Get server ID for JFrog CLI configuration. Save the server ID in the servers env var if it doesn't already exist.
     */
    static getServerIdForConfig() {
        let serverId = Utils.getCustomOrDefaultServerId();
        // Add new serverId to the servers env var if it doesn't already exist.
        if (Utils.getConfiguredJFrogServers().includes(serverId)) {
            return serverId;
        }
        const currentValue = process.env[Utils.JFROG_CLI_SERVER_IDS_ENV_VAR];
        const newVal = currentValue ? `${currentValue};${serverId}` : serverId;
        core.exportVariable(Utils.JFROG_CLI_SERVER_IDS_ENV_VAR, newVal);
        return serverId;
    }
    /**
     * Returns the custom server ID if provided, otherwise returns the default server ID.
     */
    static getCustomOrDefaultServerId() {
        const customServerId = this.getInputtedCustomId();
        return customServerId || this.getRunDefaultServerId();
    }
    static getInputtedCustomId() {
        let customServerId = core.getInput(Utils.CUSTOM_SERVER_ID);
        if (customServerId) {
            return customServerId;
        }
        return undefined;
    }
    /**
     * Return the default server ID for JFrog CLI server configuration.
     */
    static getRunDefaultServerId() {
        return Utils.SETUP_JFROG_CLI_SERVER_ID;
    }
    static setCliEnv() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (core.isDebug()) {
            Utils.exportVariableIfNotSet('JFROG_CLI_LOG_LEVEL', 'DEBUG');
        }
        Utils.exportVariableIfNotSet('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*;JF_URL;JF_USER;JF_PASSWORD;JF_ACCESS_TOKEN');
        Utils.exportVariableIfNotSet('JFROG_CLI_OFFER_CONFIG', 'false');
        Utils.exportVariableIfNotSet('JFROG_CLI_AVOID_NEW_VERSION_WARNING', 'true');
        Utils.exportVariableIfNotSet('CI', 'true');
        Utils.exportVariableIfNotSet('JFROG_CLI_SOURCECODE_REPOSITORY', (_a = process.env.GITHUB_REPOSITORY) !== null && _a !== void 0 ? _a : '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_JOB_ID', (_b = process.env.GITHUB_WORKFLOW) !== null && _b !== void 0 ? _b : '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_RUN_ID', (_c = process.env.GITHUB_RUN_ID) !== null && _c !== void 0 ? _c : '');
        Utils.exportVariableIfNotSet('JFROG_CLI_GITHUB_TOKEN', (_d = process.env.GITHUB_TOKEN) !== null && _d !== void 0 ? _d : '');
        // Used for OIDC token exchange extra params
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_VCS_REVISION', (_f = (_e = process.env.GITHUB_SHA) !== null && _e !== void 0 ? _e : '') !== null && _f !== void 0 ? _f : '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_BRANCH', (_h = (_g = process.env.GITHUB_REF_NAME) !== null && _g !== void 0 ? _g : '') !== null && _h !== void 0 ? _h : '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_VCS_URL', Utils.buildVcsUrl());
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
        // Set JF_PROJECT as JFROG_CLI_BUILD_PROJECT to allow the JFrog CLI to use it as the project key
        let projectKey = process.env.JF_PROJECT;
        if (projectKey) {
            Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_PROJECT', projectKey);
        }
        // Enable job summaries if disable was not requested.
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            job_summary_1.JobSummary.enableJobSummaries();
        }
        // Indicate if JF_GIT_TOKEN is provided as an environment variable, used by Xray usage.
        Utils.exportVariableIfNotSet('JFROG_CLI_USAGE_GH_TOKEN_FOR_CODE_SCANNING_ALERTS_PROVIDED', (_j = process.env.JF_GIT_TOKEN) !== null && _j !== void 0 ? _j : '');
    }
    static buildVcsUrl() {
        const serverUrl = process.env.GITHUB_SERVER_URL;
        const repo = process.env.GITHUB_REPOSITORY;
        return serverUrl && repo ? `${serverUrl}/${repo}` : '';
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
                // Mark the credentials as secrets to prevent them from being printed in the logs or exported to other workflows
                core.setSecret(configToken);
                yield Utils.runCli(cliConfigCmd.concat('import', configToken));
            }
            let configArgs = yield Utils.getJfrogCliConfigArgs(jfrogCredentials);
            if (configArgs) {
                yield Utils.runCli(cliConfigCmd.concat('add', ...configArgs));
            }
        });
    }
    /**
     * Removes configured JFrog CLI servers saved in the environment variable.
     * If a custom server ID is defined, only remove the custom server ID.
     */
    static removeJFrogServers() {
        return __awaiter(this, void 0, void 0, function* () {
            const customServerId = this.getInputtedCustomId();
            core.info(`The value of custom is: '${customServerId}'`);
            if (customServerId) {
                // Remove only the custom server ID
                core.debug(`Removing custom server ID: '${customServerId}'...`);
                yield Utils.runCli(['c', 'rm', customServerId, '--quiet']);
            }
            else {
                // Remove all configured server IDs
                for (const serverId of Utils.getConfiguredJFrogServers()) {
                    core.debug(`Removing server ID: '${serverId}'...`);
                    yield Utils.runCli(['c', 'rm', serverId, '--quiet']);
                }
                core.exportVariable(Utils.JFROG_CLI_SERVER_IDS_ENV_VAR, '');
            }
        });
    }
    /**
     * Split and return the configured JFrog CLI servers that are saved in the servers env var.
     */
    static getConfiguredJFrogServers() {
        const serversValue = process.env[Utils.JFROG_CLI_SERVER_IDS_ENV_VAR];
        if (!serversValue) {
            return [];
        }
        return serversValue.split(';');
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
     * Therefore, the 'jf' executable is expected to be in the path also for older CLI versions.
     * @param args - CLI arguments
     * @param options - Execution options
     */
    static runCli(args, options) {
        return __awaiter(this, void 0, void 0, function* () {
            let res = yield (0, exec_1.exec)('jf', args, Object.assign(Object.assign({}, options), { ignoreReturnCode: true }));
            if (res !== core.ExitCode.Success) {
                throw new Error('JFrog CLI exited with exit code: ' + res);
            }
        });
    }
    /**
     * Execute JFrog CLI command and capture its output.
     * This GitHub Action downloads the requested 'jfrog' executable and stores it as 'jfrog' and 'jf'.
     * Therefore, the 'jf' executable is expected to be in the path also for older CLI versions.
     * The command's output is captured and returned as a string.
     * The command is executed silently, meaning its output will not be printed to the console.
     * If the command fails (i.e., exits with a non-success code), an error is thrown.
     * @param args - CLI arguments
     * @param options
     * @returns The standard output of the CLI command as a string.
     * @throws An error if the JFrog CLI command exits with a non-success code.
     */
    static runCliAndGetOutput(args, options) {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug(`jf ${args.join(' ')}`);
            let output;
            output = yield (0, exec_1.getExecOutput)('jf', args, Object.assign(Object.assign({}, options), { ignoreReturnCode: true }));
            if (output.exitCode !== core.ExitCode.Success) {
                if (options === null || options === void 0 ? void 0 : options.silent) {
                    core.info(output.stdout);
                    core.info(output.stderr);
                }
                throw new Error(`JFrog CLI exited with exit code ${output.exitCode}`);
            }
            return output.stdout;
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
}
exports.Utils = Utils;
// eslint-disable-next-line @typescript-eslint/no-var-requires
Utils.USER_AGENT = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
// Default artifactory URL and repository for downloading JFrog CLI
Utils.DEFAULT_DOWNLOAD_DETAILS = {
    artifactoryUrl: 'https://releases.jfrog.io/artifactory',
    repository: 'jfrog-cli',
};
// The JF_ENV_* prefix for Config Tokens
Utils.CONFIG_TOKEN_PREFIX = /^JF_ENV_.*$/;
// Minimum JFrog CLI version supported
Utils.MIN_CLI_VERSION = '1.46.4';
// The value in "version" argument to set to get the latest JFrog CLI version
Utils.LATEST_CLI_VERSION = 'latest';
// The value in the download URL to set to get the latest version
Utils.LATEST_RELEASE_VERSION = '[RELEASE]';
// Placeholder CLI version to use to keep 'latest' in cache.
Utils.LATEST_SEMVER = '100.100.100';
// The default server id name for separate env config
Utils.SETUP_JFROG_CLI_SERVER_ID = 'setup-jfrog-cli-server';
// Environment variable to hold all configured server IDs, separated by ';'
Utils.JFROG_CLI_SERVER_IDS_ENV_VAR = 'SETUP_JFROG_CLI_SERVER_IDS';
// Inputs
// Version input
Utils.CLI_VERSION_ARG = 'version';
// Download repository input
Utils.CLI_REMOTE_ARG = 'download-repository';
// OpenID Connect audience input
Utils.OIDC_AUDIENCE_ARG = 'oidc-audience';
// OpenID Connect provider_name input
Utils.OIDC_INTEGRATION_PROVIDER_NAME = 'oidc-provider-name';
// Disable Job Summaries feature flag
Utils.JOB_SUMMARY_DISABLE = 'disable-job-summary';
// Disable auto build info publish feature flag
Utils.AUTO_BUILD_PUBLISH_DISABLE = 'disable-auto-build-publish';
// Disable auto evidence collection feature flag
Utils.AUTO_EVIDENCE_COLLECTION_DISABLE = 'disable-auto-evidence-collection';
// Custom server ID input
Utils.CUSTOM_SERVER_ID = 'custom-server-id';
// GHES baseUrl support
Utils.GHE_BASE_URL_INPUT = 'ghe-base-url';
Utils.GHE_BASE_URL_ALIAS_INPUT = 'ghe_base_url';
