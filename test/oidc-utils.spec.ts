import { OidcUtils } from '../src/oidc-utils';
import * as core from '@actions/core';
import { JfrogCredentials } from '../src/types';
import { Utils } from '../src/utils';

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

        afterEach((): void => {
            jest.restoreAllMocks();
        });

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

        it('should correctly set step outputs for manual token exchange', async (): Promise<void> => {
            // Arrange
            const dummyToken: any = [
                Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64'), // Header
                Buffer.from(JSON.stringify({ sub: 'jfrt@dummy-user' })).toString('base64'), // Payload
                '', // No signature for testing
            ].join('.');
            const mockUsername: string = 'manual-user';

            jest.spyOn(OidcUtils, 'extractTokenUser').mockReturnValueOnce(mockUsername);
            jest.spyOn(OidcUtils, 'manualExchangeOidc').mockResolvedValueOnce(dummyToken);

            // Act
            const result: any = await OidcUtils.manualOIDCExchange(creds);

            // Assert
            expect(result).toBe(dummyToken);
            expect(core.setOutput).toHaveBeenCalledWith('oidc-token', dummyToken);
            expect(core.setOutput).toHaveBeenCalledWith('oidc-user', mockUsername);
        });

        it('should throw if creds are missing required fields', async (): Promise<void> => {
            const incompleteCreds: JfrogCredentials = {
                jfrogUrl: 'https://example.jfrog.io',
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
