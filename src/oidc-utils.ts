/**
 * OIDC Utility functions for JFrog CLI setup and GitHub OIDC integration.
 * Handles CLI-based and manual REST-based token exchanges, output management, and usage tracking.
 */

import * as core from '@actions/core';
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import { OutgoingHttpHeaders } from 'http';
import { TokenExchangeResponseData, JfrogCredentials, CliExchangeTokenResponse, JWTTokenData } from './types';
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
    2. Use the new OIDC token ID exchange command in the CLI (2.75.0+).

    Note: Why not use config command with OIDC params?
    Because the username and access token should output as a step output
    for further use by the users, this cannot be done in secure way using jf config add command.

    */
    public static async exchangeOidcToken(jfrogCredentials: JfrogCredentials): Promise<string | undefined> {
        if (!jfrogCredentials.jfrogUrl) {
            throw new Error(`JF_URL must be provided when oidc-provider-name is specified`);
        }
        // Get OIDC token ID from GitHub
        try {
            core.debug('Attempting to fetch JSON Web Token (JWT) ID token with audience value: ' + jfrogCredentials.oidcAudience);
            jfrogCredentials.oidcTokenId = await core.getIDToken(jfrogCredentials.oidcAudience);
        } catch (error: any) {
            throw new Error(`Failed to fetch OpenID Connect JSON Web Token: ${error.message}`);
        }

        // Version should be more than min version
        // If CLI_REMOTE_ARG specified, we have to fetch token before we can download the CLI.
        if (this.isCLIVersionOidcSupported() && !core.getInput(Utils.CLI_REMOTE_ARG)) {
            core.debug('Using CLI exchange-oidc-token..');
            return await this.exchangeOIDCTokenAndExportStepOutputs(jfrogCredentials);
        }

        // Fallback to manual OIDC exchange for backward compatibility
        core.debug('Using Manual OIDC Auth Method..');
        // Exchanges the token and set as access token in the credential's object
        let token: string | undefined = await this.manualExchangeOidc(jfrogCredentials);
        if (!token) {
            throw new Error('Failed to manually exchange OIDC token via RESTApi');
        }
        return token;
    }

    /**
     * Uses the CLI to exchange OIDC token for an access token and sets outputs.
     */
    public static async exchangeOIDCTokenAndExportStepOutputs(creds: JfrogCredentials): Promise<string | undefined> {
        let output: string;
        if (creds.oidcProviderName === undefined || creds.oidcTokenId === undefined || creds.jfrogUrl === undefined) {
            throw new Error('Missing one or more required fields: OIDC provider name, token ID, or JFrog Platform URL.');
        }

        const args: string[] = ['eot', creds.oidcProviderName, creds.oidcTokenId, '--url', creds.jfrogUrl];
        if (creds.oidcAudience !== '') {
            args.push('--oidc-audience', creds.oidcAudience);
        }
        core.debug('Running CLI command: ' + args.join(' '));
        output = await Utils.runCliAndGetOutput(args, { silent: true });

        const { accessToken, username }: CliExchangeTokenResponse = this.extractValuesFromOIDCToken(output);
        this.setOidcStepOutputs(username, accessToken);
        return accessToken;
    }

    /**
     * Performs a manual token exchange via HTTP for older CLI versions.
     */
    public static async manualExchangeOidc(creds: JfrogCredentials): Promise<string | undefined> {
        const url: string | undefined = creds.jfrogUrl;
        const providerName: string | undefined = creds.oidcProviderName;
        const applicationKey: string = await this.getApplicationKey();
        if (!url || !providerName) {
            throw new Error('Missing required JFrog URL or OIDC provider name.');
        }
        if (!creds.oidcTokenId) {
            throw new Error('Missing required OIDC token ID.');
        }
        const exchangeUrl: string = url.replace(/\/$/, '') + '/access/api/v1/oidc/token';
        const payload: Record<string, string> = this.buildOidcTokenExchangePayload(creds.oidcTokenId, providerName, applicationKey);
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
        // Export env vars for usage tracking
        this.trackOldOidcUsage();
        // Export step outputs
        this.outputOidcTokenAndUsernameFromToken(responseJson.access_token);
        return responseJson.access_token;
    }

    /**
     * Extracts the access token and username from the CLI output.
     * Attempts to parse the input as JSON first, then falls back to regex.
     * Currently, in the CLI 2.75.0 version, the output is not a valid JSON.
     * This will be fixed in the next versions, but for now we need to support both.
     * @param input
     */
    public static extractValuesFromOIDCToken(input: string): CliExchangeTokenResponse {
        if (!input) {
            throw new Error('JFrog CLI command output is empty. Failed to exchange OIDC access token.');
        }

        try {
            const parsed: { AccessToken?: string; Username?: string } = JSON.parse(input);
            if (parsed.AccessToken && parsed.Username) {
                return { accessToken: parsed.AccessToken, username: parsed.Username };
            }
        } catch (e: unknown) {
            core.debug('Failed to parse JSON from CLI output. Falling back to regex...');
        }

        const regex: RegExp = /AccessToken:\s*(\S+)\s*Username:\s*(\S+)/;
        const match: RegExpMatchArray | null = regex.exec(input);
        if (!match) {
            throw new Error('Failed to extract access token and username values from jf exchange-oidc-token command');
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
        let payload: JWTTokenData = this.decodeOidcToken(token);
        let tokenUser: string = this.extractTokenUser(payload.sub);
        this.setOidcStepOutputs(tokenUser, token);
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

    public static trackOldOidcUsage(): void {
        core.exportVariable('JFROG_CLI_USAGE_CONFIG_OIDC', 'TRUE');
        core.exportVariable('JFROG_CLI_USAGE_OIDC_USED', 'TRUE');
    }

    /**
     * Constructs the payload for the OIDC token exchange request.
     * NOTE: This structure is intended for legacy CLI versions and matches the access API format.
     * The payload includes a context object and some duplicated parameters for backward compatibility.
     * Future updates will move all additional parameters into the context object.
     * @param jwt
     * @param providerName
     * @param applicationKey
     * @private
     */
    private static buildOidcTokenExchangePayload(jwt: string, providerName: string, applicationKey: string): Record<string, any> {
        return {
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
            subject_token: jwt,
            provider_name: providerName,
            project_key: process.env.JF_PROJECT ?? '',
            // gh_* params are used for usage tracking
            gh_job_id: process.env.GITHUB_JOB ?? '',
            gh_run_id: process.env.GITHUB_RUN_ID ?? '',
            gh_repo: process.env.GITHUB_REPOSITORY ?? '',
            gh_revision: process.env.GITHUB_SHA ?? '',
            gh_branch: process.env.GITHUB_REF_NAME ?? '',
            // AppTrust context parameters
            repo: process.env.GITHUB_REPOSITORY,
            revision: process.env.GITHUB_SHA,
            branch: process.env.GITHUB_REF_NAME,
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
    public static async getApplicationKey(): Promise<string> {
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

    public static isCLIVersionOidcSupported(): boolean {
        const version: string = core.getInput(Utils.CLI_VERSION_ARG) || '';
        if (version === '') {
            // No input meaning default version which is supported
            return true;
        }
        return version === Utils.LATEST_CLI_VERSION || gte(version, this.MIN_CLI_OIDC_VERSION);
    }
}
