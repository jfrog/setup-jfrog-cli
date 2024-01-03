import * as core from '@actions/core';
import { exec } from '@actions/exec';
import * as toolCache from '@actions/tool-cache';
import { chmodSync } from 'fs';
import { platform, arch } from 'os';
import { join } from 'path';
import { lt } from 'semver';
import { HttpClient, HttpClientResponse } from '@actions/http-client'
import { OutgoingHttpHeaders } from "http";
import * as jwt_decode from "jwt-decode";


export class Utils {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    public static readonly USER_AGENT: string = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
    // Default artifactory URL and repository for downloading JFrog CLI
    public static readonly DEFAULT_DOWNLOAD_DETAILS: DownloadDetails = {
        artifactoryUrl: 'https://releases.jfrog.io/artifactory',
        repository: 'jfrog-cli',
    } as DownloadDetails;

    // The old JF_ARTIFACTORY_* prefix for Config Tokens
    private static readonly CONFIG_TOKEN_LEGACY_PREFIX: RegExp = /^JF_ARTIFACTORY_.*$/;
    // The JF_ENV_* prefix for Config Tokens
    private static readonly CONFIG_TOKEN_PREFIX: RegExp = /^JF_ENV_.*$/;
    // Since 1.45.0, 'jfrog rt c' command changed to 'jfrog c add'
    private static readonly NEW_CONFIG_CLI_VERSION: string = '1.45.0';
    // Minimum JFrog CLI version supported
    private static readonly MIN_CLI_VERSION: string = '1.29.0';
    // The value in "version" argument to set to get the latest JFrog CLI version
    private static readonly LATEST_CLI_VERSION: string = 'latest';
    // The value in the download URL to set to get the latest version
    private static readonly LATEST_RELEASE_VERSION: string = '[RELEASE]';
    // The default server id name for separate env config
    public static readonly SETUP_JFROG_CLI_SERVER_ID: string = 'setup-jfrog-cli-server';

    // Inputs
    // Version input
    private static readonly CLI_VERSION_ARG: string = 'version';
    // Download repository input
    private static readonly CLI_REMOTE_ARG: string = 'download-repository';
    // OpenID Connect audience input
    private static readonly OIDC_AUDIENCE_ARG: string = 'aud';
    //OpenID Connect provider_name input
    private static readonly OIDC_INTEGRATION_PROVIDER_NAME = 'provider_name'

    /**
     * Gets access details to allow Accessing JFrog's servers
     * Initially searches for JF_ACCESS_TOKEN or JF_USER + JF_PASSWORD in existing environment variables
     * If none of the above found, returns an access token from the addressed Jfrog's server, if request and requester are authorized, using
     * OpenID Connect mechanism
     */
    public static async getJfrogAccessToken(): Promise<string> {
        if(!process.env.JF_URL) {
            return "";
        }

        let basicUrl : string = process.env.JF_URL
        console.log("Searching for JF_ACCESS_TOKEN or JF_USER + JF_PASSWORD in exising env variables")
        if(process.env.JF_ACCESS_TOKEN || (process.env.JF_USER && process.env.JF_PASSWORD)) {
            return "";
        }
        console.log("JF_ACCESS_TOKEN and JF_USER + JF_PASSWORD weren't found. Getting access token using OpenID Connect")
        const audience: string = core.getInput(Utils.OIDC_AUDIENCE_ARG, { required: false });
        let jsonWebToken: string | undefined
        try {
            console.log("Fetching JSON web token")
            jsonWebToken = await core.getIDToken(audience); // print char 1-10 and 11-end and add them app (try to laavod on actions)
            console.log("ERAN CHECK - token part 1: " + jsonWebToken.substring(0,10))
            console.log("ERAN CHECK - token part 2: " + jsonWebToken.substring(11))
        } catch (error: any){
            throw new Error(`getting openID Connect JSON web token failed: ${error.message}`)
        }

        // todo del
        const decodedJwt2 = jwt_decode.jwtDecode(jsonWebToken)
        console.log(`ERAN CHECK: JWT 2 content: \n aud: ${decodedJwt2.aud} | sub: ${decodedJwt2.sub} | iss: ${decodedJwt2.iss}`)
        // todo up to here

        try {
            return await this.getAccessTokenFromJWT(basicUrl, jsonWebToken)
        } catch (error: any) {
            throw new Error(`Exchanging JSON web token with an access token failed: ${error.message}`)
        }
    }

    /**
     * Exchanges JWT with a valid access token
     * @param basicUrl basic Url achieved as an env var
     * @param jsonWebToken JWT achieved from GitHub JWT provider
     * @private
     */
    private static async getAccessTokenFromJWT(basicUrl: string, jsonWebToken: string): Promise<string> {
        const exchangeUrl : string = basicUrl.replace(/\/$/, '') + "/access/api/v1/oidc/token"
        console.log("Exchanging JSON web token with access token")

        const provider_name: string = core.getInput(Utils.OIDC_INTEGRATION_PROVIDER_NAME, { required: true });
        const httpClient : HttpClient = new HttpClient()
        let responseData: string

        try {
            const data: string = `{
                "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
                "subject_token": "${jsonWebToken}",
                "provider_name": "${provider_name}"
            }`;

            const additionalHeaders: OutgoingHttpHeaders = {
                'Content-Type': 'application/json',
            };


            console.log(`ERAN CHECK: starting POST`) // TODO del
            const response: HttpClientResponse = await httpClient.post(exchangeUrl, data, additionalHeaders)
            console.log(`ERAN CHECK: POST succeeded`) // TODO del
            responseData= await response.readBody()
            console.log(`ERAN CHECK: response string: ${responseData}`) // TODO del

        } catch (error : any) {
            throw new Error(`POST REST command failed with error ${error.message}`)
        }
        // TODO print the responseData content to make sure how to address the field
        return responseData
    }

    public static async getAndAddCliToPath() {
        let version: string = core.getInput(Utils.CLI_VERSION_ARG);
        let cliRemote: string = core.getInput(Utils.CLI_REMOTE_ARG);
        let major: string = version.split('.')[0];
        if (version === this.LATEST_CLI_VERSION) {
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
        let downloadDetails: DownloadDetails = Utils.extractDownloadDetails(cliRemote);
        let url: string = Utils.getCliUrl(major, version, jfrogFileName, downloadDetails);
        core.info('Downloading JFrog CLI from ' + url);
        let downloadDir: string = await toolCache.downloadTool(url, undefined, downloadDetails.auth);

        // Cache 'jf' and 'jfrog' executables
        await this.cacheAndAddPath(downloadDir, version, jfFileName);
        await this.cacheAndAddPath(downloadDir, version, jfrogFileName);
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
     * @param downloadDir - The directory whereby the CLI was downloaded to
     * @param version     - JFrog CLI version
     * @param fileName    - 'jf', 'jfrog', 'jf.exe', or 'jfrog.exe'
     */
    private static async cacheAndAddPath(downloadDir: string, version: string, fileName: string) {
        let cliDir: string = await toolCache.cacheFile(downloadDir, fileName, fileName, version);

        if (!Utils.isWindows()) {
            chmodSync(join(cliDir, fileName), 0o555);
        }
        core.addPath(cliDir);
    }

    public static getCliUrl(major: string, version: string, fileName: string, downloadDetails: DownloadDetails): string {
        let architecture: string = 'jfrog-cli-' + Utils.getArchitecture();
        let artifactoryUrl: string = downloadDetails.artifactoryUrl.replace(/\/$/, '');
        return `${artifactoryUrl}/${downloadDetails.repository}/v${major}/${version}/${architecture}/${fileName}`;
    }
    // Get Config Tokens created on your local machine using JFrog CLI.
    // The Tokens configured with JF_ENV_ environment variables.
    public static getConfigTokens(): Set<string> {
        let configTokens: Set<string> = new Set(
            Object.keys(process.env)
                .filter((envKey) => envKey.match(Utils.CONFIG_TOKEN_PREFIX))
                .filter((envKey) => process.env[envKey])
                .map((envKey) => process.env[envKey]?.trim() || ''),
        );

        let legacyConfigTokens: Set<string> = new Set(
            Object.keys(process.env)
                .filter((envKey) => envKey.match(Utils.CONFIG_TOKEN_LEGACY_PREFIX))
                .filter((envKey) => process.env[envKey])
                .map((envKey) => process.env[envKey]?.trim() || ''),
        );

        if (legacyConfigTokens.size > 0) {
            core.warning(
                'The "JF_ARTIFACTORY_" prefix for environment variables is deprecated and is expected to be removed in v3. ' +
                    'Please use the "JF_ENV_" prefix instead. The environment variables value should not be changed.',
            );
        }

        legacyConfigTokens.forEach((configToken) => configTokens.add(configToken));
        return configTokens;
    }

    // Get separate env config for the URL and connection details and return args to add to the config add command
    public static getSeparateEnvConfigArgs(): string[] | undefined {
        /**
         * @name url - JFrog Platform URL
         * @name user&password - JFrog Platform basic authentication
         * @name accessToken - Jfrog Platform access token
         */
        //TODO replace env vars with structs fields
        let url: string | undefined = process.env.JF_URL;
        let user: string | undefined = process.env.JF_USER;
        let password: string | undefined = process.env.JF_PASSWORD;
        let accessToken: string | undefined = process.env.JF_ACCESS_TOKEN;

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
    }

    private static exportVariableIfNotSet(key: string, value: string) {
        if (!process.env[key]) {
            core.exportVariable(key, value);
        }
    }

    public static async configJFrogServers() {
        let cliConfigCmd: string[] = ['config'];
        let useOldConfig: boolean = Utils.useOldConfig();
        if (useOldConfig) {
            // Add 'rt' prefix to the beginning of the config command
            cliConfigCmd.unshift('rt');
            let version: string = core.getInput(Utils.CLI_VERSION_ARG);
            core.warning('JFrog CLI ' + version + ' on Setup JFrog CLI GitHub Action is deprecated. Please use version 1.46.4 or above.');
        }
        for (let configToken of Utils.getConfigTokens()) {
            await Utils.runCli(cliConfigCmd.concat('import', configToken));
        }

        let configArgs: string[] | undefined = Utils.getSeparateEnvConfigArgs();
        if (configArgs) {
            await Utils.runCli(cliConfigCmd.concat('add', ...configArgs));
        }
    }

    public static async removeJFrogServers() {
        if (Utils.useOldConfig()) {
            await Utils.runCli(['rt', 'c', 'clear', '--interactive=false']);
        } else {
            await Utils.runCli(['c', 'rm', '--quiet']);
        }
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
     * Therefore the 'jf' executable is expected to be in the path also for older CLI versions.
     * @param args - CLI arguments
     */
    public static async runCli(args: string[]) {
        let res: number = await exec('jf', args);
        if (res !== core.ExitCode.Success) {
            throw new Error('JFrog CLI exited with exit code ' + res);
        }
    }

    /**
     * If repository input was set, extract CLI download details,
     * from either a Config Token with a JF_ENV_ prefix or separate env config (JF_URL, JF_USER, JF_PASSWORD, JF_ACCESS_TOKEN).
     * @param repository - Remote repository in Artifactory pointing to https://releases.jfrog.io/artifactory/jfrog-cli/. If empty, use the default download details.
     * @returns the download details.
     */
    public static extractDownloadDetails(repository: string): DownloadDetails {
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
            if (!process.env.JF_URL) {
                throw new Error(
                    `'download-repository' input provided, but no JFrog environment details found. ` +
                        `Hint - Ensure that the JFrog connection details environment variables are set: ` +
                        `either a Config Token with a JF_ENV_ prefix or separate env config (JF_URL, JF_USER, JF_PASSWORD, JF_ACCESS_TOKEN)`,
                );
            }
            //TODO instead of env vars use the struct
            serverObj.artifactoryUrl = process.env.JF_URL.replace(/\/$/, '') + '/artifactory';
            serverObj.user = process.env.JF_USER;
            serverObj.password = process.env.JF_PASSWORD;
            serverObj.accessToken = process.env.JF_ACCESS_TOKEN;
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
     * Return true if should use 'jfrog rt c' instead of 'jfrog c'.
     * @returns true if should use 'jfrog rt c' instead of 'jfrog c'.
     */
    private static useOldConfig(): boolean {
        let version: string = core.getInput(Utils.CLI_VERSION_ARG);
        if (version === this.LATEST_CLI_VERSION) {
            return false;
        }
        return lt(version, this.NEW_CONFIG_CLI_VERSION);
    }
}

export interface DownloadDetails {
    artifactoryUrl: string;
    repository: string;
    auth: string;
}
