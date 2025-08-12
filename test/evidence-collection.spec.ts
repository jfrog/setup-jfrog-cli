import { collectEvidences } from '../src/evidence-collection';
import * as core from '@actions/core';
import { Utils } from '../src/utils';

// Mock the dependencies
jest.mock('@actions/core');
jest.mock('@actions/http-client');
jest.mock('../src/utils');
jest.mock('../src/oidc-utils');

// Manual mock for fs - include both sync and async functions
jest.mock('fs', () => ({
    promises: {
        access: jest.fn(),
        readFile: jest.fn(),
        stat: jest.fn(),
    },
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    statSync: jest.fn(),
}));
const mockFs = require('fs').promises;

describe('Evidence Collection', () => {
    // Helper function to check if a specific file was processed
    const wasFileProcessed = (fileName: string): boolean => {
        const runCliCalls = (Utils.runCliAndGetOutput as jest.Mock).mock.calls;
        return runCliCalls.some((call) => call[0].includes(fileName));
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock core functions
        (core.startGroup as jest.Mock).mockImplementation(() => {});
        (core.endGroup as jest.Mock).mockImplementation(() => {});
        (core.info as jest.Mock).mockImplementation(() => {});
        (core.warning as jest.Mock).mockImplementation(() => {});
        (core.debug as jest.Mock).mockImplementation(() => {});

        // Mock Utils.runCliAndGetOutput
        (Utils.runCliAndGetOutput as jest.Mock) = jest.fn();
        // Always mock fs.promises for all tests
        mockFs.access.mockReset();
        mockFs.readFile.mockReset();
        mockFs.stat.mockReset();
    });

    describe('collectEvidences', () => {
        it('should call runCliAndGetOutput for each valid file', async () => {
            process.env.RUNNER_TEMP = '/tmp';
            // Mock credentials
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: 'test-token',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock HTTP client response
            const mockResponse = {
                message: { statusCode: 200 },
                readBody: jest.fn().mockResolvedValue(
                    JSON.stringify({
                        external_evidence_collection_supported: true,
                        evidence_file_size_limit_mb: 100,
                    }),
                ),
            };

            const { HttpClient } = require('@actions/http-client');
            HttpClient.mockImplementation(() => ({
                get: jest.fn().mockResolvedValue(mockResponse),
            }));

            // Mock file system operations
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('file1.sigstore\nfile2.sigstore');
            mockFs.stat.mockImplementation((filePath: string) => {
                // Mock different file sizes for testing
                if (filePath === 'file1.sigstore') {
                    return Promise.resolve({ size: 50 * 1024 * 1024 }); // 50 MB - under limit
                } else if (filePath === 'file2.sigstore') {
                    return Promise.resolve({ size: 150 * 1024 * 1024 }); // 150 MB - over limit
                }
                return Promise.resolve({ size: 10 * 1024 * 1024 }); // Default 10 MB
            });

            // Mock Utils.runCliAndGetOutput
            (Utils.runCliAndGetOutput as jest.Mock).mockResolvedValue('Evidence created successfully');

            await collectEvidences();

            // Verify that runCliAndGetOutput was called only for the file under the size limit
            expect(Utils.runCliAndGetOutput).toHaveBeenCalledTimes(1);
            expect(Utils.runCliAndGetOutput).toHaveBeenCalledWith([
                'evd',
                'create',
                '--sigstore-bundle',
                'file1.sigstore',
                '--provider-id',
                'github',
            ]);

            // Verify that the large file was skipped (no CLI call for it)
            expect(wasFileProcessed('file2.sigstore')).toBe(false);
        });

        it('should not call runCliAndGetOutput when evidence collection is not supported', async () => {
            // Mock credentials
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: 'test-token',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock HTTP client response
            const mockResponse = {
                message: { statusCode: 200 },
                readBody: jest.fn().mockResolvedValue(
                    JSON.stringify({
                        external_evidence_collection_supported: false,
                        evidence_file_size_limit_mb: 0,
                    }),
                ),
            };

            const { HttpClient } = require('@actions/http-client');
            HttpClient.mockImplementation(() => ({
                get: jest.fn().mockResolvedValue(mockResponse),
            }));

            // Mock file system operations: attestation file exists and has one path
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('file1.sigstore');

            await collectEvidences();

            // Verify that runCliAndGetOutput was never called
            expect(Utils.runCliAndGetOutput).not.toHaveBeenCalled();
        });

        it('should not call runCliAndGetOutput when no attestation files exist', async () => {
            // Mock credentials
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: 'test-token',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock file system operations: attestation file does not exist
            mockFs.access.mockRejectedValue(new Error('ENOENT'));

            await collectEvidences();

            // Verify that runCliAndGetOutput was never called
            expect(Utils.runCliAndGetOutput).not.toHaveBeenCalled();
        });

        it('should handle missing JF_URL', async () => {
            // Mock credentials without URL
            const mockCredentials = {
                jfrogUrl: undefined,
                accessToken: 'test-token',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock file system operations: attestation file exists and has one path
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('file1.sigstore');

            await collectEvidences();

            expect(core.warning).toHaveBeenCalledWith(
                'Failed while attempting to collect evidences: Error: JF_URL is required to check evidence support',
            );
            expect(core.endGroup).toHaveBeenCalled();
        });

        it('should not call runCliAndGetOutput when only username/password authentication is available', async () => {
            // Mock credentials with username/password but no access token or OIDC
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: undefined,
                oidcProviderName: undefined,
                username: 'testuser',
                password: 'testpass',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            await collectEvidences();

            // Verify that runCliAndGetOutput was never called
            expect(Utils.runCliAndGetOutput).not.toHaveBeenCalled();
        });

        it('should call runCliAndGetOutput when OIDC authentication is available', async () => {
            // Mock credentials with OIDC but no access token
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: undefined,
                oidcProviderName: 'github',
                username: 'testuser',
                password: 'testpass',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock OIDC token exchange using the existing mock
            const { OidcUtils } = require('../src/oidc-utils');
            (OidcUtils.exchangeOidcToken as jest.Mock).mockResolvedValue('oidc-access-token');

            // Mock HTTP client response
            const mockResponse = {
                message: { statusCode: 200 },
                readBody: jest.fn().mockResolvedValue(
                    JSON.stringify({
                        external_evidence_collection_supported: true,
                        evidence_file_size_limit_mb: 100,
                    }),
                ),
            };

            const { HttpClient } = require('@actions/http-client');
            HttpClient.mockImplementation(() => ({
                get: jest.fn().mockResolvedValue(mockResponse),
            }));

            // Mock file system operations: attestation file exists and has one path
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('file1.sigstore');
            mockFs.stat.mockResolvedValue({ size: 50 * 1024 * 1024 }); // 50 MB

            // Mock Utils.runCliAndGetOutput
            (Utils.runCliAndGetOutput as jest.Mock).mockResolvedValue('Evidence created successfully');

            await collectEvidences();

            // Verify that runCliAndGetOutput was called with correct parameters
            expect(Utils.runCliAndGetOutput).toHaveBeenCalledWith([
                'evd',
                'create',
                '--sigstore-bundle',
                'file1.sigstore',
                '--provider-id',
                'github',
            ]);
        });

        it('should not call runCliAndGetOutput when no access token is available', async () => {
            // Mock credentials with no authentication method
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: undefined,
                username: undefined,
                password: undefined,
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock file system operations: attestation file exists and has one path
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('file1.sigstore');

            await collectEvidences();

            // Verify that runCliAndGetOutput was never called
            expect(Utils.runCliAndGetOutput).not.toHaveBeenCalled();
        });

        it('should call runCliAndGetOutput only for files under size limit', async () => {
            process.env.RUNNER_TEMP = '/tmp';
            // Mock credentials
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: 'test-token',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock HTTP client response
            const mockResponse = {
                message: { statusCode: 200 },
                readBody: jest.fn().mockResolvedValue(
                    JSON.stringify({
                        external_evidence_collection_supported: true,
                        evidence_file_size_limit_mb: 50, // Set a small limit
                    }),
                ),
            };

            const { HttpClient } = require('@actions/http-client');
            HttpClient.mockImplementation(() => ({
                get: jest.fn().mockResolvedValue(mockResponse),
            }));

            // Mock file system operations
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('small.sigstore\nlarge.sigstore');
            mockFs.stat.mockImplementation((filePath: string) => {
                if (filePath === 'small.sigstore') {
                    return Promise.resolve({ size: 25 * 1024 * 1024 }); // 25 MB - under limit
                } else if (filePath === 'large.sigstore') {
                    return Promise.resolve({ size: 75 * 1024 * 1024 }); // 75 MB - over limit
                }
                return Promise.resolve({ size: 10 * 1024 * 1024 });
            });

            // Mock Utils.runCliAndGetOutput
            (Utils.runCliAndGetOutput as jest.Mock).mockResolvedValue('Evidence created successfully');

            await collectEvidences();

            // Verify that runCliAndGetOutput was called only for the small file
            expect(Utils.runCliAndGetOutput).toHaveBeenCalledTimes(1);
            expect(Utils.runCliAndGetOutput).toHaveBeenCalledWith([
                'evd',
                'create',
                '--sigstore-bundle',
                'small.sigstore',
                '--provider-id',
                'github',
            ]);

            // Verify that the small file was processed and the large file was not
            expect(wasFileProcessed('small.sigstore')).toBe(true);
            expect(wasFileProcessed('large.sigstore')).toBe(false);
        });

        it('should call runCliAndGetOutput when using default file size limit', async () => {
            process.env.RUNNER_TEMP = '/tmp';
            // Mock credentials
            const mockCredentials = {
                jfrogUrl: 'https://test-server.com',
                accessToken: 'test-token',
            };
            (Utils.collectJfrogCredentialsFromEnvVars as jest.Mock).mockReturnValue(mockCredentials);

            // Mock HTTP client response with undefined evidence_file_size_limit_mb
            const mockResponse = {
                message: { statusCode: 200 },
                readBody: jest.fn().mockResolvedValue(
                    JSON.stringify({
                        external_evidence_collection_supported: true,
                        // evidence_file_size_limit_mb is intentionally omitted
                    }),
                ),
            };

            const { HttpClient } = require('@actions/http-client');
            HttpClient.mockImplementation(() => ({
                get: jest.fn().mockResolvedValue(mockResponse),
            }));

            // Mock file system operations
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('file1.sigstore');
            mockFs.stat.mockResolvedValue({ size: 6 * 1024 * 1024 }); // 6 MB - under default limit

            // Mock Utils.runCliAndGetOutput
            (Utils.runCliAndGetOutput as jest.Mock).mockResolvedValue('Evidence created successfully');

            await collectEvidences();

            // Verify that runCliAndGetOutput was called with correct parameters
            expect(Utils.runCliAndGetOutput).toHaveBeenCalledWith([
                'evd',
                'create',
                '--sigstore-bundle',
                'file1.sigstore',
                '--provider-id',
                'github',
            ]);
        });
    });
});
