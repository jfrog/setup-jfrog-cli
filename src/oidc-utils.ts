/**
 * OIDC Utility functions for JFrog CLI setup and GitHub OIDC integration.
 * Handles CLI-based and manual REST-based token exchanges, output management, and usage tracking.
 */

import * as core from '@actions/core';
import { getExecOutput, ExecOutput } from '@actions/exec';
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import { OutgoingHttpHeaders } from 'http';
import { TokenExchangeResponseData, JfrogCredentials } from './types';
import * as semver from 'semver';
import path from 'path';
import { existsSync, promises as fs } from 'fs';
import { gte } from 'semver';
import { Utils } from './utils';
import { load } from 'js-yaml';

export class OidcUtils {
    public static readonly MIN_CLI_OIDC_VERSION: string = '2.75.0';
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

    /*
    Currently, OIDC authentication can be handled in two ways due to CLI version limitations:
    1. Manually call the REST API from this codebase.
    2. Use the new OIDC token ID feature in the CLI (2.75.0+).

    If the CLI version supports it and the user is not using an artifactory download repository,
    we use the new CLI native OIDC token ID flow.
    Otherwise, we fall back to manual OIDC exchange for compatibility.

    Note: The manual logic should be deprecated and removed once CLI remote supports native OIDC.
    */
    public static async handleOidcAuth(jfrogCredentials: JfrogCredentials): Promise<string | undefined> {
        if (!jfrogCredentials.jfrogUrl) {
            throw new Error(`JF_URL must be provided when oidc-provider-name is specified`);
        }
        // Get OIDC token ID from GitHub
        jfrogCredentials.oidcTokenId = await this.getIdToken(jfrogCredentials.oidcAudience || '');

        // Version should be more than min version
        // If CLI_REMOTE_ARG specified, we have to fetch token before we can download the CLI.
        if (this.isCLIVersionOidcSupported() && !core.getInput(Utils.CLI_REMOTE_ARG)) {
            core.debug('Using CLI Config OIDC Auth Method..');
            return await this.exchangeOIDCTokenAndExportStepOutputs(jfrogCredentials);
        }

        // Fallback to manual OIDC exchange for backward compatibility
        core.debug('Using Manual OIDC Auth Method..');
        return this.manualOIDCExchange(jfrogCredentials);
    }

    /*
    This function manually exchanges oidc token and updates the credentials object with an access token retrieved
     */
    public static async manualOIDCExchange(jfrogCredentials: JfrogCredentials): Promise<string | undefined> {
        // Get ID token from GitHub
        const audience: string = core.getInput(Utils.OIDC_AUDIENCE_ARG);
        let jsonWebToken: string = await this.getIdToken(audience);

        // Exchanges the token and set as access token in the credential's object
        const applicationKey: string = await this.getApplicationKey();
        try {
            return await this.manualExchangeOidcAndSetAsAccessToken(jfrogCredentials, jsonWebToken, applicationKey);
        } catch (error: any) {
            throw new Error(`Exchanging JSON web token with an access token failed: ${error.message}`);
        }
    }

    /**
     * Resolves a valid access token using OIDC configuration if present.
     * For new CLI versions, uses `jf eot`. For older versions, falls back to env values.
     */
    public static async resolveAccessToken(creds: JfrogCredentials, cliVersion: string): Promise<string | undefined> {
        const oidcConfigured: boolean = !!creds.oidcProviderName && !!creds.oidcTokenId;
        let resolvedToken: string | undefined = creds.accessToken;

        if (oidcConfigured && !creds.accessToken && creds.jfrogUrl && semver.gte(cliVersion, this.MIN_CLI_OIDC_VERSION)) {
            resolvedToken = await this.exchangeOIDCTokenAndExportStepOutputs(creds);
        }

        if (resolvedToken && creds.username) {
            this.setOidcStepOutputs(creds.username, resolvedToken);
        }

        return resolvedToken;
    }

    /**
     * Uses the CLI to exchange OIDC token for an access token, and sets outputs.
     */
    public static async exchangeOIDCTokenAndExportStepOutputs(creds: JfrogCredentials): Promise<string | undefined> {
        let output: ExecOutput;
        if (creds.oidcProviderName === undefined || creds.oidcTokenId === undefined || creds.jfrogUrl === undefined) {
            throw new Error('Missing required OIDC provider name or token ID.');
        }
        try {
            output = await getExecOutput(
                'jf',
                ['eot', creds.oidcProviderName, creds.oidcTokenId, '--url', creds.jfrogUrl, '--oidc-audience', creds.oidcAudience || 'jfrog-github'],
                {
                    silent: true,
                    ignoreReturnCode: true,
                },
            );
        } catch (err: unknown) {
            const message: string = err instanceof Error ? err.message : String(err);
            core.error(`Failed to exchange OIDC token: ${message}`);
            throw new Error(`Failed to exchange OIDC token: ${message}`);
        }

        if (output.exitCode !== 0) {
            throw new Error(`CLI command failed with exit code ${output.exitCode}: ${output.stderr}`);
        }

        const { accessToken, username }: { accessToken: string; username: string } = this.getAccessTokenFromCliOutput(output.stdout);
        this.setOidcStepOutputs(username, accessToken);
        return accessToken;
    }

    /**
     * Performs a manual token exchange via HTTP for older CLI versions.
     */
    public static async manualExchangeOidcAndSetAsAccessToken(
        creds: JfrogCredentials,
        jsonWebToken: string,
        applicationKey: string,
    ): Promise<string | undefined> {
        const url: string | undefined = creds.jfrogUrl;
        const providerName: string | undefined = creds.oidcProviderName;
        if (!url || !providerName) {
            throw new Error('Missing required JFrog URL or OIDC provider name.');
        }

        const exchangeUrl: string = url.replace(/\/$/, '') + '/access/api/v1/oidc/token';
        const payload: Record<string, string> = this.buildOidcTokenExchangePayload(jsonWebToken, providerName, applicationKey);
        const httpClient: HttpClient = new HttpClient();
        const headers: OutgoingHttpHeaders = { 'Content-Type': 'application/json' };

        const response: HttpClientResponse = await httpClient.post(exchangeUrl, JSON.stringify(payload), headers);
        const body: string = await response.readBody();
        const responseJson: TokenExchangeResponseData = JSON.parse(body);

        if (responseJson.errors) {
            throw new Error(`OIDC token exchange failed: ${JSON.stringify(responseJson.errors)}`);
        }

        if (!responseJson.access_token) {
            throw new Error('Access token not found in the response');
        }

        this.outputOidcTokenAndUsernameFromToken(responseJson.access_token);
        this.trackOldOidcUsage();
        return responseJson.access_token;
    }

    public static getAccessTokenFromCliOutput(input: string): { accessToken: string; username: string } {
        if (!input) {
            throw new Error('Input is empty. Cannot extract values.');
        }

        try {
            const parsed: { AccessToken?: string; Username?: string } = JSON.parse(input);
            if (parsed.AccessToken && parsed.Username) {
                return { accessToken: parsed.AccessToken, username: parsed.Username };
            }
        } catch (e: unknown) {
            core.debug('Failed to parse JSON. Falling back to regex.');
        }

        const regex: RegExp = /AccessToken:\s*(\S+)\s*Username:\s*(\S+)/;
        const match: RegExpMatchArray | null = regex.exec(input);
        if (!match) {
            throw new Error('Failed to extract values. Input format is invalid.');
        }

        return {
            accessToken: match[1],
            username: match[2],
        };
    }

    public static setOidcStepOutputs(username: string, accessToken: string): void {
        core.setSecret(accessToken);
        core.setSecret(username);
        core.setOutput('oidc-token', accessToken);
        core.setOutput('oidc-user', username);
    }

    public static outputOidcTokenAndUsernameFromToken(token: string): void {
        this.setOidcStepOutputs('<unknown>', token);
    }

    public static trackOldOidcUsage(): void {
        core.exportVariable('JFROG_CLI_USAGE_CONFIG_OIDC', 'TRUE');
        core.exportVariable('JFROG_CLI_USAGE_OIDC_USED', 'TRUE');
    }

    private static buildOidcTokenExchangePayload(jwt: string, providerName: string, applicationKey: string): Record<string, string> {
        return {
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
            subject_token: jwt,
            provider_name: providerName,
            project_key: process.env.JF_PROJECT ?? '',
            gh_job_id: process.env.GITHUB_JOB ?? '',
            gh_run_id: process.env.GITHUB_RUN_ID ?? '',
            gh_repo: process.env.GITHUB_REPOSITORY ?? '',
            application_key: applicationKey,
        };
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
    private static async getApplicationKey(): Promise<string> {
        const configFilePath: string = path.join(this.JF_CONFIG_DIR_NAME, this.JF_CONFIG_FILE_NAME);
        try {
            const config: string = await this.readConfigFromFileSystem(configFilePath);
            if (!config) {
                console.debug('Config file is empty or not found.');
                return '';
            }
            const configObj: any = load(config);
            const application: string = configObj[this.APPLICATION_ROOT_YML];
            if (!application) {
                console.log('Application root is not found in the config file.');
                return '';
            }

            const applicationKey: string = application[this.KEY];
            if (!applicationKey) {
                console.log('Application key is not found in the config file.');
                return '';
            }
            console.debug('Found application key: ' + applicationKey);
            return applicationKey;
        } catch (error) {
            console.error('Error reading config:', error);
            return '';
        }
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
    private static async readConfigFromFileSystem(configRelativePath: string): Promise<string> {
        core.debug(`Reading config from file system. Looking for ${configRelativePath}`);
        if (!existsSync(configRelativePath)) {
            core.debug(`config.yml not found in ${configRelativePath}`);
            return '';
        }

        core.debug(`config.yml found in ${configRelativePath}`);
        return await fs.readFile(configRelativePath, 'utf-8');
    }

    /**
     * Fetches a JSON Web Token (JWT) ID token from GitHub's OIDC provider.
     * @param audience - The intended audience for the token.
     * @returns A promise that resolves to the JWT ID token as a string.
     * @throws An error if fetching the token fails.
     */
    private static async getIdToken(audience: string): Promise<string> {
        core.debug('Attempting to fetch JSON Web Token (JWT) ID token...');
        try {
            return await core.getIDToken(audience);
        } catch (error: any) {
            throw new Error(`Failed to fetch OpenID Connect JSON Web Token: ${error.message}`);
        }
    }

    public static isCLIVersionOidcSupported(): boolean {
        const version: string = core.getInput(Utils.CLI_VERSION_ARG) || '';
        if (version === '') {
            // No input meaning default version which is supported
            return true;
        }
        return version === Utils.LATEST_CLI_VERSION || gte(version, this.MIN_CLI_OIDC_VERSION);
    }
}
