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
exports.Utils = exports.MarkdownSection = void 0;
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const http_client_1 = require("@actions/http-client");
const toolCache = __importStar(require("@actions/tool-cache"));
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const semver_1 = require("semver");
const path = __importStar(require("path"));
var MarkdownSection;
(function (MarkdownSection) {
    MarkdownSection["Upload"] = "upload";
    MarkdownSection["BuildInfo"] = "build-info";
    MarkdownSection["Security"] = "security";
})(MarkdownSection || (exports.MarkdownSection = MarkdownSection = {}));
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
            let projectKey = process.env.JF_PROJECT || '';
            const httpClient = new http_client_1.HttpClient();
            const data = `{
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
            "subject_token": "${jsonWebToken}",
            "provider_name": "${oidcProviderName}",
            "project_key": "${projectKey}"
        }`;
            const additionalHeaders = {
                'Content-Type': 'application/json'
            };
            const response = yield httpClient.post(exchangeUrl, data, additionalHeaders);
            const responseString = yield response.readBody();
            const responseJson = JSON.parse(responseString);
            jfrogCredentials.accessToken = responseJson.access_token;
            if (jfrogCredentials.accessToken) {
                this.outputOidcTokenAndUsername(jfrogCredentials.accessToken);
            }
            if (responseJson.errors) {
                throw new Error(`${JSON.stringify(responseJson.errors)}`);
            }
            return jfrogCredentials;
        });
    }
    /**
     * Output the OIDC access token as a secret and the user from the OIDC access token subject as a secret.
     * Both are set as secrets to prevent them from being printed in the logs or exported to other workflows.
     * @param oidcToken access token received from the JFrog platform during OIDC token exchange
     */
    static outputOidcTokenAndUsername(oidcToken) {
        // Making sure the token is treated as a secret
        core.setSecret(oidcToken);
        // Output the oidc access token as a secret
        core.setOutput('oidc-token', oidcToken);
        // Output the user from the oidc access token subject as a secret
        let payload = this.decodeOidcToken(oidcToken);
        let tokenUser = this.extractTokenUser(payload.sub);
        // Mark the user as a secret
        core.setSecret(tokenUser);
        // Output the user from the oidc access token subject extracted from the last section of the subject
        core.setOutput('oidc-user', tokenUser);
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
        // Set JF_PROJECT as JFROG_CLI_BUILD_PROJECT to allow the JFrog CLI to use it as the project key
        let projectKey = process.env.JF_PROJECT;
        if (projectKey) {
            Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_PROJECT', projectKey);
        }
        // Enable Job summaries if needed
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            Utils.enableJobSummaries();
        }
    }
    /**
     * Enabling job summary is done by setting the output dir for the summaries.
     * If the output dir is not set, the CLI won't generate the summary markdown files.
     */
    static enableJobSummaries() {
        let commandSummariesOutputDir = process.env.RUNNER_TEMP;
        if (commandSummariesOutputDir) {
            Utils.exportVariableIfNotSet('JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR', commandSummariesOutputDir);
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
                // Mark the credentials as secrets to prevent them from being printed in the logs or exported to other workflows
                core.setSecret(configToken);
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
     * Therefore, the 'jf' executable is expected to be in the path also for older CLI versions.
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
     * Generates GitHub workflow Summary Markdown.
     * This function runs as part of post-workflow cleanup function,
     * collects existing section markdown files generated by the CLI,
     * and constructs a single markdown file, to be displayed in the GitHub UI.
     */
    static generateWorkflowSummaryMarkdown() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Read all sections and construct the final markdown file
                const markdownContent = yield this.readCLIMarkdownSectionsAndWrap();
                if (markdownContent.length == 0) {
                    core.debug('No job summaries sections found. Workflow summary will not be generated.');
                    return;
                }
                // Write to GitHub's job summary
                core.summary.addRaw(markdownContent, true);
                yield core.summary.write({ overwrite: true });
                // Clear files
                yield this.clearJobSummaryDir();
            }
            catch (error) {
                core.warning(`Failed to generate Workflow summary: ${error}`);
            }
        });
    }
    /**
     * Each section should prepare a file called markdown.md.
     * This function reads each section file and wraps it with a markdown header
     * @returns <string> the content of the markdown file as string, warped in a collapsable section.
     */
    static readCLIMarkdownSectionsAndWrap() {
        return __awaiter(this, void 0, void 0, function* () {
            const outputDir = Utils.getJobOutputDirectoryPath();
            let markdownContent = '';
            const sectionContents = {};
            // Read all sections.
            for (const sectionName of Utils.JOB_SUMMARY_MARKDOWN_SECTIONS_NAMES) {
                const fullPath = path.join(outputDir, sectionName, 'markdown.md');
                if ((0, fs_1.existsSync)(fullPath)) {
                    sectionContents[sectionName] = yield Utils.readSummarySection(fullPath, sectionName);
                }
            }
            // If build info was published, remove generic upload section to avoid duplications with generic modules.
            if (sectionContents[MarkdownSection.BuildInfo] != '') {
                sectionContents[MarkdownSection.Upload] = '';
            }
            // Append sections in order.
            for (const sectionName of Utils.JOB_SUMMARY_MARKDOWN_SECTIONS_NAMES) {
                markdownContent += sectionContents[sectionName] || '';
            }
            return markdownContent ? Utils.wrapContent(markdownContent) : '';
        });
    }
    static readSummarySection(fullPath, section) {
        return __awaiter(this, void 0, void 0, function* () {
            let content = '';
            try {
                content = yield fs_1.promises.readFile(fullPath, 'utf-8');
                return Utils.wrapCollapsableSection(section, content);
            }
            catch (error) {
                throw new Error('failed to read section file: ' + fullPath + ' ' + error);
            }
        });
    }
    static getMarkdownHeader() {
        let mainTitle = `![summary-header](/images/summary_header.png)` + '\n\n';
        return mainTitle + Utils.getProjectPackagesLink();
    }
    /**
     * Check if the color scheme is supported in the GitHub UI.
     * Currently, GitHub enterprise does not support the color LaTex scheme $\textcolor{}.
     * This scheme is part of the LaTeX/Mathematics scheme.
     *
     * Currently, the scheme is not supported by GitHub Enterprise version 3.13,
     * which is the latest version at the time of writing this comment.
     *
     * For more info about the scheme see:
     * https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions
     *
     * @returns <boolean> true if the color scheme is supported, false otherwise.
     */
    static isColorSchemeSupported() {
        let serverUrl = process.env.GITHUB_SERVER_URL || '';
        return serverUrl.startsWith('https://github.com');
    }
    /**
     * Gets the project packages link to be displayed in the summary
     * If the project is undefined, it will resolve to 'all' section in the UI.
     * @return <string> https://platformUrl/ui/packages?projectKey=projectKey
     */
    static getProjectPackagesLink() {
        let platformUrl = process.env.JF_URL;
        if (!platformUrl) {
            return '';
        }
        if (!platformUrl.endsWith('/')) {
            platformUrl = platformUrl + '/';
        }
        let projectKey = process.env.JF_PROJECT ? process.env.JF_PROJECT : '';
        let projectPackagesUrl = platformUrl + 'ui/packages' + '?projectKey=' + projectKey;
        return `<a href="${projectPackagesUrl}"> 🐸 View package details on the JFrog platform  </a>` + '\n\n';
    }
    static getJobOutputDirectoryPath() {
        const outputDir = process.env.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR;
        if (!outputDir) {
            throw new Error('Jobs home directory is undefined, JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR is not set.');
        }
        return path.join(outputDir, Utils.JOB_SUMMARY_DIR_NAME);
    }
    static clearJobSummaryDir() {
        return __awaiter(this, void 0, void 0, function* () {
            const outputDir = Utils.getJobOutputDirectoryPath();
            core.debug('Removing Workflow summary directory: ' + outputDir);
            yield fs_1.promises.rm(outputDir, { recursive: true });
        });
    }
    static wrapCollapsableSection(section, markdown) {
        let sectionTitle;
        switch (section) {
            case MarkdownSection.Upload:
                sectionTitle = `📁 Files uploaded to Artifactory by this workflow`;
                break;
            case MarkdownSection.BuildInfo:
                sectionTitle = `📦 Artifacts published to Artifactory by this workflow`;
                break;
            case MarkdownSection.Security:
                sectionTitle = `🔒 Security Summary`;
                break;
            default:
                throw new Error(`Failed to get unknown section: ${section}, title.`);
        }
        return `\n\n\n<details open>\n\n<summary>  ${sectionTitle} </summary><p></p> \n\n ${markdown} \n\n</details>\n\n\n`;
    }
    static wrapContent(fileContent) {
        return Utils.getMarkdownHeader() + fileContent + Utils.getMarkdownFooter();
    }
    static getMarkdownFooter() {
        return '\n\n # \n\n The above Job Summary was generated by the <a href="https://github.com/jfrog/setup-jfrog-cli/blob/master/README.md#jfrog-job-summary"> Setup JFrog CLI GitHub Action </a>';
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
// Directory name which holds markdown files for the Workflow summary
Utils.JOB_SUMMARY_DIR_NAME = 'jfrog-command-summary';
// Workflow summary section files. Order of sections in this array impacts the order in the final markdown.
Utils.JOB_SUMMARY_MARKDOWN_SECTIONS_NAMES = [
    MarkdownSection.Security,
    MarkdownSection.BuildInfo,
    MarkdownSection.Upload
];
// Inputs
// Version input
Utils.CLI_VERSION_ARG = 'version';
// Download repository input
Utils.CLI_REMOTE_ARG = 'download-repository';
// OpenID Connect audience input
Utils.OIDC_AUDIENCE_ARG = 'oidc-audience';
// OpenID Connect provider_name input
Utils.OIDC_INTEGRATION_PROVIDER_NAME = 'oidc-provider-name';
// Job Summaries feature flag
Utils.JOB_SUMMARY_DISABLE = 'disable-job-summary';
