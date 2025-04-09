import * as core from '@actions/core';
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import { JfrogCredentials } from './utils';
import { load } from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

type ApplicationConfig = {
    application?: {
        key?: string;
    };
};

export interface TokenExchangeResponseData {
    access_token: string;
    errors: string;
}

type TokenExchangeRequest = {
    grant_type: string;
    subject_token_type: string;
    subject_token: string;
    provider_name: string;
    project_key: string;
    gh_job_id: string;
    gh_run_id: string;
    gh_repo: string;
    application_key: string;
};

export class LegacyOidc {
    public static async handleLegacyOidcFlow(jfrogCredentials: JfrogCredentials): Promise<JfrogCredentials> {
        core.info('Obtaining an access token through OpenID Connect (legacy fallback)...');

        const audience: string = core.getInput('oidc-audience');
        let jsonWebToken: string;
        try {
            core.debug('Fetching JSON web token (legacy)');
            jsonWebToken = await core.getIDToken(audience);
        } catch (error: any) {
            throw new Error(`Getting OpenID Connect JSON web token failed: ${error.message}`);
        }

        const applicationKey: string = await this.getApplicationKey();
        return await this.exchangeToken(jfrogCredentials, jsonWebToken, applicationKey);
    }

    private static async exchangeToken(jfrogCredentials: JfrogCredentials, jsonWebToken: string, applicationKey: string): Promise<JfrogCredentials> {
        const oidcProviderName: string = jfrogCredentials.oidcProviderName!;
        const exchangeUrl: string = `${jfrogCredentials.jfrogUrl!.replace(/\/$/, '')}/access/api/v1/oidc/token`;

        const data: TokenExchangeRequest = {
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
            subject_token: jsonWebToken,
            provider_name: oidcProviderName,
            project_key: process.env.JF_PROJECT || '',
            gh_job_id: process.env.GITHUB_WORKFLOW || '',
            gh_run_id: process.env.GITHUB_RUN_ID || '',
            gh_repo: process.env.GITHUB_REPOSITORY || '',
            application_key: applicationKey,
        };

        const httpClient: HttpClient = new HttpClient();
        const response: HttpClientResponse = await httpClient.post(exchangeUrl, JSON.stringify(data), {
            'Content-Type': 'application/json',
        });
        const responseBody: string = await response.readBody();
        const responseJson: TokenExchangeResponseData = JSON.parse(responseBody);

        if (responseJson.errors) {
            throw new Error(`OIDC token exchange failed: ${JSON.stringify(responseJson.errors)}`);
        }

        core.exportVariable('JFROG_CLI_USAGE_CONFIG_OIDC', 'TRUE');
        core.exportVariable('JFROG_CLI_USAGE_OIDC_USED', 'TRUE');

        jfrogCredentials.accessToken = responseJson.access_token;
        return jfrogCredentials;
    }

    private static async getApplicationKey(): Promise<string> {
        const configFilePath: string = path.join('.jfrog', 'config.yaml');

        if (!fs.existsSync(configFilePath)) {
            core.debug('JFrog config file not found');
            return '';
        }

        const configContent: string = await fs.promises.readFile(configFilePath, 'utf-8');
        const configObj: ApplicationConfig = load(configContent) as ApplicationConfig;
        return configObj?.application?.key ?? '';
    }
}
