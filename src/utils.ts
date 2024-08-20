import * as core from '@actions/core';
import { exec, ExecOptions, ExecOutput, getExecOutput } from '@actions/exec';
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import * as toolCache from '@actions/tool-cache';
import { chmodSync, existsSync, promises as fs } from 'fs';
import { OutgoingHttpHeaders } from 'http';
import { arch, platform } from 'os';
import * as path from 'path';
import { join } from 'path';
import { lt } from 'semver';

export enum MarkdownSection {
    Upload = 'upload',
    BuildInfo = 'build-info',
    Security = 'security',
}

export class Utils {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    public static readonly USER_AGENT: string = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
    // Default artifactory URL and repository for downloading JFrog CLI
    public static readonly DEFAULT_DOWNLOAD_DETAILS: DownloadDetails = {
        artifactoryUrl: 'https://releases.jfrog.io/artifactory',
        repository: 'jfrog-cli',
    } as DownloadDetails;

    // The JF_ENV_* prefix for Config Tokens
    private static readonly CONFIG_TOKEN_PREFIX: RegExp = /^JF_ENV_.*$/;
    // Minimum JFrog CLI version supported
    private static readonly MIN_CLI_VERSION: string = '1.46.4';
    // The value in "version" argument to set to get the latest JFrog CLI version
    private static readonly LATEST_CLI_VERSION: string = 'latest';
    // The value in the download URL to set to get the latest version
    private static readonly LATEST_RELEASE_VERSION: string = '[RELEASE]';
    // State name for saving JF CLI path to use on cleanup
    public static readonly JF_CLI_PATH_STATE: string = 'JF_CLI_PATH_STATE';
    // The default server id name for separate env config
    public static readonly SETUP_JFROG_CLI_SERVER_ID: string = 'setup-jfrog-cli-server';
    // Directory name which holds markdown files for the Workflow summary
    private static readonly JOB_SUMMARY_DIR_NAME: string = 'jfrog-command-summary';
    // JFrog CLI command summary output directory environment variable
    public static readonly JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV: string = 'JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR';

    // Workflow summary section files. Order of sections in this array impacts the order in the final markdown.
    public static JOB_SUMMARY_MARKDOWN_SECTIONS_NAMES: MarkdownSection[] = [
        MarkdownSection.Security,
        MarkdownSection.BuildInfo,
        MarkdownSection.Upload,
    ];

    // Inputs
    // Version input
    private static readonly CLI_VERSION_ARG: string = 'version';
    // Download repository input
    private static readonly CLI_REMOTE_ARG: string = 'download-repository';
    // OpenID Connect audience input
    private static readonly OIDC_AUDIENCE_ARG: string = 'oidc-audience';
    // OpenID Connect provider_name input
    private static readonly OIDC_INTEGRATION_PROVIDER_NAME: string = 'oidc-provider-name';
    // Disable Job Summaries feature flag
    public static readonly JOB_SUMMARY_DISABLE: string = 'disable-job-summary';
    // Disable auto build info publish feature flag
    public static readonly AUTO_BUILD_PUBLISH_DISABLE: string = 'disable-auto-build-publish';

    /**
     * Retrieves server credentials for accessing JFrog's server
     * searching for existing environment variables such as JF_ACCESS_TOKEN or the combination of JF_USER and JF_PASSWORD.
     * If the 'oidc-provider-name' argument was provided, it generates an access token for the specified JFrog's server using the OpenID Connect mechanism.
     * @returns JfrogCredentials struct filled with collected credentials
     */
    public static async getJfrogCredentials(): Promise<JfrogCredentials> {
        let jfrogCredentials: JfrogCredentials = this.collectJfrogCredentialsFromEnvVars();
        const oidcProviderName: string = core.getInput(Utils.OIDC_INTEGRATION_PROVIDER_NAME);
        if (!oidcProviderName) {
            // Use JF_ENV or the credentials found in the environment variables
            return jfrogCredentials;
        }

        if (!jfrogCredentials.jfrogUrl) {
            throw new Error(`JF_URL must be provided when oidc-provider-name is specified`);
        }
        core.info('Obtaining an access token through OpenID Connect...');
        const audience: string = core.getInput(Utils.OIDC_AUDIENCE_ARG);
        let jsonWebToken: string | undefined;
        try {
            core.debug('Fetching JSON web token');
            jsonWebToken = await core.getIDToken(audience);
        } catch (error: any) {
            throw new Error(`Getting openID Connect JSON web token failed: ${error.message}`);
        }

        try {
            return await this.getJfrogAccessTokenThroughOidcProtocol(jfrogCredentials, jsonWebToken, oidcProviderName);
        } catch (error: any) {
            throw new Error(`Exchanging JSON web token with an access token failed: ${error.message}`);
        }
    }

    /**
     * Gathers JFrog's credentials from environment variables and delivers them in a JfrogCredentials structure
     * @returns JfrogCredentials struct with all credentials found in environment variables
     * @throws Error if a password provided without a username
     */
    public static collectJfrogCredentialsFromEnvVars(): JfrogCredentials {
        let jfrogCredentials: JfrogCredentials = {
            jfrogUrl: process.env.JF_URL,
            accessToken: process.env.JF_ACCESS_TOKEN,
            username: process.env.JF_USER,
            password: process.env.JF_PASSWORD,
        } as JfrogCredentials;

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
    private static async getJfrogAccessTokenThroughOidcProtocol(
        jfrogCredentials: JfrogCredentials,
        jsonWebToken: string,
        oidcProviderName: string,
    ): Promise<JfrogCredentials> {
        // If we've reached this stage, the jfrogCredentials.jfrogUrl field should hold a non-empty value obtained from process.env.JF_URL
        const exchangeUrl: string = jfrogCredentials.jfrogUrl!.replace(/\/$/, '') + '/access/api/v1/oidc/token';
        core.debug('Exchanging GitHub JSON web token with a JFrog access token...');

        let projectKey: string = process.env.JF_PROJECT || '';

        const httpClient: HttpClient = new HttpClient();
        const data: string = `{
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
            "subject_token": "${jsonWebToken}",
            "provider_name": "${oidcProviderName}",
            "project_key": "${projectKey}"
        }`;

        const additionalHeaders: OutgoingHttpHeaders = {
            'Content-Type': 'application/json',
        };

        const response: HttpClientResponse = await httpClient.post(exchangeUrl, data, additionalHeaders);
        const responseString: string = await response.readBody();
        const responseJson: TokenExchangeResponseData = JSON.parse(responseString);
        jfrogCredentials.accessToken = responseJson.access_token;
        if (jfrogCredentials.accessToken) {
            this.outputOidcTokenAndUsername(jfrogCredentials.accessToken);
        }
        if (responseJson.errors) {
            throw new Error(`${JSON.stringify(responseJson.errors)}`);
        }
        return jfrogCredentials;
    }

    /**
     * Output the OIDC access token as a secret and the user from the OIDC access token subject as a secret.
     * Both are set as secrets to prevent them from being printed in the logs or exported to other workflows.
     * @param oidcToken access token received from the JFrog platform during OIDC token exchange
     */
    private static outputOidcTokenAndUsername(oidcToken: string): void {
        // Making sure the token is treated as a secret
        core.setSecret(oidcToken);
        // Output the oidc access token as a secret
        core.setOutput('oidc-token', oidcToken);

        // Output the user from the oidc access token subject as a secret
        let payload: JWTTokenData = this.decodeOidcToken(oidcToken);
        let tokenUser: string = this.extractTokenUser(payload.sub);
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
    public static extractTokenUser(subject: string): string {
        // Main OIDC user parsing logic
        if (subject.startsWith('jfrt@') || subject.includes('/users/')) {
            let lastSlashIndex: number = subject.lastIndexOf('/');
            let userSubstring: string = subject.substring(lastSlashIndex + 1);
            // Return the user extracted from the token
            return userSubstring;
        }
        // No parsing was needed, returning original sub from the token as the user
        return subject;
    }

    /**
     * Decode the OIDC access token and return the payload.
     * @param oidcToken access token received from the JFrog platform during OIDC token exchange
     * @returns the payload of the OIDC access token
     */
    public static decodeOidcToken(oidcToken: string): JWTTokenData {
        // Split jfrogCredentials.accessToken into 3 parts divided by .
        let tokenParts: string[] = oidcToken.split('.');
        if (tokenParts.length != 3) {
            // this error should not happen since access only generates valid JWT tokens
            throw new Error(`OIDC invalid access token format`);
        }
        // Decode the second part of the token
        let base64Payload: string = tokenParts[1];
        let utf8Payload: string = Buffer.from(base64Payload, 'base64').toString('utf8');
        let payload: JWTTokenData = JSON.parse(utf8Payload);
        if (!payload || !payload.sub) {
            throw new Error(`OIDC invalid access token format`);
        }
        return payload;
    }

    public static async getAndAddCliToPath(jfrogCredentials: JfrogCredentials) {
        let version: string = core.getInput(Utils.CLI_VERSION_ARG);
        let cliRemote: string = core.getInput(Utils.CLI_REMOTE_ARG);
        let major: string = version.split('.')[0];
        if (version === Utils.LATEST_CLI_VERSION) {
            version = Utils.LATEST_RELEASE_VERSION;
            major = '2';
        } else if (lt(version, this.MIN_CLI_VERSION)) {
            throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
        }

        let jfFileName: string = Utils.getJfExecutableName();
        let jfrogFileName: string = Utils.getJFrogExecutableName();
        if (this.loadFromCache(jfFileName, jfrogFileName, version)) {
            // Download is not needed
            return;
        }

        // Download JFrog CLI
        let downloadDetails: DownloadDetails = Utils.extractDownloadDetails(cliRemote, jfrogCredentials);
        let url: string = Utils.getCliUrl(major, version, jfrogFileName, downloadDetails);
        core.info('Downloading JFrog CLI from ' + url);
        let downloadedExecutable: string = await toolCache.downloadTool(url, undefined, downloadDetails.auth);

        // Cache 'jf' and 'jfrog' executables
        await this.cacheAndAddPath(downloadedExecutable, version, jfFileName, jfrogFileName);
    }

    /**
     * Try to load the JFrog CLI executables from cache.
     *
     * @param jfFileName    - 'jf' or 'jf.exe'
     * @param jfrogFileName - 'jfrog' or 'jfrog.exe'
     * @param version       - JFrog CLI version
     * @returns true if the CLI executable was loaded from cache and added to path
     */
    private static loadFromCache(jfFileName: string, jfrogFileName: string, version: string): boolean {
        if (version === Utils.LATEST_RELEASE_VERSION) {
            return false;
        }
        let jfExecDir: string = toolCache.find(jfFileName, version);
        let jfrogExecDir: string = toolCache.find(jfrogFileName, version);
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
     * @param jfFileName           - 'jf' or 'jf.exe'
     * @param jfrogFileName        - 'jfrog' or 'jfrog.exe'
     */
    private static async cacheAndAddPath(downloadedExecutable: string, version: string, jfFileName: string, jfrogFileName: string) {
        let jfCacheDir: string = await toolCache.cacheFile(downloadedExecutable, jfFileName, jfFileName, version);
        core.addPath(jfCacheDir);

        let jfrogCacheDir: string = await toolCache.cacheFile(downloadedExecutable, jfrogFileName, jfrogFileName, version);
        core.addPath(jfrogCacheDir);

        if (!Utils.isWindows()) {
            chmodSync(join(jfCacheDir, jfFileName), 0o555);
            chmodSync(join(jfrogCacheDir, jfrogFileName), 0o555);
        }

        // Save the JF CLI path to use on cleanup. saveState/getState are methods to pass data between a step, and it's cleanup function.
        core.saveState(Utils.JF_CLI_PATH_STATE, jfCacheDir);
    }

    public static getCliUrl(major: string, version: string, fileName: string, downloadDetails: DownloadDetails): string {
        let architecture: string = 'jfrog-cli-' + Utils.getArchitecture();
        let artifactoryUrl: string = downloadDetails.artifactoryUrl.replace(/\/$/, '');
        return `${artifactoryUrl}/${downloadDetails.repository}/v${major}/${version}/${architecture}/${fileName}`;
    }
    // Get Config Tokens created on your local machine using JFrog CLI.
    // The Tokens configured with JF_ENV_ environment variables.
    public static getConfigTokens(): Set<string> {
        return new Set(
            Object.keys(process.env)
                .filter((envKey) => envKey.match(Utils.CONFIG_TOKEN_PREFIX))
                .filter((envKey) => process.env[envKey])
                .map((envKey) => process.env[envKey]?.trim() || ''),
        );
    }

    /**
     * Get separate env config for the URL and connection details and return args to add to the config add command
     * @param jfrogCredentials existing JFrog credentials - url, access token, username + password
     */
    public static getSeparateEnvConfigArgs(jfrogCredentials: JfrogCredentials): string[] | undefined {
        /**
         * @name url - JFrog Platform URL
         * @name user&password - JFrog Platform basic authentication
         * @name accessToken - Jfrog Platform access token
         */
        let url: string | undefined = jfrogCredentials.jfrogUrl;
        let user: string | undefined = jfrogCredentials.username;
        let password: string | undefined = jfrogCredentials.password;
        let accessToken: string | undefined = jfrogCredentials.accessToken;

        if (url) {
            let configCmd: string[] = [Utils.SETUP_JFROG_CLI_SERVER_ID, '--url', url, '--interactive=false', '--overwrite=true'];
            if (accessToken) {
                configCmd.push('--access-token', accessToken);
            } else if (user && password) {
                configCmd.push('--user', user, '--password', password);
            }
            return configCmd;
        }
    }

    public static setCliEnv() {
        Utils.exportVariableIfNotSet(
            'JFROG_CLI_ENV_EXCLUDE',
            '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*;JF_URL;JF_USER;JF_PASSWORD;JF_ACCESS_TOKEN',
        );
        Utils.exportVariableIfNotSet('JFROG_CLI_OFFER_CONFIG', 'false');
        Utils.exportVariableIfNotSet('CI', 'true');
        let buildNameEnv: string | undefined = process.env.GITHUB_WORKFLOW;
        if (buildNameEnv) {
            Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_NAME', buildNameEnv);
        }
        let buildNumberEnv: string | undefined = process.env.GITHUB_RUN_NUMBER;
        if (buildNumberEnv) {
            Utils.exportVariableIfNotSet('JFROG_CLI_BUILD_NUMBER', buildNumberEnv);
        }
        Utils.exportVariableIfNotSet(
            'JFROG_CLI_BUILD_URL',
            process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID,
        );
        Utils.exportVariableIfNotSet('JFROG_CLI_USER_AGENT', Utils.USER_AGENT);

        // Set JF_PROJECT as JFROG_CLI_BUILD_PROJECT to allow the JFrog CLI to use it as the project key
        let projectKey: string | undefined = process.env.JF_PROJECT;
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
    private static enableJobSummaries() {
        let commandSummariesOutputDir: string | undefined = process.env.RUNNER_TEMP;
        if (commandSummariesOutputDir) {
            Utils.exportVariableIfNotSet(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, commandSummariesOutputDir);
        }
    }

    private static exportVariableIfNotSet(key: string, value: string) {
        if (!process.env[key]) {
            core.exportVariable(key, value);
        }
    }

    public static async configJFrogServers(jfrogCredentials: JfrogCredentials) {
        let cliConfigCmd: string[] = ['config'];
        for (let configToken of Utils.getConfigTokens()) {
            // Mark the credentials as secrets to prevent them from being printed in the logs or exported to other workflows
            core.setSecret(configToken);
            await Utils.runCli(cliConfigCmd.concat('import', configToken));
        }

        let configArgs: string[] | undefined = Utils.getSeparateEnvConfigArgs(jfrogCredentials);
        if (configArgs) {
            await Utils.runCli(cliConfigCmd.concat('add', ...configArgs));
        }
    }

    public static async removeJFrogServers() {
        await Utils.runCli(['c', 'rm', '--quiet']);
    }

    public static getArchitecture() {
        if (Utils.isWindows()) {
            return 'windows-amd64';
        }
        if (platform().includes('darwin')) {
            return arch() === 'arm64' ? 'mac-arm64' : 'mac-386';
        }
        if (arch().includes('arm')) {
            return arch().includes('64') ? 'linux-arm64' : 'linux-arm';
        }
        return arch().includes('64') ? 'linux-amd64' : 'linux-386';
    }

    public static getJfExecutableName() {
        return Utils.isWindows() ? 'jf.exe' : 'jf';
    }

    public static getJFrogExecutableName() {
        return Utils.isWindows() ? 'jfrog.exe' : 'jfrog';
    }

    public static isWindows() {
        return platform().startsWith('win');
    }

    /**
     * Execute JFrog CLI command.
     * This GitHub Action downloads the requested 'jfrog' executable and stores it as 'jfrog' and 'jf'.
     * Therefore, the 'jf' executable is expected to be in the path also for older CLI versions.
     * @param args - CLI arguments
     * @param options - Execution options
     */
    public static async runCli(args: string[], options?: ExecOptions) {
        let res: number = await exec('jf', args, options);
        if (res !== core.ExitCode.Success) {
            throw new Error('JFrog CLI exited with exit code ' + res);
        }
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
    public static async runCliAndGetOutput(args: string[], options?: ExecOptions): Promise<string> {
        let output: ExecOutput = await getExecOutput('jf', args, options);
        if (output.exitCode !== core.ExitCode.Success) {
            core.info(output.stdout);
            core.info(output.stderr);
            throw new Error('JFrog CLI exited with exit code ' + output.exitCode);
        }
        return output.stdout;
    }

    /**
     * If repository input was set, extract CLI download details,
     * from either a Config Token with a JF_ENV_ prefix or separate env config (JF_URL, JF_USER, JF_PASSWORD, JF_ACCESS_TOKEN).
     * @param repository - Remote repository in Artifactory pointing to https://releases.jfrog.io/artifactory/jfrog-cli/. If empty, use the default download details.
     * @param jfrogCredentials All collected JFrog credentials
     * @returns the download details.
     */
    public static extractDownloadDetails(repository: string, jfrogCredentials: JfrogCredentials): DownloadDetails {
        if (repository === '') {
            return Utils.DEFAULT_DOWNLOAD_DETAILS;
        }
        let results: DownloadDetails = { repository: repository } as DownloadDetails;
        let serverObj: any = {};

        for (let configToken of Utils.getConfigTokens()) {
            serverObj = JSON.parse(Buffer.from(configToken, 'base64').toString());
            if (serverObj && serverObj.artifactoryUrl) {
                break;
            }
        }
        if (!serverObj.artifactoryUrl) {
            // No Config Tokens found, check if Separate Env config exist.
            if (!jfrogCredentials.jfrogUrl) {
                throw new Error(
                    `'download-repository' input provided, but no JFrog environment details found. ` +
                        `Hint - Ensure that the JFrog connection details environment variables are set: ` +
                        `either a Config Token with a JF_ENV_ prefix or separate env config (JF_URL, JF_USER, JF_PASSWORD, JF_ACCESS_TOKEN)`,
                );
            }
            serverObj.artifactoryUrl = jfrogCredentials.jfrogUrl.replace(/\/$/, '') + '/artifactory';
            serverObj.user = jfrogCredentials.username;
            serverObj.password = jfrogCredentials.password;
            serverObj.accessToken = jfrogCredentials.accessToken;
        }

        results.artifactoryUrl = serverObj.artifactoryUrl;
        let authString: string | undefined = Utils.generateAuthString(serverObj);
        if (authString) {
            results.auth = authString;
        }
        return results;
    }

    private static generateAuthString(serverObj: any): string | undefined {
        if (serverObj.accessToken) {
            return 'Bearer ' + Buffer.from(serverObj.accessToken).toString();
        } else if (serverObj.user && serverObj.password) {
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
    public static async generateWorkflowSummaryMarkdown() {
        try {
            // Read all sections and construct the final markdown file
            const markdownContent: string = await this.readCLIMarkdownSectionsAndWrap();
            if (markdownContent.length == 0) {
                core.debug('No job summaries sections found. Workflow summary will not be generated.');
                return;
            }
            // Write to GitHub's job summary
            core.summary.addRaw(markdownContent, true);
            await core.summary.write({ overwrite: true });
            // Clear files
            await this.clearJobSummaryDir();
        } catch (error) {
            core.warning(`Failed to generate Workflow summary: ${error}`);
        }
    }

    /**
     * Each section should prepare a file called markdown.md.
     * This function reads each section file and wraps it with a markdown header
     * @returns <string> the content of the markdown file as string, warped in a collapsable section.
     */
    private static async readCLIMarkdownSectionsAndWrap(): Promise<string> {
        const outputDir: string = Utils.getJobOutputDirectoryPath();
        let markdownContent: string = '';
        const sectionContents: { [key: string]: string } = {};

        // Read all sections.
        for (const sectionName of Utils.JOB_SUMMARY_MARKDOWN_SECTIONS_NAMES) {
            const fullPath: string = path.join(outputDir, sectionName, 'markdown.md');
            if (existsSync(fullPath)) {
                sectionContents[sectionName] = await Utils.readSummarySection(fullPath, sectionName);
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
    }

    private static async readSummarySection(fullPath: string, section: MarkdownSection) {
        let content: string = '';
        try {
            content = await fs.readFile(fullPath, 'utf-8');
            return Utils.wrapCollapsableSection(section, content);
        } catch (error) {
            throw new Error('failed to read section file: ' + fullPath + ' ' + error);
        }
    }

    private static getMarkdownHeader(): string {
        let mainTitle: string;
        if (Utils.isColorSchemeSupported()) {
            mainTitle = `# $\\textcolor{green}{\\textsf{ 🐸 JFrog Job Summary}}$` + '\n\n';
        } else {
            mainTitle = `# 🐸 JFrog Job Summary` + '\n\n';
        }
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
    static isColorSchemeSupported(): boolean {
        let serverUrl: string = process.env.GITHUB_SERVER_URL || '';
        return serverUrl.startsWith('https://github.com');
    }

    /**
     * Gets the project packages link to be displayed in the summary
     * If the project is undefined, it will resolve to 'all' section in the UI.
     * @return <string> https://platformUrl/ui/packages?projectKey=projectKey
     */
    private static getProjectPackagesLink(): string {
        let platformUrl: string | undefined = process.env.JF_URL;
        if (!platformUrl) {
            return '';
        }
        if (!platformUrl.endsWith('/')) {
            platformUrl = platformUrl + '/';
        }
        let projectKey: string = process.env.JF_PROJECT ? process.env.JF_PROJECT : '';
        let projectPackagesUrl: string = platformUrl + 'ui/packages' + '?projectKey=' + projectKey;
        return `<a href="${projectPackagesUrl}">📦 Project ${projectKey} packages </a>` + '\n\n';
    }

    private static getJobOutputDirectoryPath(): string {
        const outputDir: string | undefined = process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
        if (!outputDir) {
            throw new Error('Jobs home directory is undefined, ' + Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV + ' is not set.');
        }
        return path.join(outputDir, Utils.JOB_SUMMARY_DIR_NAME);
    }

    private static async clearJobSummaryDir() {
        const outputDir: string = Utils.getJobOutputDirectoryPath();
        core.debug('Removing Workflow summary directory: ' + outputDir);
        await fs.rm(outputDir, { recursive: true });
    }

    private static wrapCollapsableSection(section: MarkdownSection, markdown: string): string {
        let sectionTitle: string;
        switch (section) {
            case MarkdownSection.Upload:
                sectionTitle = `📁 Files uploaded to Artifactory by this workflow`;
                break;
            case MarkdownSection.BuildInfo:
                sectionTitle = `📦 Build info published to Artifactory by this workflow`;
                break;
            case MarkdownSection.Security:
                sectionTitle = `🔒 Security Status`;
                break;
            default:
                throw new Error(`Failed to get unknown section: ${section}, title.`);
        }
        return `\n\n\n<details open>\n\n<summary>  ${sectionTitle} </summary><p></p> \n\n ${markdown} \n\n</details>\n\n\n`;
    }

    private static wrapContent(fileContent: string) {
        return Utils.getMarkdownHeader() + fileContent + Utils.getMarkdownFooter();
    }

    private static getMarkdownFooter() {
        return '\n\n # \n\n The above Job Summary was generated by the <a href="https://github.com/jfrog/setup-jfrog-cli/blob/master/README.md#jfrog-job-summary"> Setup JFrog CLI GitHub Action </a>';
    }
}

export interface DownloadDetails {
    artifactoryUrl: string;
    repository: string;
    auth: string;
}

export interface JfrogCredentials {
    jfrogUrl: string | undefined;
    username: string | undefined;
    password: string | undefined;
    accessToken: string | undefined;
}

export interface TokenExchangeResponseData {
    access_token: string;
    errors: string;
}

export interface JWTTokenData {
    sub: string;
    scp: string;
    aud: string;
    iss: string;
    exp: bigint;
    iat: bigint;
    jti: string;
}
