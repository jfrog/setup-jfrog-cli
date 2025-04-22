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
exports.getOIDCAccessTokenFromCliOutput = getOIDCAccessTokenFromCliOutput;
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const http_client_1 = require("@actions/http-client");
const toolCache = __importStar(require("@actions/tool-cache"));
const fs_1 = require("fs");
const os_1 = require("os");
const path = __importStar(require("path"));
const path_1 = require("path");
const semver_1 = require("semver");
const core_1 = require("@octokit/core");
const github = __importStar(require("@actions/github"));
const zlib_1 = require("zlib");
const util_1 = require("util");
const js_yaml_1 = require("js-yaml");
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
            oidcAudience: core.getInput(Utils.OIDC_AUDIENCE_ARG) || Utils.DEFAULT_OIDC_AUDIENCE,
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
    /**
     * Exchanges a GitHub OIDC JWT for a JFrog access token using the JFrog platform's REST API.
     *
     * This function is referred to as "manual" because it performs the exchange
     * via a direct HTTP request to the JFrog token exchange API (`/access/api/v1/oidc/token`),
     * instead of using the JFrog CLI (`jf eot`).
     *
     * This approach ensures backward compatibility with CLI versions
     *
     * @param jfrogCredentials JFrog credentials including URL and OIDC provider info
     * @param jsonWebToken JWT from GitHub OIDC identity token
     * @param applicationKey Key to identify GitHub app in the JFrog platform
     * @returns access token if successful, throws otherwise
     */
    static manualExchangeOidcAndSetAsAccessToken(jfrogCredentials, jsonWebToken, applicationKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = jfrogCredentials.jfrogUrl;
            const providerName = jfrogCredentials.oidcProviderName;
            if (!url || !providerName) {
                throw new Error('Missing required JFrog URL or OIDC provider name.');
            }
            const exchangeUrl = url.replace(/\/$/, '') + '/access/api/v1/oidc/token';
            core.debug('Exchanging GitHub JWT for a JFrog access token...');
            const payload = this.buildOidcTokenExchangePayload(jsonWebToken, providerName, applicationKey);
            const httpClient = new http_client_1.HttpClient();
            const headers = { 'Content-Type': 'application/json' };
            const response = yield httpClient.post(exchangeUrl, JSON.stringify(payload), headers);
            const responseBody = yield response.readBody();
            const responseJson = JSON.parse(responseBody);
            if (responseJson.errors) {
                throw new Error(`OIDC token exchange failed: ${JSON.stringify(responseJson.errors)}`);
            }
            if (!responseJson.access_token) {
                throw new Error('Access token not found in the response');
            }
            this.outputOidcTokenAndUsernameFromToken(responseJson.access_token);
            this.trackOldOidcUsage();
            return responseJson.access_token;
        });
    }
    /**
     * Builds the payload for the OIDC token exchange request.
     * This had been replaced by the CLI itself, but we still need to support older versions of the CLI.
     */
    static buildOidcTokenExchangePayload(jsonWebToken, providerName, applicationKey) {
        return {
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
            subject_token: jsonWebToken,
            provider_name: providerName,
            project_key: process.env.JF_PROJECT || '',
            gh_job_id: this.getGithubJobId(),
            gh_run_id: process.env.GITHUB_RUN_ID || '',
            gh_repo: process.env.GITHUB_REPOSITORY || '',
            application_key: applicationKey,
        };
    }
    /**
     * Those environment variables are used to track OIDC usage in older versions ofJFrog CLI
     */
    static trackOldOidcUsage() {
        core.exportVariable('JFROG_CLI_USAGE_CONFIG_OIDC', 'TRUE');
        core.exportVariable('JFROG_CLI_USAGE_OIDC_USED', 'TRUE');
    }
    /**
     * Output the OIDC access token as a secret and the user from the OIDC access token subject as a secret.
     * Both are set as secrets to prevent them from being printed in the logs or exported to other workflows.
     * @param oidcToken access token received from the JFrog platform during OIDC token exchange
     */
    static outputOidcTokenAndUsernameFromToken(oidcToken) {
        let payload = this.decodeOidcToken(oidcToken);
        let tokenUser = this.extractTokenUser(payload.sub);
        this.outputOidcStepOutputs(tokenUser, oidcToken);
    }
    /**
     * Output the OIDC access token and the user from the OIDC access token subject as step outputs.
     * @param username
     * @param accessToken
     * @private
     */
    static outputOidcStepOutputs(username, accessToken) {
        // Making sure the token is treated as a secret
        core.setSecret(accessToken);
        // Output the oidc access token as a secret
        core.setOutput(this.OIDC_TOKEN_STEP_OUTPUT_PARAM_NAME, accessToken);
        // Output the user from the oidc access token subject as a secret
        // Mark the user as a secret
        core.setSecret(username);
        // Output the user from the oidc access token subject extracted from the last section of the subject
        core.setOutput(this.OIDC_USER_STEP_OUTPUT_PARAM_NAME, username);
        core.debug('Successfully outputted OIDC step outputs params');
    }
    /**
     * Extract the username from the OIDC access token subject.
     * @param subject OIDC token subject
     * @returns the username
     */
    static extractTokenUser(subject) {
        // Main OIDC user parsing logic
        if (subject.startsWith('jfrt@') || subject.includes('/users/')) {
            let lastSlashIndex = subject.lastIndexOf('/');
            // Return the user extracted from the token
            return subject.substring(lastSlashIndex + 1);
        }
        // No parsing was needed, returning original sub from the token as the user
        return subject;
    }
    /**
     * Decode the OIDC access token and return the payload.
     * @param oidcToken access token received from the JFrog platform during OIDC token exchange
     * @returns the payload of the OIDC access token
     */
    static decodeOidcToken(oidcToken) {
        // Split jfrogCredentials.accessToken into 3 parts divided by .
        let tokenParts = oidcToken.split('.');
        if (tokenParts.length != 3) {
            // this error should not happen since access only generates valid JWT tokens
            throw new Error(`OIDC invalid access token format`);
        }
        // Decode the second part of the token
        let base64Payload = tokenParts[1];
        let utf8Payload = Buffer.from(base64Payload, 'base64').toString('utf8');
        let payload = JSON.parse(utf8Payload);
        if (!payload || !payload.sub) {
            throw new Error(`OIDC invalid access token format`);
        }
        return payload;
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
             * @name oidcAudience - JFrog Platform OpenID Connect audience
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
                accessToken = yield this.handleOidcAuth(jfrogCredentials);
            }
            const configCmd = [Utils.getServerIdForConfig(), '--url', url, '--interactive=false', '--overwrite=true'];
            if (!!accessToken) {
                // Access Token
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
     * Exchange OIDC token with an access token using JFrog CLI.
     * @return Access token
     * @throws Error if the CLI command fails, or parsing of the CLI outputs fails
     * @private
     * @param creds
     */
    static exchangeOIDCTokenAndExportStepOutputs(creds) {
        return __awaiter(this, void 0, void 0, function* () {
            let output;
            // Validate the credentials
            if (!creds.oidcProviderName || !creds.oidcTokenId || !creds.jfrogUrl) {
                throw new Error('One or more required credentials are undefined. Please ensure all values are provided.');
            }
            // Run the CLI command to exchange the OIDC token
            try {
                output = yield (0, exec_1.getExecOutput)('jf', ['eot', creds.oidcProviderName, creds.oidcTokenId, '--url', creds.jfrogUrl, '--oidc-audience', creds.oidcAudience], {
                    silent: true,
                    ignoreReturnCode: true,
                });
            }
            catch (error) {
                // Catch any error
                core.error(`Failed to exchange OIDC token: ${error.message}`);
                throw new Error(`Failed to exchange OIDC token with an access token: ${error.message}`);
            }
            // If the CLI execution failed, throw an error
            if (output.exitCode !== 0) {
                throw new Error(`CLI command failed with exit code ${output.exitCode}: ${output.stderr}`);
            }
            // Extract username and access token from command output
            const { accessToken, username } = getOIDCAccessTokenFromCliOutput(output.stdout);
            // Sets the OIDC step output params
            Utils.outputOidcStepOutputs(username, accessToken);
            return accessToken;
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
        var _a, _b, _c, _d;
        Utils.exportVariableIfNotSet('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*;JF_URL;JF_USER;JF_PASSWORD;JF_ACCESS_TOKEN');
        Utils.exportVariableIfNotSet('JFROG_CLI_OFFER_CONFIG', 'false');
        Utils.exportVariableIfNotSet('CI', 'true');
        Utils.exportVariableIfNotSet('JFROG_CLI_SOURCECODE_REPOSITORY', (_a = process.env.GITHUB_REPOSITORY) !== null && _a !== void 0 ? _a : '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_JOB_ID', (_b = process.env.GITHUB_WORKFLOW) !== null && _b !== void 0 ? _b : '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_RUN_ID', (_c = process.env.GITHUB_RUN_ID) !== null && _c !== void 0 ? _c : '');
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
            Utils.enableJobSummaries();
        }
        // Indicate if JF_GIT_TOKEN is provided as an environment variable, used by Xray usage.
        Utils.exportVariableIfNotSet('JFROG_CLI_USAGE_GH_TOKEN_FOR_CODE_SCANNING_ALERTS_PROVIDED', (_d = process.env.JF_GIT_TOKEN) !== null && _d !== void 0 ? _d : '');
    }
    /**
     * Enabling job summary is done by setting the output dir for the summaries.
     * If the output dir is not set, the CLI won't generate the summary Markdown files.
     */
    static enableJobSummaries() {
        let tempDir = this.getTempDirectory();
        Utils.exportVariableIfNotSet(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, tempDir);
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
    static isJobSummarySupported() {
        const version = core.getInput(Utils.CLI_VERSION_ARG);
        return version === Utils.LATEST_CLI_VERSION || (0, semver_1.gte)(version, Utils.MIN_CLI_VERSION_JOB_SUMMARY);
    }
    static isCLIVersionOidcSupported() {
        const version = core.getInput(Utils.CLI_VERSION_ARG) || '';
        if (version === '') {
            // No input meaning default version which is supported
            return true;
        }
        return version === Utils.LATEST_CLI_VERSION || (0, semver_1.gte)(version, Utils.MIN_CLI_OIDC_VERSION);
    }
    /**
     * Generates GitHub workflow unified Summary report.
     * This function runs as part of post-workflow cleanup function,
     * collects existing section markdown files generated by the CLI,
     * and constructs a single Markdown file, to be displayed in the GitHub UI.
     */
    static setMarkdownAsJobSummary() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Read all sections and construct the final Markdown file
                const markdownContent = yield this.readCommandSummaryMarkdown();
                if (markdownContent.length == 0) {
                    core.debug('No job summary file found. Workflow summary will not be generated.');
                    return;
                }
                // Write to GitHub's job summary
                core.summary.addRaw(markdownContent, true);
                yield core.summary.write({ overwrite: true });
            }
            catch (error) {
                core.warning(`Failed to generate Workflow summary: ${error}`);
            }
        });
    }
    /**
     * Populates the code scanning SARIF (if generated by scan commands) to the code scanning tab in GitHub.
     */
    static populateCodeScanningTab() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const encodedSarif = yield this.getCodeScanningEncodedSarif();
                if (!encodedSarif) {
                    return;
                }
                const token = process.env.JF_GIT_TOKEN;
                if (!token) {
                    console.info('No token provided for uploading code scanning sarif files.');
                    return;
                }
                yield this.uploadCodeScanningSarif(encodedSarif, token);
            }
            catch (error) {
                core.warning(`Failed populating code scanning sarif: ${error}`);
            }
        });
    }
    /**
     * Uploads the code scanning SARIF content to the code-scanning GitHub API.
     * @param encodedSarif - The final compressed and encoded sarif content.
     * @param token - GitHub token to use for the request. Has to have 'security-events: write' permission.
     * @private
     */
    static uploadCodeScanningSarif(encodedSarif, token) {
        return __awaiter(this, void 0, void 0, function* () {
            const octokit = new core_1.Octokit({ auth: token });
            let response;
            response = yield octokit.request('POST /repos/{owner}/{repo}/code-scanning/sarifs', {
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                commit_sha: github.context.sha,
                ref: github.context.ref,
                sarif: encodedSarif,
            });
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`Failed to upload SARIF file: ` + JSON.stringify(response));
            }
            core.info('SARIF file uploaded successfully');
        });
    }
    /**
     * Compresses the input sarif content using gzip and encodes it to base64. This is required by the code-scanning/sarif API.
     * @param input - The sarif content to compress and encode.
     * @returns The compressed and encoded string.
     * @private
     */
    static compressAndEncodeSarif(input) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const compressed = yield (0, util_1.promisify)(zlib_1.gzip)(input);
                return compressed.toString('base64');
            }
            catch (error) {
                throw new Error('Compression of sarif file failed: ' + error);
            }
        });
    }
    /**
     * Each section should prepare a file called markdown.md.
     * This function reads each section file and wraps it with a markdown header
     * @returns <string> the content of the markdown file as string, warped in a collapsable section.
     */
    static readCommandSummaryMarkdown() {
        return __awaiter(this, void 0, void 0, function* () {
            let markdownContent = yield Utils.readMarkdownContent();
            if (markdownContent === '') {
                return '';
            }
            // Check if the header can be accessed via the internet to decide if to use the image or the text header
            this.isSummaryHeaderAccessible = yield this.isHeaderPngAccessible();
            core.debug('Header image is accessible: ' + this.isSummaryHeaderAccessible);
            return Utils.wrapContent(markdownContent);
        });
    }
    /**
     * Reads the combined SARIF file, compresses and encodes it to match the code-scanning/sarif API requirements.
     * @returns <string[]> the paths of the code scanning sarif files.
     */
    static getCodeScanningEncodedSarif() {
        return __awaiter(this, void 0, void 0, function* () {
            const finalSarifFile = path.join(Utils.getJobOutputDirectoryPath(), this.SECURITY_DIR_NAME, this.SARIF_REPORTS_DIR_NAME, this.CODE_SCANNING_FINAL_SARIF_FILE);
            if (!(0, fs_1.existsSync)(finalSarifFile)) {
                console.debug('No code scanning sarif file was found.');
                return '';
            }
            // Read the SARIF file, compress and encode it to match the code-scanning/sarif API requirements.
            const sarif = yield fs_1.promises.readFile(finalSarifFile, 'utf-8');
            return yield this.compressAndEncodeSarif(sarif);
        });
    }
    static readMarkdownContent() {
        return __awaiter(this, void 0, void 0, function* () {
            const markdownFilePath = path.join(Utils.getJobOutputDirectoryPath(), 'markdown.md');
            if ((0, fs_1.existsSync)(markdownFilePath)) {
                return yield fs_1.promises.readFile(markdownFilePath, 'utf-8');
            }
            core.debug(`No job summary file found. at ${markdownFilePath}.`);
            return '';
        });
    }
    static getMarkdownHeader() {
        let mainTitle;
        if (this.isSummaryHeaderAccessible) {
            let platformUrl = Utils.getPlatformUrl();
            mainTitle = `[![JFrog Job Summary Header](${this.MARKDOWN_HEADER_PNG_URL})](${platformUrl})` + '\n\n';
        }
        else {
            mainTitle = `# 🐸 JFrog Job Summary` + '\n\n';
        }
        return mainTitle + Utils.getProjectPackagesLink();
    }
    /**
     * Gets the project packages link to be displayed in the summary
     * If the project is undefined, it will resolve to 'all' section in the UI.
     * @return <string> https://platformUrl/ui/packages?projectKey=projectKey
     */
    static getProjectPackagesLink() {
        let platformUrl = this.getPlatformUrl();
        if (!platformUrl) {
            return '';
        }
        let projectKey = process.env.JF_PROJECT ? process.env.JF_PROJECT : '';
        let projectPackagesUrl = platformUrl + 'ui/packages';
        if (projectKey) {
            projectPackagesUrl += '?projectKey=' + projectKey;
        }
        return `<a href="${projectPackagesUrl}"> 🐸 View package details on the JFrog platform  </a>` + '\n\n';
    }
    static getPlatformUrl() {
        let platformUrl = process.env.JF_URL;
        if (!platformUrl) {
            return '';
        }
        if (!platformUrl.endsWith('/')) {
            platformUrl = platformUrl + '/';
        }
        return platformUrl;
    }
    static getJobOutputDirectoryPath() {
        const outputDir = process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
        if (!outputDir) {
            throw new Error('Jobs home directory is undefined, ' + Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV + ' is not set.');
        }
        return path.join(outputDir, Utils.JOB_SUMMARY_DIR_NAME);
    }
    static clearCommandSummaryDir() {
        return __awaiter(this, void 0, void 0, function* () {
            const outputDir = Utils.getJobOutputDirectoryPath();
            core.debug('Removing command summary directory: ' + outputDir);
            yield fs_1.promises.rm(outputDir, { recursive: true });
        });
    }
    static wrapContent(fileContent) {
        return Utils.getMarkdownHeader() + fileContent + Utils.getMarkdownFooter();
    }
    static getMarkdownFooter() {
        return `${this.getUsageBadge()} \n\n # \n\n The above Job Summary was generated by the <a href="https://github.com/marketplace/actions/setup-jfrog-cli"> Setup JFrog CLI GitHub Action </a>`;
    }
    static getUsageBadge() {
        const platformUrl = Utils.getPlatformUrl();
        const githubJobId = this.getGithubJobId();
        const gitRepo = process.env.GITHUB_REPOSITORY || '';
        const runId = process.env.GITHUB_RUN_ID || '';
        const url = new URL(`${platformUrl}ui/api/v1/u`);
        url.searchParams.set(Utils.SOURCE_PARAM_KEY, Utils.SOURCE_PARAM_VALUE);
        url.searchParams.set(Utils.METRIC_PARAM_KEY, Utils.METRIC_PARAM_VALUE);
        url.searchParams.set(Utils.JOB_ID_PARAM_KEY, githubJobId);
        url.searchParams.set(Utils.RUN_ID_PARAM_KEY, runId);
        url.searchParams.set(Utils.GIT_REPO_PARAM_KEY, gitRepo);
        return `![](${url.toString()})`;
    }
    /**
     * Checks if the header image is accessible via the internet.
     * Saves the result in a static variable to avoid multiple checks.
     * @private
     */
    static isHeaderPngAccessible() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isSummaryHeaderAccessible != undefined) {
                return this.isSummaryHeaderAccessible;
            }
            const url = this.MARKDOWN_HEADER_PNG_URL;
            const httpClient = new http_client_1.HttpClient();
            try {
                // Set timeout to 5 seconds
                const requestOptions = {
                    socketTimeout: 5000,
                };
                const response = yield httpClient.head(url, requestOptions);
                this.isSummaryHeaderAccessible = response.message.statusCode === 200;
            }
            catch (error) {
                core.warning('No internet access to the header image, using the text header instead.');
                this.isSummaryHeaderAccessible = false;
            }
            finally {
                httpClient.dispose();
            }
            return this.isSummaryHeaderAccessible;
        });
    }
    static getTempDirectory() {
        // Determine the temporary directory path, prioritizing RUNNER_TEMP
        // Runner_Temp is set on GitHub machines, but on self-hosted it could be unset.
        const tempDir = process.env.RUNNER_TEMP || (0, os_1.tmpdir)();
        if (!tempDir) {
            throw new Error('Failed to determine the temporary directory');
        }
        return tempDir;
    }
    /**
     * Retrieves the GitHub job ID, which in this context refers to the GitHub workflow name.
     * Note: We use "job" instead of "workflow" to align with our terminology, where "GitHub job summary"
     * refers to the entire workflow summary. Here, "job ID" means the workflow name, not individual jobs within the workflow.
     */
    static getGithubJobId() {
        return process.env.GITHUB_WORKFLOW || '';
    }
    /*
    Currently, OIDC authentication can be handled in two ways due to CLI version limitations:
    1. Manually call the REST API from this codebase.
    2. Use the new OIDC token ID feature in the CLI (2.75.0+).

    If the CLI version supports it and the user is not using an artifactory download repository,
    we use the new CLI native OIDC token ID flow.
    Otherwise, we fall back to manual OIDC exchange for compatibility.

    Note: The manual logic should be deprecated and removed once CLI remote supports native OIDC.
    */
    static handleOidcAuth(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!jfrogCredentials.jfrogUrl) {
                throw new Error(`JF_URL must be provided when oidc-provider-name is specified`);
            }
            // Get OIDC token ID from GitHub
            jfrogCredentials.oidcTokenId = yield Utils.getIdToken(jfrogCredentials.oidcAudience);
            // Version should be more than min version
            // If CLI_REMOTE_ARG specified, we have to fetch token before we can download the CLI.
            if (this.isCLIVersionOidcSupported() && !core.getInput(this.CLI_REMOTE_ARG)) {
                core.debug('Using CLI Config OIDC Auth Method..');
                return yield this.exchangeOIDCTokenAndExportStepOutputs(jfrogCredentials);
            }
            // Fallback to manual OIDC exchange for backward compatibility
            core.debug('Using Manual OIDC Auth Method..');
            return this.manualOIDCExchange(jfrogCredentials);
        });
    }
    /*
    This function manually exchanges oidc token and updates the credentials object with an access token retrieved
     */
    static manualOIDCExchange(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            // Get ID token from GitHub
            const audience = core.getInput(Utils.OIDC_AUDIENCE_ARG);
            let jsonWebToken = yield Utils.getIdToken(audience);
            // Exchanges the token and set as access token in the credential's object
            const applicationKey = yield this.getApplicationKey();
            try {
                return yield this.manualExchangeOidcAndSetAsAccessToken(jfrogCredentials, jsonWebToken, applicationKey);
            }
            catch (error) {
                throw new Error(`Exchanging JSON web token with an access token failed: ${error.message}`);
            }
        });
    }
    /**
     * Retrieves the application key from .jfrog/config file.
     *
     * This method attempts to read config file from the file system.
     * If the configuration file exists and contains the application key, it returns the key.
     * If the configuration file does not exist or does not contain the application key, it returns an empty string.
     *
     * @returns A promise that resolves to the application key as a string.
     */
    static getApplicationKey() {
        return __awaiter(this, void 0, void 0, function* () {
            const configFilePath = path.join(this.JF_CONFIG_DIR_NAME, this.JF_CONFIG_FILE_NAME);
            try {
                const config = yield this.readConfigFromFileSystem(configFilePath);
                if (!config) {
                    console.debug('Config file is empty or not found.');
                    return '';
                }
                const configObj = (0, js_yaml_1.load)(config);
                const application = configObj[this.APPLICATION_ROOT_YML];
                if (!application) {
                    console.log('Application root is not found in the config file.');
                    return '';
                }
                const applicationKey = application[this.KEY];
                if (!applicationKey) {
                    console.log('Application key is not found in the config file.');
                    return '';
                }
                console.debug('Found application key: ' + applicationKey);
                return applicationKey;
            }
            catch (error) {
                console.error('Error reading config:', error);
                return '';
            }
        });
    }
    /**
     * Reads .jfrog configuration file from file system.
     *
     * This method attempts to read .jfrog configuration file from the specified relative path.
     * If the file exists, it reads the file content and returns it as a string.
     * If the file does not exist, it returns an empty string.
     *
     * @param configRelativePath - The relative path to the configuration file.
     * @returns A promise that resolves to the content of the configuration file as a string.
     */
    static readConfigFromFileSystem(configRelativePath) {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug(`Reading config from file system. Looking for ${configRelativePath}`);
            if (!(0, fs_1.existsSync)(configRelativePath)) {
                core.debug(`config.yml not found in ${configRelativePath}`);
                return '';
            }
            core.debug(`config.yml found in ${configRelativePath}`);
            return yield fs_1.promises.readFile(configRelativePath, 'utf-8');
        });
    }
    /**
     * Fetches a JSON Web Token (JWT) ID token from GitHub's OIDC provider.
     * @param audience - The intended audience for the token.
     * @returns A promise that resolves to the JWT ID token as a string.
     * @throws An error if fetching the token fails.
     */
    static getIdToken(audience) {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug('Attempting to fetch JSON Web Token (JWT) ID token...');
            try {
                return yield core.getIDToken(audience);
            }
            catch (error) {
                throw new Error(`Failed to fetch OpenID Connect JSON Web Token: ${error.message}`);
            }
        });
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
// Directory name which holds markdown files for the Workflow summary
Utils.JOB_SUMMARY_DIR_NAME = 'jfrog-command-summary';
// Directory name which holds security command summary files
Utils.SECURITY_DIR_NAME = 'security';
// Directory name which holds sarifs files for the code scanning tab
Utils.SARIF_REPORTS_DIR_NAME = 'sarif-reports';
// JFrog CLI command summary output directory environment variable
Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV = 'JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR';
// Minimum JFrog CLI version supported for job summary command
Utils.MIN_CLI_VERSION_JOB_SUMMARY = '2.66.0';
// Code scanning sarif expected file extension.
Utils.CODE_SCANNING_FINAL_SARIF_FILE = 'final.sarif';
// Inputs
// Version input
Utils.CLI_VERSION_ARG = 'version';
// Download repository input
Utils.CLI_REMOTE_ARG = 'download-repository';
// OpenID Connect audience input
Utils.OIDC_AUDIENCE_ARG = 'oidc-audience';
// OpenID Connect provider_name input
Utils.OIDC_INTEGRATION_PROVIDER_NAME = 'oidc-provider-name';
// Application yaml root key
Utils.APPLICATION_ROOT_YML = 'application';
// Application Config file key, yaml should look like:
// application:
//   key: <application key>
Utils.KEY = 'key';
// Config file directory name
Utils.JF_CONFIG_DIR_NAME = '.jfrog';
// Config file name
Utils.JF_CONFIG_FILE_NAME = 'config.yml';
// Disable Job Summaries feature flag
Utils.JOB_SUMMARY_DISABLE = 'disable-job-summary';
// Disable auto build info publish feature flag
Utils.AUTO_BUILD_PUBLISH_DISABLE = 'disable-auto-build-publish';
// Custom server ID input
Utils.CUSTOM_SERVER_ID = 'custom-server-id';
// URL for the markdown header image
// This is hosted statically because its usage is outside the context of the JFrog setup action.
// It cannot be linked to the repository, as GitHub serves the image from a CDN,
// which gets blocked by the browser, resulting in an empty image.
Utils.MARKDOWN_HEADER_PNG_URL = 'https://media.jfrog.com/wp-content/uploads/2024/09/02161430/jfrog-job-summary.svg';
// Flag to indicate if the summary header is accessible, can be undefined if not checked yet.
Utils.isSummaryHeaderAccessible = undefined;
// Job ID query parameter key
Utils.JOB_ID_PARAM_KEY = 'job_id';
// Run ID query parameter key
Utils.RUN_ID_PARAM_KEY = 'run_id';
// Git repository query parameter key
Utils.GIT_REPO_PARAM_KEY = 'git_repo';
// Source query parameter indicating the source of the request
Utils.SOURCE_PARAM_KEY = 's';
Utils.SOURCE_PARAM_VALUE = '1';
// Metric query parameter indicating the metric type
Utils.METRIC_PARAM_KEY = 'm';
Utils.METRIC_PARAM_VALUE = '1';
Utils.MIN_CLI_OIDC_VERSION = '2.75.0';
Utils.DEFAULT_OIDC_AUDIENCE = 'jfrog-github';
// OIDC output params names
Utils.OIDC_TOKEN_STEP_OUTPUT_PARAM_NAME = 'oidc-token';
Utils.OIDC_USER_STEP_OUTPUT_PARAM_NAME = 'oidc-user';
function getOIDCAccessTokenFromCliOutput(input) {
    if (input === '') {
        throw new Error('Input is empty. Cannot extract values.');
    }
    // Attempt to parse as JSON
    try {
        const parsed = JSON.parse(input);
        if (parsed.AccessToken && parsed.Username) {
            return {
                accessToken: parsed.AccessToken,
                username: parsed.Username,
            };
        }
    }
    catch (error) {
        core.debug(`Failed to parse JSON: ${error},trying with regex`);
    }
    // Fallback to regex extraction
    const regex = /AccessToken:\s*(\S+)\s*Username:\s*(\S+)/;
    const match = regex.exec(input);
    if (!match) {
        throw new Error('Failed to extract values. Input format is invalid.');
    }
    return {
        accessToken: match[1],
        username: match[2],
    };
}
