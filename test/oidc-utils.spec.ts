import { OidcUtils } from '../src/oidc-utils';
import * as core from '@actions/core';
import { JfrogCredentials } from '../src/types';
import { Utils } from '../src/utils';
import { HttpClient } from '@actions/http-client';

jest.mock('@actions/core');
jest.mock('@actions/exec');

describe('OidcUtils', (): void => {
    afterEach((): void => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe('exchangeOIDCTokenAndExportStepOutputs', (): void => {
        const creds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            oidcProviderName: 'provider',
            oidcTokenId: 'token-id',
            oidcAudience: 'aud',
        };

        it('should export step outputs when CLI succeeds', async (): Promise<void> => {
            const mockOutput: string = 'AccessToken: abc Username: tester';

            const mockRunCli: any = jest.spyOn(Utils, 'runCliAndGetOutput').mockResolvedValueOnce(mockOutput);

            const result: string | undefined = await OidcUtils.exchangeOIDCTokenAndExportStepOutputs(creds);

            expect(result).toBe('abc');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-token', 'abc');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-user', 'tester');

            mockRunCli.mockRestore();
        });

        it('should correctly set step outputs for CLI token exchange', async (): Promise<void> => {
            const mockOutput: string = 'AccessToken: cli-token Username: cli-user';

            const mockRunCli: any = jest.spyOn(Utils, 'runCliAndGetOutput').mockResolvedValueOnce(mockOutput);

            const result: string | undefined = await OidcUtils.exchangeOIDCTokenAndExportStepOutputs(creds);

            expect(result).toBe('cli-token');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-token', 'cli-token');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-user', 'cli-user');

            mockRunCli.mockRestore();
        });

        it('should perform manual OIDC token exchange and set outputs', async () => {
            // Arrange
            const creds: JfrogCredentials = {
                jfrogUrl: 'https://example.jfrog.io',
                oidcProviderName: 'provider',
                oidcTokenId: 'token-id',
                oidcAudience: '',
            };
            const mockAccessToken: any = [
                Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64'), // Header
                Buffer.from(JSON.stringify({ sub: 'jfrt@dummy-user' })).toString('base64'), // Payload
                '', // No signature for testing
            ].join('.');
            const mockResponse: any = {
                readBody: jest.fn().mockResolvedValue(JSON.stringify({ access_token: mockAccessToken })),
            };

            const mockHttpClientPost: any = jest.spyOn(HttpClient.prototype, 'post').mockResolvedValue(mockResponse as any);

            const mockGetApplicationKey: any = jest.spyOn(OidcUtils, 'getApplicationKey').mockResolvedValue('mock-application-key');

            const mockOutputOidcTokenAndUsernameFromToken: any = jest.spyOn(OidcUtils, 'outputOidcTokenAndUsernameFromToken');

            // Act
            const result: any = await OidcUtils.manualExchangeOidc(creds);

            // Assert
            expect(result).toBe(mockAccessToken);
            expect(mockOutputOidcTokenAndUsernameFromToken).toHaveBeenCalledWith(mockAccessToken);

            // Cleanup
            mockHttpClientPost.mockRestore();
            mockGetApplicationKey.mockRestore();
            mockOutputOidcTokenAndUsernameFromToken.mockRestore();
        });

        it('should throw if creds are missing required fields', async (): Promise<void> => {
            const incompleteCreds: JfrogCredentials = {
                jfrogUrl: 'https://example.jfrog.io',
                oidcAudience: '',
                // missing provider and token ID
            };

            await expect(OidcUtils.exchangeOIDCTokenAndExportStepOutputs(incompleteCreds)).rejects.toThrow(
                'Missing one or more required fields: OIDC provider name, token ID, or JFrog Platform URL.',
            );
        });
    });

    describe('getAccessTokenFromCliOutput', (): void => {
        it('should parse valid JSON', (): void => {
            const input: string = '{"AccessToken":"abc","Username":"user"}';
            const { accessToken, username }: { accessToken: string; username: string } = OidcUtils.extractValuesFromOIDCToken(input);
            expect(accessToken).toBe('abc');
            expect(username).toBe('user');
        });

        it('should fallback to regex parsing', (): void => {
            const input: string = 'AccessToken: abc Username: user';
            const { accessToken, username }: { accessToken: string; username: string } = OidcUtils.extractValuesFromOIDCToken(input);
            expect(accessToken).toBe('abc');
            expect(username).toBe('user');
        });

        it('should throw on invalid input', (): void => {
            expect((): void => {
                OidcUtils.extractValuesFromOIDCToken('Invalid');
            }).toThrow();
        });
    });

    describe('setOidcStepOutputs', (): void => {
        it('should export user/token as step output and secret', (): void => {
            OidcUtils.setOidcStepOutputs('foo', 'bar');
            expect(core.setSecret).toHaveBeenCalledWith('bar');
            expect(core.setSecret).toHaveBeenCalledWith('foo');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-token', 'bar');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-user', 'foo');
        });
    });

    describe('trackOldOidcUsage', (): void => {
        it('should export OIDC usage env vars', (): void => {
            OidcUtils.trackOldOidcUsage();
            expect(core.exportVariable).toHaveBeenCalledWith('JFROG_CLI_USAGE_CONFIG_OIDC', 'TRUE');
            expect(core.exportVariable).toHaveBeenCalledWith('JFROG_CLI_USAGE_OIDC_USED', 'TRUE');
        });
    });
});
