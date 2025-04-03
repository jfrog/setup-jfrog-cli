import * as core from '@actions/core';
import { exec, ExecOptions, ExecOutput, getExecOutput } from '@actions/exec';
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import * as toolCache from '@actions/tool-cache';
import { chmodSync, existsSync, promises as fs } from 'fs';
import { OutgoingHttpHeaders } from 'http';
import { arch, platform, tmpdir } from 'os';
import * as path from 'path';
import { join } from 'path';
import { gte, lt } from 'semver';
import { Octokit } from '@octokit/core';
import { OctokitResponse } from '@octokit/types/dist-types/OctokitResponse';
import * as github from '@actions/github';
import { gzip } from 'zlib';
import { promisify } from 'util';

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
    // Placeholder CLI version to use to keep 'latest' in cache.
    public static readonly LATEST_SEMVER: string = '100.100.100';
    // The default server id name for separate env config
    public static readonly SETUP_JFROG_CLI_SERVER_ID: string = 'setup-jfrog-cli-server';
    // Environment variable to hold all configured server IDs, separated by ';'
    public static readonly JFROG_CLI_SERVER_IDS_ENV_VAR: string = 'SETUP_JFROG_CLI_SERVER_IDS';
    // Directory name which holds markdown files for the Workflow summary
    private static readonly JOB_SUMMARY_DIR_NAME: string = 'jfrog-command-summary';
    // Directory name which holds security command summary files
    private static readonly SECURITY_DIR_NAME: string = 'security';
    // Directory name which holds sarifs files for the code scanning tab
    private static readonly SARIF_REPORTS_DIR_NAME: string = 'sarif-reports';
    // JFrog CLI command summary output directory environment variable
    public static readonly JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV: string = 'JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR';
    // Minimum JFrog CLI version supported for job summary command
    private static readonly MIN_CLI_VERSION_JOB_SUMMARY: string = '2.66.0';
    // Code scanning sarif expected file extension.
    private static readonly CODE_SCANNING_FINAL_SARIF_FILE: string = 'final.sarif';

    // Inputs
    // Version input
    public static readonly CLI_VERSION_ARG: string = 'version';
    // Download repository input
    private static readonly CLI_REMOTE_ARG: string = 'download-repository';
    // OpenID Connect audience input
    public static readonly OIDC_AUDIENCE_ARG: string = 'oidc-audience';
    // OpenID Connect provider_name input
    public static readonly OIDC_INTEGRATION_PROVIDER_NAME: string = 'oidc-provider-name';
    // JFrog CLI ENV var name
    private static readonly OIDC_CLI_TOKEN_ID_ENV_VAR_NAME: string = 'JFROG_CLI_OIDC_EXCHANGE_TOKEN_ID';
    // Application Key enn var name used by the CLI
    private static readonly APPLICATION_KEY_CLI_ENV_VAR_NAME: string = 'JFROG_CLI_APPLICATION_KEY';
    // Application yaml root key
    private static readonly APPLICATION_ROOT_YML: string = 'application';
    // Application Config file key, yaml should look like:
    // application:
    //   key: <application key>
    private static readonly KEY: string = 'key';
    // Config file directory name
    private static readonly JF_CONFIG_DIR_NAME: string = '.jfrog';
    // Config file name
    private static readonly JF_CONFIG_FILE_NAME: string = 'config.yml';
    // Disable Job Summaries feature flag
    public static readonly JOB_SUMMARY_DISABLE: string = 'disable-job-summary';
    // Disable auto build info publish feature flag
    public static readonly AUTO_BUILD_PUBLISH_DISABLE: string = 'disable-auto-build-publish';
    // Custom server ID input
    private static readonly CUSTOM_SERVER_ID: string = 'custom-server-id';
    // URL for the markdown header image
    // This is hosted statically because its usage is outside the context of the JFrog setup action.
    // It cannot be linked to the repository, as GitHub serves the image from a CDN,
    // which gets blocked by the browser, resulting in an empty image.
    private static MARKDOWN_HEADER_PNG_URL: string = 'https://media.jfrog.com/wp-content/uploads/2024/09/02161430/jfrog-job-summary.svg';
    // Flag to indicate if the summary header is accessible, can be undefined if not checked yet.
    private static isSummaryHeaderAccessible: boolean | undefined = undefined;
    // Job ID query parameter key
    private static readonly JOB_ID_PARAM_KEY: string = 'job_id';
    // Run ID query parameter key
    private static readonly RUN_ID_PARAM_KEY: string = 'run_id';
    // Git repository query parameter key
    private static readonly GIT_REPO_PARAM_KEY: string = 'git_repo';
    // Source query parameter indicating the source of the request
    private static readonly SOURCE_PARAM_KEY: string = 's';
    private static readonly SOURCE_PARAM_VALUE: string = '1';
    // Metric query parameter indicating the metric type
    private static readonly METRIC_PARAM_KEY: string = 'm';
    private static readonly METRIC_PARAM_VALUE: string = '1';

    /**
     * Retrieves server credentials for accessing JFrog's server
     * by searching for existing environment variables such as JF_ACCESS_TOKEN or the combination of JF_USER and JF_PASSWORD.
     * If the 'oidc-provider-name' argument is provided, it generates an access token for the specified JFrog's server using the OpenID Connect mechanism.
     * @returns JfrogCredentials struct filled with collected credentials
     */
    public static async getJfrogCredentials(): Promise<JfrogCredentials> {
        const jfrogCredentials: JfrogCredentials = this.collectJfrogCredentialsFromEnvVars();

        if (jfrogCredentials.oidcProviderName) {
            return await this.setOidcTokenID(jfrogCredentials);
        }
        return jfrogCredentials;
    }

    /**
     * @param jfrogCredentials - The existing JFrog credentials
     * @returns The updated JfrogCredentials with the OIDC tokenID
     * @throws Error if JF_URL is not provided or if fetching the JSON web token fails
     */
    private static async setOidcTokenID(jfrogCredentials: JfrogCredentials): Promise<JfrogCredentials> {
        if (!jfrogCredentials.jfrogUrl) {
            throw new Error(`JF_URL must be provided when oidc-provider-name is specified`);
        }
        core.info('Obtaining an access token through OpenID Connect...');
        try {
            core.debug('Fetching JSON web token');
            jfrogCredentials.oidcTokenId = await core.getIDToken(jfrogCredentials.oidcAudience);
        } catch (error: any) {
            throw new Error(`Getting OpenID Connect JSON web token failed: ${error.message}`);
        }
        core.debug('Successfully obtained an access token through OpenID Connect');
        return jfrogCredentials;
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
            oidcProviderName: core.getInput(Utils.OIDC_INTEGRATION_PROVIDER_NAME),
            oidcAudience: core.getInput(Utils.OIDC_AUDIENCE_ARG),
            oidcTokenId: '',
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

    public static async getAndAddCliToPath(jfrogCredentials: JfrogCredentials) {
        let version: string = core.getInput(Utils.CLI_VERSION_ARG);
        let cliRemote: string = core.getInput(Utils.CLI_REMOTE_ARG);
        const isLatestVer: boolean = version === Utils.LATEST_CLI_VERSION;

        if (!isLatestVer && lt(version, this.MIN_CLI_VERSION)) {
            throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
        }
        if (!isLatestVer && this.loadFromCache(version)) {
            core.info('Found JFrog CLI in cache. No need to download');
            return;
        }
        // Download JFrog CLI
        let downloadDetails: DownloadDetails = Utils.extractDownloadDetails(cliRemote, jfrogCredentials);
        let url: string = Utils.getCliUrl(version, Utils.getJFrogExecutableName(), downloadDetails);
        core.info('Downloading JFrog CLI from ' + url);
        let downloadedExecutable: string = await toolCache.downloadTool(url, undefined, downloadDetails.auth);

        // Cache 'jf' and 'jfrog' executables
        await this.cacheAndAddPath(downloadedExecutable, version);
    }

    /**
     * Try to load the JFrog CLI executables from cache.
     *
     * @param version       - JFrog CLI version
     * @returns true if the CLI executable was loaded from cache and added to path
     */
    public static loadFromCache(version: string): boolean {
        const jfFileName: string = Utils.getJfExecutableName();
        const jfrogFileName: string = Utils.getJFrogExecutableName();
        if (version === Utils.LATEST_CLI_VERSION) {
            // If the version is 'latest', we keep it on cache as 100.100.100
            version = Utils.LATEST_SEMVER;
        }
        const jfExecDir: string = toolCache.find(jfFileName, version);
        const jfrogExecDir: string = toolCache.find(jfrogFileName, version);
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
    private static async cacheAndAddPath(downloadedExecutable: string, version: string) {
        if (version === Utils.LATEST_CLI_VERSION) {
            // If the version is 'latest', we keep it on cache as 100.100.100 as GitHub actions cache supports only semver versions
            version = Utils.LATEST_SEMVER;
        }
        const jfFileName: string = Utils.getJfExecutableName();
        const jfrogFileName: string = Utils.getJFrogExecutableName();
        let jfCacheDir: string = await toolCache.cacheFile(downloadedExecutable, jfFileName, jfFileName, version);
        core.addPath(jfCacheDir);

        let jfrogCacheDir: string = await toolCache.cacheFile(downloadedExecutable, jfrogFileName, jfrogFileName, version);
        core.addPath(jfrogCacheDir);

        if (!Utils.isWindows()) {
            chmodSync(join(jfCacheDir, jfFileName), 0o555);
            chmodSync(join(jfrogCacheDir, jfrogFileName), 0o555);
        }
    }

    /**
     * Get the JFrog CLI download URL.
     * @param version - Requested version
     * @param fileName - Executable file name
     * @param downloadDetails - Source Artifactory details
     */
    public static getCliUrl(version: string, fileName: string, downloadDetails: DownloadDetails): string {
        const architecture: string = 'jfrog-cli-' + Utils.getArchitecture();
        const artifactoryUrl: string = downloadDetails.artifactoryUrl.replace(/\/$/, '');
        let major: string;
        if (version === Utils.LATEST_CLI_VERSION) {
            version = Utils.LATEST_RELEASE_VERSION;
            major = '2';
        } else {
            major = version.split('.')[0];
        }
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
         * @name oidcProviderName - OpenID Connect provider name defined in the JFrog Platform
         * @name oidcAudience - JFrog Platform OpenID Connect audience
         */
        let url: string | undefined = jfrogCredentials.jfrogUrl;
        let user: string | undefined = jfrogCredentials.username;
        let password: string | undefined = jfrogCredentials.password;
        let accessToken: string | undefined = jfrogCredentials.accessToken;
        let oidcProviderName: string | undefined = jfrogCredentials.oidcProviderName;
        let oidcTokenId: string | undefined = jfrogCredentials.oidcTokenId;

        if (url) {
            let configCmd: string[] = [Utils.getServerIdForConfig(), '--url', url, '--interactive=false', '--overwrite=true'];
            switch (true) {
                case !!oidcProviderName:
                    configCmd.push(`--oidc-provider-name=${oidcProviderName}`);
                    configCmd.push('--oidc-provider-type=Github');
                    configCmd.push(`--oidc-token-id=${oidcTokenId}`);
                    configCmd.push('--oidc-audience=jfrog-github');
                    break;
                case !!accessToken:
                    configCmd.push('--access-token', accessToken);
                    break;
                case !!user && !!password:
                    configCmd.push('--user', user, '--password', password);
                    break;
            }
            return configCmd;
        }
    }

    /**
     * Get server ID for JFrog CLI configuration. Save the server ID in the servers env var if it doesn't already exist.
     */
    private static getServerIdForConfig(): string {
        let serverId: string = Utils.getCustomOrDefaultServerId();

        // Add new serverId to the servers env var if it doesn't already exist.
        if (Utils.getConfiguredJFrogServers().includes(serverId)) {
            return serverId;
        }
        const currentValue: string | undefined = process.env[Utils.JFROG_CLI_SERVER_IDS_ENV_VAR];
        const newVal: string = currentValue ? `${currentValue};${serverId}` : serverId;
        core.exportVariable(Utils.JFROG_CLI_SERVER_IDS_ENV_VAR, newVal);
        return serverId;
    }

    /**
     * Returns the custom server ID if provided, otherwise returns the default server ID.
     */
    private static getCustomOrDefaultServerId(): string {
        const customServerId: string | undefined = this.getInputtedCustomId();
        return customServerId || this.getRunDefaultServerId();
    }

    private static getInputtedCustomId(): string | undefined {
        let customServerId: string = core.getInput(Utils.CUSTOM_SERVER_ID);
        if (customServerId) {
            return customServerId;
        }
        return undefined;
    }

    /**
     * Return the default server ID for JFrog CLI server configuration.
     */
    static getRunDefaultServerId(): string {
        return Utils.SETUP_JFROG_CLI_SERVER_ID;
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

        // Enable job summaries if disable was not requested.
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            Utils.enableJobSummaries();
        }

        // Sets JobID & RunID as env vars to be consumed by the CLI.
        let ciJobID: string | undefined = process.env.GITHUB_WORKFLOW;
        if (ciJobID) {
            Utils.exportVariableIfNotSet('JFROG_CLI_CI_JOB_ID', ciJobID);
        }
        let ciRunID: string | undefined = process.env.GITHUB_RUN_ID;
        if (ciRunID) {
            Utils.exportVariableIfNotSet('JFROG_CLI_CI_RUN_ID', ciRunID);
        }

        // Set the GitHub repository name or default to an empty string.
        core.exportVariable('JFROG_CLI_SOURCECODE_REPOSITORY', process.env.GITHUB_REPOSITORY ?? '');

        // Set usage variables to be captured by JFrog CLI visibility metric service.
        // Indicate if JF_GIT_TOKEN is provided as an environment variable.
        core.exportVariable('JFROG_CLI_USAGE_GH_TOKEN_FOR_CODE_SCANNING_ALERTS_PROVIDED', !!process.env.JF_GIT_TOKEN);
    }

    /**
     * Enabling job summary is done by setting the output dir for the summaries.
     * If the output dir is not set, the CLI won't generate the summary Markdown files.
     */
    private static enableJobSummaries() {
        let tempDir: string = this.getTempDirectory();
        Utils.exportVariableIfNotSet(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, tempDir);
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

    /**
     * Removes configured JFrog CLI servers saved in the environment variable.
     * If a custom server ID is defined, only remove the custom server ID.
     */
    public static async removeJFrogServers() {
        const customServerId: string | undefined = this.getInputtedCustomId();
        core.info(`The value of custom is: '${customServerId}'`);

        if (customServerId) {
            // Remove only the custom server ID
            core.debug(`Removing custom server ID: '${customServerId}'...`);
            await Utils.runCli(['c', 'rm', customServerId, '--quiet']);
        } else {
            // Remove all configured server IDs
            for (const serverId of Utils.getConfiguredJFrogServers()) {
                core.debug(`Removing server ID: '${serverId}'...`);
                await Utils.runCli(['c', 'rm', serverId, '--quiet']);
            }
            core.exportVariable(Utils.JFROG_CLI_SERVER_IDS_ENV_VAR, '');
        }
    }

    /**
     * Split and return the configured JFrog CLI servers that are saved in the servers env var.
     */
    public static getConfiguredJFrogServers(): string[] {
        const serversValue: string | undefined = process.env[Utils.JFROG_CLI_SERVER_IDS_ENV_VAR];
        if (!serversValue) {
            return [];
        }
        return serversValue.split(';');
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
        let res: number = await exec('jf', args, { ...options, ignoreReturnCode: true });
        if (res !== core.ExitCode.Success) {
            throw new Error('JFrog CLI exited with exit code: ' + res);
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
        let output: ExecOutput;
        output = await getExecOutput('jf', args, { ...options, ignoreReturnCode: true });
        if (output.exitCode !== core.ExitCode.Success) {
            if (options?.silent) {
                core.info(output.stdout);
                core.info(output.stderr);
            }
            throw new Error(`JFrog CLI exited with exit code ${output.exitCode}`);
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

    public static isJobSummarySupported(): boolean {
        const version: string = core.getInput(Utils.CLI_VERSION_ARG);
        return version === Utils.LATEST_CLI_VERSION || gte(version, Utils.MIN_CLI_VERSION_JOB_SUMMARY);
    }

    /**
     * Generates GitHub workflow unified Summary report.
     * This function runs as part of post-workflow cleanup function,
     * collects existing section markdown files generated by the CLI,
     * and constructs a single Markdown file, to be displayed in the GitHub UI.
     */
    public static async setMarkdownAsJobSummary() {
        try {
            // Read all sections and construct the final Markdown file
            const markdownContent: string = await this.readCommandSummaryMarkdown();
            if (markdownContent.length == 0) {
                core.debug('No job summary file found. Workflow summary will not be generated.');
                return;
            }
            // Write to GitHub's job summary
            core.summary.addRaw(markdownContent, true);
            await core.summary.write({ overwrite: true });
        } catch (error) {
            core.warning(`Failed to generate Workflow summary: ${error}`);
        }
    }

    /**
     * Populates the code scanning SARIF (if generated by scan commands) to the code scanning tab in GitHub.
     */
    public static async populateCodeScanningTab() {
        try {
            const encodedSarif: string = await this.getCodeScanningEncodedSarif();
            if (!encodedSarif) {
                return;
            }

            const token: string | undefined = process.env.JF_GIT_TOKEN;
            if (!token) {
                console.info('No token provided for uploading code scanning sarif files.');
                return;
            }

            await this.uploadCodeScanningSarif(encodedSarif, token);
        } catch (error) {
            core.warning(`Failed populating code scanning sarif: ${error}`);
        }
    }

    /**
     * Uploads the code scanning SARIF content to the code-scanning GitHub API.
     * @param encodedSarif - The final compressed and encoded sarif content.
     * @param token - GitHub token to use for the request. Has to have 'security-events: write' permission.
     * @private
     */
    private static async uploadCodeScanningSarif(encodedSarif: string, token: string) {
        const octokit: Octokit = new Octokit({ auth: token });
        let response: OctokitResponse<any> | undefined;
        response = await octokit.request('POST /repos/{owner}/{repo}/code-scanning/sarifs', {
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
    }

    /**
     * Compresses the input sarif content using gzip and encodes it to base64. This is required by the code-scanning/sarif API.
     * @param input - The sarif content to compress and encode.
     * @returns The compressed and encoded string.
     * @private
     */
    private static async compressAndEncodeSarif(input: string): Promise<string> {
        try {
            const compressed: Buffer = await promisify(gzip)(input);
            return compressed.toString('base64');
        } catch (error) {
            throw new Error('Compression of sarif file failed: ' + error);
        }
    }

    /**
     * Each section should prepare a file called markdown.md.
     * This function reads each section file and wraps it with a markdown header
     * @returns <string> the content of the markdown file as string, warped in a collapsable section.
     */
    private static async readCommandSummaryMarkdown(): Promise<string> {
        let markdownContent: string = await Utils.readMarkdownContent();
        if (markdownContent === '') {
            return '';
        }
        // Check if the header can be accessed via the internet to decide if to use the image or the text header
        this.isSummaryHeaderAccessible = await this.isHeaderPngAccessible();
        core.debug('Header image is accessible: ' + this.isSummaryHeaderAccessible);
        return Utils.wrapContent(markdownContent);
    }

    /**
     * Reads the combined SARIF file, compresses and encodes it to match the code-scanning/sarif API requirements.
     * @returns <string[]> the paths of the code scanning sarif files.
     */
    private static async getCodeScanningEncodedSarif(): Promise<string> {
        const finalSarifFile: string = path.join(
            Utils.getJobOutputDirectoryPath(),
            this.SECURITY_DIR_NAME,
            this.SARIF_REPORTS_DIR_NAME,
            this.CODE_SCANNING_FINAL_SARIF_FILE,
        );
        if (!existsSync(finalSarifFile)) {
            console.debug('No code scanning sarif file was found.');
            return '';
        }

        // Read the SARIF file, compress and encode it to match the code-scanning/sarif API requirements.
        const sarif: string = await fs.readFile(finalSarifFile, 'utf-8');
        return await this.compressAndEncodeSarif(sarif);
    }

    private static async readMarkdownContent() {
        const markdownFilePath: string = path.join(Utils.getJobOutputDirectoryPath(), 'markdown.md');
        if (existsSync(markdownFilePath)) {
            return await fs.readFile(markdownFilePath, 'utf-8');
        }
        core.debug(`No job summary file found. at ${markdownFilePath}.`);
        return '';
    }

    private static getMarkdownHeader(): string {
        let mainTitle: string;
        if (this.isSummaryHeaderAccessible) {
            let platformUrl: string = Utils.getPlatformUrl();
            mainTitle = `[![JFrog Job Summary Header](${this.MARKDOWN_HEADER_PNG_URL})](${platformUrl})` + '\n\n';
        } else {
            mainTitle = `# 🐸 JFrog Job Summary` + '\n\n';
        }
        return mainTitle + Utils.getProjectPackagesLink();
    }

    /**
     * Gets the project packages link to be displayed in the summary
     * If the project is undefined, it will resolve to 'all' section in the UI.
     * @return <string> https://platformUrl/ui/packages?projectKey=projectKey
     */
    private static getProjectPackagesLink(): string {
        let platformUrl: string = this.getPlatformUrl();
        if (!platformUrl) {
            return '';
        }
        let projectKey: string = process.env.JF_PROJECT ? process.env.JF_PROJECT : '';
        let projectPackagesUrl: string = platformUrl + 'ui/packages';
        if (projectKey) {
            projectPackagesUrl += '?projectKey=' + projectKey;
        }
        return `<a href="${projectPackagesUrl}"> 🐸 View package details on the JFrog platform  </a>` + '\n\n';
    }

    private static getPlatformUrl(): string {
        let platformUrl: string | undefined = process.env.JF_URL;
        if (!platformUrl) {
            return '';
        }
        if (!platformUrl.endsWith('/')) {
            platformUrl = platformUrl + '/';
        }
        return platformUrl;
    }

    private static getJobOutputDirectoryPath(): string {
        const outputDir: string | undefined = process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
        if (!outputDir) {
            throw new Error('Jobs home directory is undefined, ' + Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV + ' is not set.');
        }
        return path.join(outputDir, Utils.JOB_SUMMARY_DIR_NAME);
    }

    public static async clearCommandSummaryDir() {
        const outputDir: string = Utils.getJobOutputDirectoryPath();
        core.debug('Removing command summary directory: ' + outputDir);
        await fs.rm(outputDir, { recursive: true });
    }

    private static wrapContent(fileContent: string) {
        return Utils.getMarkdownHeader() + fileContent + Utils.getMarkdownFooter();
    }

    private static getMarkdownFooter() {
        return `${this.getUsageBadge()} \n\n # \n\n The above Job Summary was generated by the <a href="https://github.com/marketplace/actions/setup-jfrog-cli"> Setup JFrog CLI GitHub Action </a>`;
    }

    static getUsageBadge(): string {
        const platformUrl: string = Utils.getPlatformUrl();
        const githubJobId: string = this.getGithubJobId();
        const gitRepo: string = process.env.GITHUB_REPOSITORY || '';
        const runId: string = process.env.GITHUB_RUN_ID || '';
        const url: URL = new URL(`${platformUrl}ui/api/v1/u`);

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
    private static async isHeaderPngAccessible(): Promise<boolean> {
        if (this.isSummaryHeaderAccessible != undefined) {
            return this.isSummaryHeaderAccessible;
        }
        const url: string = this.MARKDOWN_HEADER_PNG_URL;
        const httpClient: HttpClient = new HttpClient();
        try {
            // Set timeout to 5 seconds
            const requestOptions: OutgoingHttpHeaders = {
                socketTimeout: 5000,
            };
            const response: HttpClientResponse = await httpClient.head(url, requestOptions);
            this.isSummaryHeaderAccessible = response.message.statusCode === 200;
        } catch (error) {
            core.warning('No internet access to the header image, using the text header instead.');
            this.isSummaryHeaderAccessible = false;
        } finally {
            httpClient.dispose();
        }
        return this.isSummaryHeaderAccessible;
    }

    private static getTempDirectory(): string {
        // Determine the temporary directory path, prioritizing RUNNER_TEMP
        // Runner_Temp is set on GitHub machines, but on self-hosted it could be unset.
        const tempDir: string = process.env.RUNNER_TEMP || tmpdir();
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
    static getGithubJobId(): string {
        return process.env.GITHUB_WORKFLOW || '';
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
    oidcProviderName: string | undefined;
    oidcAudience: string | undefined;
    oidcTokenId: string | undefined;
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
