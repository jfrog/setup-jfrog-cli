import * as core from '@actions/core';
import { exec, ExecOptions, ExecOutput, getExecOutput } from '@actions/exec';

import * as toolCache from '@actions/tool-cache';
import { chmodSync } from 'fs';

import { arch, platform } from 'os';

import { join } from 'path';
import { lt } from 'semver';

import { DownloadDetails, JfrogCredentials } from './types';
import { OidcUtils } from './oidc-utils';
import { JobSummary } from './job-summary';

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
    public static readonly LATEST_CLI_VERSION: string = 'latest';
    // The value in the download URL to set to get the latest version
    private static readonly LATEST_RELEASE_VERSION: string = '[RELEASE]';
    // Placeholder CLI version to use to keep 'latest' in cache.
    public static readonly LATEST_SEMVER: string = '100.100.100';
    // The default server id name for separate env config
    public static readonly SETUP_JFROG_CLI_SERVER_ID: string = 'setup-jfrog-cli-server';
    // Environment variable to hold all configured server IDs, separated by ';'
    public static readonly JFROG_CLI_SERVER_IDS_ENV_VAR: string = 'SETUP_JFROG_CLI_SERVER_IDS';

    // Inputs
    // Version input
    public static readonly CLI_VERSION_ARG: string = 'version';
    // Download repository input
    public static readonly CLI_REMOTE_ARG: string = 'download-repository';
    // OpenID Connect audience input
    public static readonly OIDC_AUDIENCE_ARG: string = 'oidc-audience';
    // OpenID Connect provider_name input
    public static readonly OIDC_INTEGRATION_PROVIDER_NAME: string = 'oidc-provider-name';
    // Disable Job Summaries feature flag
    public static readonly JOB_SUMMARY_DISABLE: string = 'disable-job-summary';
    // Disable auto build info publish feature flag
    public static readonly AUTO_BUILD_PUBLISH_DISABLE: string = 'disable-auto-build-publish';
    // Disable auto evidence collection feature flag
    public static readonly AUTO_EVIDENCE_COLLECTION_DISABLE: string = 'disable-auto-evidence-collection';
    // Custom server ID input
    private static readonly CUSTOM_SERVER_ID: string = 'custom-server-id';
    // GHES baseUrl support
    public static readonly GHE_BASE_URL_INPUT: string = 'ghe-base-url';
    public static readonly GHE_BASE_URL_ALIAS_INPUT: string = 'ghe_base_url';

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
            oidcAudience: core.getInput(Utils.OIDC_AUDIENCE_ARG) || '',
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

    public static getGheBaseUrl(): string {
        const v =
            core.getInput(Utils.GHE_BASE_URL_INPUT, { required: false }) || core.getInput(Utils.GHE_BASE_URL_ALIAS_INPUT, { required: false }) || '';
        return v.trim();
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
        // To download CLI from a remote repository, we first need to fetch an access token.
        // This should fall back to the 'manual' oidc exchange method.
        if (jfrogCredentials.oidcProviderName && cliRemote != '') {
            core.debug("'Fetching OIDC access token to download CLI from remote repository");
            jfrogCredentials.accessToken = await OidcUtils.exchangeOidcToken(jfrogCredentials);
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
    public static async cacheAndAddPath(downloadedExecutable: string, version: string) {
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
    public static async getJfrogCliConfigArgs(jfrogCredentials: JfrogCredentials): Promise<string[] | undefined> {
        /**
         * @name url - JFrog Platform URL
         * @name user - JFrog Platform basic authentication
         * @name password - JFrog Platform basic authentication
         * @name accessToken - Jfrog Platform access token
         * @name oidcProviderName - OpenID Connect provider name defined in the JFrog Platform
         */
        let url: string | undefined = jfrogCredentials.jfrogUrl;
        let user: string | undefined = jfrogCredentials.username;
        let password: string | undefined = jfrogCredentials.password;
        let accessToken: string | undefined = jfrogCredentials.accessToken;
        let oidcProviderName: string | undefined = jfrogCredentials.oidcProviderName;

        // Url is mandatory for JFrog CLI configuration
        if (!url) {
            return;
        }

        // Check for OIDC authentication
        if (!!oidcProviderName) {
            accessToken = await OidcUtils.exchangeOidcToken(jfrogCredentials);
        }

        const configCmd: string[] = [Utils.getServerIdForConfig(), '--url', url, '--interactive=false', '--overwrite=true'];
        if (!!accessToken) {
            // Access Token / OIDC Token
            configCmd.push('--access-token', accessToken);
        } else if (!!user && !!password) {
            // Basic Auth
            configCmd.push('--user', user, '--password', password);
        }
        return configCmd;
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
        if (core.isDebug()) {
            Utils.exportVariableIfNotSet('JFROG_CLI_LOG_LEVEL', 'DEBUG');
        }
        Utils.exportVariableIfNotSet(
            'JFROG_CLI_ENV_EXCLUDE',
            '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*;JF_URL;JF_USER;JF_PASSWORD;JF_ACCESS_TOKEN',
        );
        Utils.exportVariableIfNotSet('JFROG_CLI_OFFER_CONFIG', 'false');
        Utils.exportVariableIfNotSet('CI', 'true');
        Utils.exportVariableIfNotSet('JFROG_CLI_SOURCECODE_REPOSITORY', process.env.GITHUB_REPOSITORY ?? '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_JOB_ID', process.env.GITHUB_WORKFLOW ?? '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_RUN_ID', process.env.GITHUB_RUN_ID ?? '');
        Utils.exportVariableIfNotSet('JFROG_CLI_GITHUB_TOKEN', process.env.GITHUB_TOKEN ?? '');

        // Used for OIDC token exchange extra params
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_VCS_REVISION', process.env.GITHUB_SHA ?? '' ?? '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_BRANCH', process.env.GITHUB_REF_NAME ?? '' ?? '');
        Utils.exportVariableIfNotSet('JFROG_CLI_CI_VCS_URL', Utils.buildVcsUrl());

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
            JobSummary.enableJobSummaries();
        }

        // Indicate if JF_GIT_TOKEN is provided as an environment variable, used by Xray usage.
        Utils.exportVariableIfNotSet('JFROG_CLI_USAGE_GH_TOKEN_FOR_CODE_SCANNING_ALERTS_PROVIDED', process.env.JF_GIT_TOKEN ?? '');
    }

    public static buildVcsUrl(): string {
        const serverUrl: string | undefined = process.env.GITHUB_SERVER_URL;
        const repo: string | undefined = process.env.GITHUB_REPOSITORY;
        return serverUrl && repo ? `${serverUrl}/${repo}` : '';
    }

    public static exportVariableIfNotSet(key: string, value: string) {
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

        let configArgs: string[] | undefined = await Utils.getJfrogCliConfigArgs(jfrogCredentials);
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
        core.debug(`jf ${args.join(' ')}`);
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
}
