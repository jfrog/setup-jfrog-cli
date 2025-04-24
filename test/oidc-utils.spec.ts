import { OidcUtils } from '../src/oidc-utils';
import * as core from '@actions/core';
import { JfrogCredentials } from '../src/types';
import * as jsYaml from 'js-yaml';
import * as path from 'path';
import * as fs from 'node:fs';
import { Utils } from '../src/utils';

jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
    },
    existsSync: jest.fn(),
}));
jest.mock('path');

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

// describe('getApplicationKey', () => {
//     const mockReadFile: jest.Mock = fs.promises.readFile as jest.Mock;
//     const mockExistsSync: jest.Mock = fs.existsSync as jest.Mock;
//     const mockPath: jest.Mock = path.join as jest.Mock;
//
//     beforeEach(() => {
//         jest.resetAllMocks();
//     });
//
//     it('should return application key from config file', async () => {
//         mockPath.mockReturnValue('mocked-path');
//         mockExistsSync.mockReturnValue(true);
//         mockReadFile.mockResolvedValue(jsYaml.dump({ application: { key: 'config-app-key' } }));
//
//         const result: string = await (Utils as any).getApplicationKey();
//         expect(result).toBe('config-app-key');
//         expect(mockReadFile).toHaveBeenCalledWith('mocked-path', 'utf-8');
//     });
//
//     it('should return empty string if config file does not exist', async () => {
//         mockPath.mockReturnValue('mocked-path');
//         mockExistsSync.mockReturnValue(false);
//
//         const result: string = await (Utils as any).getApplicationKey();
//         expect(result).toBe('');
//         expect(mockReadFile).not.toHaveBeenCalled();
//     });
//
//     it('should return empty string if config file is empty', async () => {
//         mockPath.mockReturnValue('mocked-path');
//         mockExistsSync.mockReturnValue(true);
//         mockReadFile.mockResolvedValue('');
//
//         const result: string = await (Utils as any).getApplicationKey();
//         expect(result).toBe('');
//     });
//
//     it('should return empty string if application root is not found in config file', async () => {
//         mockPath.mockReturnValue('mocked-path');
//         mockExistsSync.mockReturnValue(true);
//         mockReadFile.mockResolvedValue(jsYaml.dump({}));
//
//         const result: string = await (Utils as any).getApplicationKey();
//         expect(result).toBe('');
//     });
//
//     it('should return empty string if application key is not found in config file', async () => {
//         mockPath.mockReturnValue('mocked-path');
//         mockExistsSync.mockReturnValue(true);
//         mockReadFile.mockResolvedValue(jsYaml.dump({ application: {} }));
//
//         const result: string = await (Utils as any).getApplicationKey();
//         expect(result).toBe('');
//     });
// });
