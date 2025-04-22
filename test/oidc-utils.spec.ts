import { OidcUtils } from '../src/oidc-utils';
import * as core from '@actions/core';
import { getExecOutput, ExecOutput } from '@actions/exec';
import { JfrogCredentials } from '../src/types';

jest.mock('@actions/core');
jest.mock('@actions/exec');

describe('OidcUtils', (): void => {
    afterEach((): void => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    describe('resolveAccessToken', (): void => {
        const baseCreds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            oidcProviderName: 'provider',
            oidcTokenId: 'token-id',
            username: 'tester',
        };

        it('should use CLI exchange when version is >= 2.75.0', async (): Promise<void> => {
            const mockOutput: ExecOutput = {
                exitCode: 0,
                stdout: '{"AccessToken":"abc","Username":"tester"}',
                stderr: '',
            };
            (getExecOutput as jest.Mock).mockResolvedValueOnce(mockOutput);

            const result: string | undefined = await OidcUtils.resolveAccessToken(baseCreds, '2.75.0');
            expect(result).toBe('abc');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-token', 'abc');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-user', 'tester');
        });

        it('should return accessToken directly if already set', async (): Promise<void> => {
            const creds: JfrogCredentials = { ...baseCreds, accessToken: 'static-token' };
            const result: string | undefined = await OidcUtils.resolveAccessToken(creds, '2.75.0');
            expect(result).toBe('static-token');
        });

        it('should return undefined if no OIDC info provided', async (): Promise<void> => {
            const creds: JfrogCredentials = { jfrogUrl: 'https://example.jfrog.io' };
            const result: string | undefined = await OidcUtils.resolveAccessToken(creds, '2.75.0');
            expect(result).toBeUndefined();
        });
    });

    describe('exchangeOIDCTokenAndExportStepOutputs', (): void => {
        const creds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            oidcProviderName: 'provider',
            oidcTokenId: 'token-id',
            oidcAudience: 'aud',
        };

        it('should export step outputs when CLI succeeds', async (): Promise<void> => {
            const mockOutput: ExecOutput = {
                exitCode: 0,
                stdout: '{"AccessToken":"abc","Username":"tester"}',
                stderr: '',
            };
            (getExecOutput as jest.Mock).mockResolvedValueOnce(mockOutput);

            const result: string | undefined = await OidcUtils.exchangeOIDCTokenAndExportStepOutputs(creds);

            expect(result).toBe('abc');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-token', 'abc');
            expect(core.setOutput).toHaveBeenCalledWith('oidc-user', 'tester');
        });

        it('should throw if CLI command fails', async (): Promise<void> => {
            const mockOutput: ExecOutput = {
                exitCode: 1,
                stdout: '',
                stderr: 'boom',
            };
            (getExecOutput as jest.Mock).mockResolvedValueOnce(mockOutput);

            await expect(OidcUtils.exchangeOIDCTokenAndExportStepOutputs(creds)).rejects.toThrow('CLI command failed with exit code 1: boom');
        });

        it('should throw if CLI execution throws', async (): Promise<void> => {
            (getExecOutput as jest.Mock).mockRejectedValueOnce(new Error('exec failed'));

            await expect(OidcUtils.exchangeOIDCTokenAndExportStepOutputs(creds)).rejects.toThrow('Failed to exchange OIDC token: exec failed');
        });

        it('should throw if creds are missing required fields', async (): Promise<void> => {
            const incompleteCreds: JfrogCredentials = {
                jfrogUrl: 'https://example.jfrog.io',
                // missing provider and token ID
            };

            await expect(OidcUtils.exchangeOIDCTokenAndExportStepOutputs(incompleteCreds)).rejects.toThrow(
                'Missing required OIDC provider name or token ID.',
            );
        });
    });

    describe('getAccessTokenFromCliOutput', (): void => {
        it('should parse valid JSON', (): void => {
            const input: string = '{"AccessToken":"abc","Username":"user"}';
            const { accessToken, username }: { accessToken: string; username: string } = OidcUtils.getAccessTokenFromCliOutput(input);
            expect(accessToken).toBe('abc');
            expect(username).toBe('user');
        });

        it('should fallback to regex parsing', (): void => {
            const input: string = 'AccessToken: abc Username: user';
            const { accessToken, username }: { accessToken: string; username: string } = OidcUtils.getAccessTokenFromCliOutput(input);
            expect(accessToken).toBe('abc');
            expect(username).toBe('user');
        });

        it('should throw on invalid input', (): void => {
            expect((): void => {
                OidcUtils.getAccessTokenFromCliOutput('Invalid');
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
