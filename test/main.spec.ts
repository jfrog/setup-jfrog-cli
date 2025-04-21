import * as os from 'os';
import * as core from '@actions/core';

import { DownloadDetails, JfrogCredentials, JWTTokenData, getAccessTokenFromCliOutput, Utils } from '../src/utils';
import * as jsYaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import semver = require('semver/preload');
import { getExecOutput, ExecOutput } from '@actions/exec';

jest.mock('os');
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
    },
    existsSync: jest.fn(),
}));
jest.mock('path');

const DEFAULT_CLI_URL: string = 'https://releases.jfrog.io/artifactory/jfrog-cli/';
const CUSTOM_CLI_URL: string = 'http://127.0.0.1:8081/artifactory/jfrog-cli-remote/';
// Config in JFrog CLI 1.46.3 and below
const V1_CONFIG: string = `eyJ2ZXJzaW9uIjoxLCJhcnRpZmFjdG9yeVVybCI6Imh0dHA6Ly8xMjcuMC4wLjE6ODA4MS9hcnRpZmFjdG9yeS8iLCJ1c2VyIjoiYWRtaW4iLCJwYXNzd2
    9yZCI6InBhc3N3b3JkIiwidG9rZW5SZWZyZXNoSW50ZXJ2YWwiOjYwLCJzZXJ2ZXJJZCI6ImxvY2FsIn0=`;
// Config in JFrog CLI 1.46.4 and above
const V2_CONFIG: string = `eyJ2ZXJzaW9uIjoyLCJ1cmwiOiJodHRwOi8vMTI3LjAuMC4xOjgwODEvIiwiYXJ0aWZhY3RvcnlVcmwiOiJodHRwOi8vMTI3LjAuMC4xOjgwODEvYXJ0aW
    ZhY3RvcnkvIiwiZGlzdHJpYnV0aW9uVXJsIjoiaHR0cDovLzEyNy4wLjAuMTo4MDgxL2Rpc3RyaWJ1dGlvbi8iLCJ4cmF5VXJsIjoiaHR0cDovLzEyNy4wLjAuMTo4MDgxL3hyYXkvIiwibWl
    zc2lvbkNvbnRyb2xVcmwiOiJodHRwOi8vMTI3LjAuMC4xOjgwODEvbWMvIiwicGlwZWxpbmVzVXJsIjoiaHR0cDovLzEyNy4wLjAuMTo4MDgxL3BpcGVsaW5lcy8iLCJ1c2VyIjoiYWRtaW4i
    LCJwYXNzd29yZCI6InBhc3N3b3JkIiwidG9rZW5SZWZyZXNoSW50ZXJ2YWwiOjYwLCJzZXJ2ZXJJZCI6ImxvY2FsIn0=`;
const V2_CONFIG_TOKEN: string = `eyJ2ZXJzaW9uIjoyLCJ1cmwiOiJodHRwOi8vMTI3LjAuMC4xOjgwODEvIiwiYXJ0aWZhY3RvcnlVcmwiOiJodHRwOi8vMTI3LjAuMC4xOjgwODEv
    YXJ0aWZhY3RvcnkvIiwiZGlzdHJpYnV0aW9uVXJsIjoiaHR0cDovLzEyNy4wLjAuMTo4MDgxL2Rpc3RyaWJ1dGlvbi8iLCJ4cmF5VXJsIjoiaHR0cDovLzEyNy4wLjAuMTo4MDgxL3hyYXkvI
    iwibWlzc2lvbkNvbnRyb2xVcmwiOiJodHRwOi8vMTI3LjAuMC4xOjgwODEvbWMvIiwicGlwZWxpbmVzVXJsIjoiaHR0cDovLzEyNy4wLjAuMTo4MDgxL3BpcGVsaW5lcy8iLCJhY2Nlc3NUb2
    tlbiI6ImV5SjJaWElpT2lJeUlpd2lkSGx3SWpvaVNsZFVJaXdpWVd4bklqb2lVbE15TlRZaUxDSnJhV1FpT2lJM1prNXJkWFJ6VXpkdVgwaGlZVE5FZDJGUlNUWk1hVE4zY2s5clZGUkZOMFp
    GYURWSlJFaEZOelYzSW4wLmV5SmxlSFFpT2lKN1hDSnlaWFp2WTJGaWJHVmNJanBjSW5SeWRXVmNJbjBpTENKemRXSWlPaUpxWm1GalFEQXhabk56YUc0eVkySnJNM0o1TVRFeE1IWmtaR1F4
    ZW5vMVhDOTFjMlZ5YzF3dllXUnRhVzRpTENKelkzQWlPaUpoY0hCc2FXVmtMWEJsY20xcGMzTnBiMjV6WEM5aFpHMXBiaUlzSW1GMVpDSTZJaXBBS2lJc0ltbHpjeUk2SW1wbVptVkFNREF3S
    Wl3aVpYaHdJam94Tmpnd09UWTJNRGt4TENKcFlYUWlPakUyTkRrME16QXdPVEVzSW1wMGFTSTZJakJqTWpRMU9UTmxMVGxrWWpVdE5EWXhZeTA1WW1JeUxXTm1ZalV3WldJM1kyRmlaaUo5Ll
    ZxNG15Q3dLaXVVUG9TMjFNZWxSbXJKMm9qZVlWQVFTU2F3NVF5OUxtcjFMek4wdmxGOG5iVmxYX1VYMkV4OGdGS0VvRndlM2RCMDRvT1A0OVlZQldQWjAweFlwZFFXenRaSENMejZHOUJoZ1p
    rV29QdHE3MjJ2b01ZOTA0Rk8xcHQ2RzllZEJNQ19odFJNRVMyaGNsQWR3dlVJLW5FN3BrQWE1aFVOZFQxNEU3b1Jna1M0dTM5anU2X1poZ2NWbGhWUDZ5ME5CQlRScjF2dUlkaWlpYmtnYTdD
    bU5NZldvOVRHS2ZPVU5TNklQbW81MjhfSkRHdVVyZWFjSllsbnV4cDQ5ZGRnZ2NVczR5Zk43eUxHaHNGSUxPei1HaHQxbXFrUWlEb2laeEJMdWlYeGEzdUdraF9CT3ZreGJMT2RNSFRLZjVkd
    zNsQzdqSXkzSmdudC1WQSIsInNlcnZlcklkIjoibG9jYWwifQ==`;

beforeEach(() => {
    ['JF_ENV_1', 'JF_ENV_2', 'ENV_JF_1', 'JF_ENV_LOCAL', 'JF_USER', 'JF_PASSWORD', 'JF_ACCESS_TOKEN'].forEach((envKey) => {
        delete process.env[envKey];
    });
});

test('Get Config Tokens', async () => {
    let configTokens: Set<string> = Utils.getConfigTokens();
    expect(configTokens.size).toBe(0);

    process.env['ENV_JF_1'] = 'ILLEGAL_CONFIG_TOKEN';
    configTokens = Utils.getConfigTokens();
    expect(configTokens.size).toBe(0);

    process.env['JF_ENV_1'] = 'DUMMY_CONFIG_TOKEN_1';
    configTokens = Utils.getConfigTokens();
    expect(configTokens).toStrictEqual(new Set(['DUMMY_CONFIG_TOKEN_1']));

    process.env['JF_ENV_2'] = 'DUMMY_CONFIG_TOKEN_2';
    configTokens = Utils.getConfigTokens();
    expect(configTokens).toStrictEqual(new Set(['DUMMY_CONFIG_TOKEN_1', 'DUMMY_CONFIG_TOKEN_2']));
});

describe('Collect credentials from environment variables test', () => {
    let cases: string[][] = [
        // [JF_URL, JF_ACCESS_TOKEN, JF_USER, JF_PASSWORD]
        ['', '', '', ''],
        ['https://my-server.io', 'my-access-token', '', ''],
        ['https://my-server.io', 'my-access-token', 'my-user', 'my-password'],
    ];

    test.each(cases)(
        'Checking JFrog credentials struct for url: %s, access token %s, username: %s, password: %s',
        (jfrogUrl, accessToken, username, password) => {
            process.env['JF_URL'] = jfrogUrl;
            process.env['JF_ACCESS_TOKEN'] = accessToken;
            process.env['JF_USER'] = username;
            process.env['JF_PASSWORD'] = password;

            let jfrogCredentials: JfrogCredentials = Utils.collectJfrogCredentialsFromEnvVars();
            if (jfrogUrl) {
                expect(jfrogCredentials.jfrogUrl).toEqual(jfrogUrl);
            } else {
                expect(jfrogCredentials.jfrogUrl).toBeFalsy();
            }

            if (accessToken) {
                expect(jfrogCredentials.accessToken).toEqual(accessToken);
            } else {
                expect(jfrogCredentials.accessToken).toBeFalsy();
            }

            if (username) {
                expect(jfrogCredentials.username).toEqual(username);
            } else {
                expect(jfrogCredentials.username).toBeFalsy();
            }

            if (password) {
                expect(jfrogCredentials.password).toEqual(password);
            } else {
                expect(jfrogCredentials.password).toBeFalsy();
            }
        },
    );
});

describe('Collect JFrog Credentials from env vars exceptions', () => {
    let cases: string[][] = [
        // [JF_USER, JF_PASSWORD, EXCEPTION]
        ['', 'password', 'JF_PASSWORD is configured, but the JF_USER environment variable was not set.'],
        ['user', '', 'JF_USER is configured, but the JF_PASSWORD or JF_ACCESS_TOKEN environment variables were not set.'],
    ];

    test.each(cases)('Checking JFrog credentials struct for username: %s, password: %s', (username, password, exception) => {
        process.env['JF_ACCESS_TOKEN'] = '';
        process.env['JF_USER'] = username;
        process.env['JF_PASSWORD'] = password;
        expect(() => Utils.collectJfrogCredentialsFromEnvVars()).toThrow(new Error(exception));
    });
});

async function testConfigCommand(expectedServerId: string) {
    // No url
    let configCommand: string[] | undefined = await Utils.getSeparateEnvConfigArgs({} as JfrogCredentials);
    expect(configCommand).toBe(undefined);

    let jfrogCredentials: JfrogCredentials = {} as JfrogCredentials;
    jfrogCredentials.jfrogUrl = DEFAULT_CLI_URL;

    // No credentials
    configCommand = await Utils.getSeparateEnvConfigArgs(jfrogCredentials);
    expect(configCommand).toStrictEqual([expectedServerId, '--url', DEFAULT_CLI_URL, '--interactive=false', '--overwrite=true']);

    // Basic authentication
    jfrogCredentials.username = 'user';
    jfrogCredentials.password = 'password';
    configCommand = await Utils.getSeparateEnvConfigArgs(jfrogCredentials);
    expect(configCommand).toStrictEqual([
        expectedServerId,
        '--url',
        DEFAULT_CLI_URL,
        '--interactive=false',
        '--overwrite=true',
        '--user',
        'user',
        '--password',
        'password',
    ]);

    // Access Token
    jfrogCredentials.username = '';
    jfrogCredentials.password = '';
    jfrogCredentials.accessToken = 'accessToken';
    configCommand = await Utils.getSeparateEnvConfigArgs(jfrogCredentials);
    expect(configCommand).toStrictEqual([
        expectedServerId,
        '--url',
        DEFAULT_CLI_URL,
        '--interactive=false',
        '--overwrite=true',
        '--access-token',
        'accessToken',
    ]);
}

describe('JFrog CLI Configuration', () => {
    afterAll(() => {
        delete process.env[Utils.JFROG_CLI_SERVER_IDS_ENV_VAR];
    });
    const myCore: jest.Mocked<typeof core> = core as any;

    test('Get separate env config', async () => {
        myCore.exportVariable = jest.fn().mockImplementation((name: string, val: string) => {
            process.env[name] = val;
        });

        // Before setting a custom server ID, expect the default server ID to be used.
        await testConfigCommand(Utils.getRunDefaultServerId());

        // Expect the custom server ID to be used.
        let customServerId: string = 'custom-server-id';
        jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === customServerId) {
                return 'custom-server-id'; // Return this value for the specific argument
            }
            return ''; // Default return value for other arguments
        });
        await testConfigCommand(customServerId);

        // Expect the servers env var to include both servers.
        const servers: string[] = Utils.getConfiguredJFrogServers();
        expect(servers).toStrictEqual([Utils.getRunDefaultServerId(), customServerId]);
    });

    test('Get default server ID', async () => {
        expect(Utils.getRunDefaultServerId()).toStrictEqual('setup-jfrog-cli-server');
    });
});

describe('JFrog CLI V1 URL Tests', () => {
    const myOs: jest.Mocked<typeof os> = os as any;
    let cases: string[][] = [
        ['win32' as NodeJS.Platform, 'amd64', 'jfrog.exe', 'v1/1.2.3/jfrog-cli-windows-amd64/jfrog.exe'],
        ['darwin' as NodeJS.Platform, 'amd64', 'jfrog', 'v1/1.2.3/jfrog-cli-mac-386/jfrog'],
        ['linux' as NodeJS.Platform, 'amd64', 'jfrog', 'v1/1.2.3/jfrog-cli-linux-amd64/jfrog'],
        ['linux' as NodeJS.Platform, 'arm64', 'jfrog', 'v1/1.2.3/jfrog-cli-linux-arm64/jfrog'],
        ['linux' as NodeJS.Platform, '386', 'jfrog', 'v1/1.2.3/jfrog-cli-linux-386/jfrog'],
        ['linux' as NodeJS.Platform, 'arm', 'jfrog', 'v1/1.2.3/jfrog-cli-linux-arm/jfrog'],
    ];

    test.each(cases)('CLI Url for %s-%s', (platform, arch, fileName, expectedUrl) => {
        myOs.platform.mockImplementation(() => <NodeJS.Platform>platform);
        myOs.arch.mockImplementation(() => arch);
        let cliUrl: string = Utils.getCliUrl('1.2.3', fileName, Utils.DEFAULT_DOWNLOAD_DETAILS);
        expect(cliUrl).toBe(DEFAULT_CLI_URL + expectedUrl);

        process.env.JF_ENV_LOCAL = V1_CONFIG;
        cliUrl = Utils.getCliUrl('1.2.3', fileName, Utils.extractDownloadDetails('jfrog-cli-remote', {} as JfrogCredentials));
        expect(cliUrl).toBe(CUSTOM_CLI_URL + expectedUrl);
    });
});

describe('JFrog CLI V2 URL Tests', () => {
    const myOs: jest.Mocked<typeof os> = os as any;
    let cases: string[][] = [
        ['win32' as NodeJS.Platform, 'amd64', 'jfrog.exe', 'v2/2.3.4/jfrog-cli-windows-amd64/jfrog.exe'],
        ['darwin' as NodeJS.Platform, 'amd64', 'jfrog', 'v2/2.3.4/jfrog-cli-mac-386/jfrog'],
        ['darwin' as NodeJS.Platform, 'arm64', 'jfrog', 'v2/2.3.4/jfrog-cli-mac-arm64/jfrog'],
        ['linux' as NodeJS.Platform, 'amd64', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-amd64/jfrog'],
        ['linux' as NodeJS.Platform, 'arm64', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-arm64/jfrog'],
        ['linux' as NodeJS.Platform, '386', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-386/jfrog'],
        ['linux' as NodeJS.Platform, 'arm', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-arm/jfrog'],
    ];

    test.each(cases)('CLI Url for %s-%s', (platform, arch, fileName, expectedUrl) => {
        myOs.platform.mockImplementation(() => <NodeJS.Platform>platform);
        myOs.arch.mockImplementation(() => arch);

        let cliUrl: string = Utils.getCliUrl('2.3.4', fileName, Utils.extractDownloadDetails('', {} as JfrogCredentials));
        expect(cliUrl).toBe(DEFAULT_CLI_URL + expectedUrl);

        process.env.JF_ENV_LOCAL = V2_CONFIG;
        cliUrl = Utils.getCliUrl('2.3.4', fileName, Utils.extractDownloadDetails('jfrog-cli-remote', {} as JfrogCredentials));
        expect(cliUrl).toBe(CUSTOM_CLI_URL + expectedUrl);
    });
});

test('Extract download details Tests', () => {
    for (let config of [V1_CONFIG, V2_CONFIG]) {
        process.env.JF_ENV_LOCAL = config;
        let downloadDetails: DownloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote', {} as JfrogCredentials);
        expect(downloadDetails.artifactoryUrl).toBe('http://127.0.0.1:8081/artifactory/');
        expect(downloadDetails.repository).toBe('jfrog-cli-remote');
        expect(downloadDetails.auth).toBe('Basic YWRtaW46cGFzc3dvcmQ=');
    }

    process.env.JF_ENV_LOCAL = V2_CONFIG_TOKEN;
    let downloadDetails: DownloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote', {} as JfrogCredentials);
    expect(downloadDetails.artifactoryUrl).toBe('http://127.0.0.1:8081/artifactory/');
    expect(downloadDetails.repository).toBe('jfrog-cli-remote');
    expect(downloadDetails.auth).toBe(
        `Bearer eyJ2ZXIiOiIyIiwidHlwIjoiSldUIiwiYWxnIjoiUlMyNTYiLCJraWQiOiI3Zk5rdXRzUzduX0hiYTNEd2FRSTZMaTN3ck9rVFRFN0ZFaDVJREhFNzV3In0.eyJleHQiOiJ7XCJyZXZvY2FibGVcIjpcInRydWVcIn0iLCJzdWIiOiJqZmFjQDAxZnNzaG4yY2JrM3J5MTExMHZkZGQxeno1XC91c2Vyc1wvYWRtaW4iLCJzY3AiOiJhcHBsaWVkLXBlcm1pc3Npb25zXC9hZG1pbiIsImF1ZCI6IipAKiIsImlzcyI6ImpmZmVAMDAwIiwiZXhwIjoxNjgwOTY2MDkxLCJpYXQiOjE2NDk0MzAwOTEsImp0aSI6IjBjMjQ1OTNlLTlkYjUtNDYxYy05YmIyLWNmYjUwZWI3Y2FiZiJ9.Vq4myCwKiuUPoS21MelRmrJ2ojeYVAQSSaw5Qy9Lmr1LzN0vlF8nbVlX_UX2Ex8gFKEoFwe3dB04oOP49YYBWPZ00xYpdQWztZHCLz6G9BhgZkWoPtq722voMY904FO1pt6G9edBMC_htRMES2hclAdwvUI-nE7pkAa5hUNdT14E7oRgkS4u39ju6_ZhgcVlhVP6y0NBBTRr1vuIdiiibkga7CmNMfWo9TGKfOUNS6IPmo528_JDGuUreacJYlnuxp49ddggcUs4yfN7yLGhsFILOz-Ght1mqkQiDoiZxBLuiXxa3uGkh_BOvkxbLOdMHTKf5dw3lC7jIy3Jgnt-VA`,
    );

    process.env.JF_ENV_LOCAL = '';
    let jfrogCredentials1: JfrogCredentials = {} as JfrogCredentials;
    jfrogCredentials1.jfrogUrl = 'http://127.0.0.1:8081';
    jfrogCredentials1.username = 'user';
    jfrogCredentials1.password = 'password';
    downloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote', jfrogCredentials1);
    expect(downloadDetails.artifactoryUrl).toBe('http://127.0.0.1:8081/artifactory');
    expect(downloadDetails.repository).toBe('jfrog-cli-remote');
    expect(downloadDetails.auth).toBe('Basic dXNlcjpwYXNzd29yZA==');

    let jfrogCredentials2: JfrogCredentials = {} as JfrogCredentials;
    jfrogCredentials2.jfrogUrl = 'http://127.0.0.1:8081';
    jfrogCredentials2.accessToken = 'YWNjZXNzVG9rZW4=';
    downloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote', jfrogCredentials2);
    expect(downloadDetails.artifactoryUrl).toBe('http://127.0.0.1:8081/artifactory');
    expect(downloadDetails.repository).toBe('jfrog-cli-remote');
    expect(downloadDetails.auth).toBe(`Bearer YWNjZXNzVG9rZW4=`);
});

test('User agent', () => {
    let userAgent: string = Utils.USER_AGENT;
    let split: string[] = userAgent.split('/');
    expect(split).toHaveLength(2);
    expect(split[0]).toBe('setup-jfrog-cli-github-action');
    expect(split[1]).toMatch(/\d*.\d*.\d*/);
});

describe('extractTokenUser', () => {
    it('should extract user from subject starting with jfrt@', () => {
        const subject: string = 'jfrt@/users/johndoe';
        const result: string = Utils.extractTokenUser(subject);
        expect(result).toBe('johndoe');
    });

    it('should extract user from subject containing /users/', () => {
        const subject: string = '/users/johndoe';
        const result: string = Utils.extractTokenUser(subject);
        expect(result).toBe('johndoe');
    });

    it('should return original subject when it does not start with jfrt@ or contain /users/', () => {
        const subject: string = 'johndoe';
        const result: string = Utils.extractTokenUser(subject);
        expect(result).toBe(subject);
    });

    it('should handle empty subject', () => {
        const subject: string = '';
        const result: string = Utils.extractTokenUser(subject);
        expect(result).toBe(subject);
    });
});

describe('decodeOidcToken', () => {
    it('should decode valid OIDC token', () => {
        const oidcToken: string =
            Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64') +
            '.eyJzdWIiOiJ0ZXN0In0.' +
            Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64');
        const result: JWTTokenData = Utils.decodeOidcToken(oidcToken);
        expect(result).toEqual({ sub: 'test' });
    });

    it('should throw error for OIDC token with invalid format', () => {
        const oidcToken: string = 'invalid.token.format';
        expect(() => Utils.decodeOidcToken(oidcToken)).toThrow(SyntaxError);
    });

    it('should throw error for OIDC token without subject', () => {
        const oidcToken: string =
            Buffer.from(JSON.stringify({ notSub: 'test' })).toString('base64') +
            '.eyJub3RTdWIiOiJ0ZXN0In0.' +
            Buffer.from(JSON.stringify({ notSub: 'test' })).toString('base64');
        expect(() => Utils.decodeOidcToken(oidcToken)).toThrow('OIDC invalid access token format');
    });
});

describe('Job Summaries', () => {
    describe('Job summaries sanity', () => {
        it('should not crash if no files were found', async () => {
            expect(async () => await Utils.setMarkdownAsJobSummary()).not.toThrow();
        });
    });
    describe('Command Summaries Disable Flag', () => {
        const myCore: jest.Mocked<typeof core> = core as any;
        beforeEach(() => {
            delete process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
            delete process.env.RUNNER_TEMP;
        });

        it('should not set JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR if disable-job-summary is true', () => {
            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return true;
            });
            Utils.setCliEnv();
            expect(process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV]).toBeUndefined();
        });

        it('should set JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR if disable-job-summary is false', () => {
            process.env.RUNNER_TEMP = '/tmp';
            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return false;
            });
            myCore.exportVariable = jest.fn().mockImplementation((name: string, val: string) => {
                process.env[name] = val;
            });
            Utils.setCliEnv();
            expect(process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV]).toBe('/tmp');
        });

        it('should handle self-hosted machines and set JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR based on OS temp dir', () => {
            // Mock os.tmpdir() to simulate different OS temp directories
            const tempDir: string = '/mocked-temp-dir';
            jest.spyOn(os, 'tmpdir').mockReturnValue(tempDir);

            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return false;
            });
            myCore.exportVariable = jest.fn().mockImplementation((name: string, val: string) => {
                process.env[name] = val;
            });

            Utils.setCliEnv();

            expect(process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV]).toBe(tempDir);
        });

        it('Should throw error when failing to get temp dir', () => {
            // Mock os.tmpdir() to return an empty string
            jest.spyOn(os, 'tmpdir').mockReturnValue('');

            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return false;
            });
            myCore.exportVariable = jest.fn().mockImplementation((name: string, val: string) => {
                process.env[name] = val;
            });

            // Expect the function to throw an error
            expect(() => Utils.setCliEnv()).toThrow('Failed to determine the temporary directory');

            // Restore the mock to avoid affecting other tests
            jest.restoreAllMocks();
        });
    });
});

describe('isJobSummarySupported', () => {
    const LATEST_CLI_VERSION: string = 'latest';

    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('should return true if the version is the latest', () => {
        jest.spyOn(core, 'getInput').mockReturnValue(LATEST_CLI_VERSION);
        expect(Utils.isJobSummarySupported()).toBe(true);
    });

    it('should return true if the version is greater than or equal to the minimum supported version', () => {
        const version: string = '2.66.0';
        jest.spyOn(core, 'getInput').mockReturnValue(version);
        expect(Utils.isJobSummarySupported()).toBe(true);
    });

    it('should return false if the version is less than the minimum supported version', () => {
        const version: string = '2.65.0';
        jest.spyOn(core, 'getInput').mockReturnValue(version);
        expect(Utils.isJobSummarySupported()).toBe(false);
    });
});

describe('Utils.removeJFrogServers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should remove only the custom server ID if defined', async () => {
        const customServerId: string = 'custom-server-id';
        jest.spyOn(Utils as any, 'getInputtedCustomId').mockReturnValue(customServerId);
        jest.spyOn(Utils as any, 'runCli').mockResolvedValue(undefined);

        await Utils.removeJFrogServers();

        expect(core.info).toHaveBeenCalledWith(`The value of custom is: '${customServerId}'`);
        expect(core.debug).toHaveBeenCalledWith(`Removing custom server ID: '${customServerId}'...`);
        expect(Utils.runCli).toHaveBeenCalledWith(['c', 'rm', customServerId, '--quiet']);
    });

    it('should remove all configured server IDs if no custom server ID is defined', async () => {
        jest.spyOn(Utils as any, 'getInputtedCustomId').mockReturnValue(undefined);
        const serverIds: string[] = ['server1', 'server2'];
        jest.spyOn(Utils as any, 'getConfiguredJFrogServers').mockReturnValue(serverIds);
        jest.spyOn(Utils as any, 'runCli').mockResolvedValue(undefined);

        await Utils.removeJFrogServers();

        expect(core.info).toHaveBeenCalledWith(`The value of custom is: 'undefined'`);
        for (const serverId of serverIds) {
            expect(core.debug).toHaveBeenCalledWith(`Removing server ID: '${serverId}'...`);
            expect(Utils.runCli).toHaveBeenCalledWith(['c', 'rm', serverId, '--quiet']);
        }
        expect(core.exportVariable).toHaveBeenCalledWith(Utils.JFROG_CLI_SERVER_IDS_ENV_VAR, '');
    });
});

describe('getApplicationKey', () => {
    const mockReadFile: jest.Mock = fs.promises.readFile as jest.Mock;
    const mockExistsSync: jest.Mock = fs.existsSync as jest.Mock;
    const mockPath: jest.Mock = path.join as jest.Mock;

    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('should return application key from config file', async () => {
        mockPath.mockReturnValue('mocked-path');
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(jsYaml.dump({ application: { key: 'config-app-key' } }));

        const result: string = await (Utils as any).getApplicationKey();
        expect(result).toBe('config-app-key');
        expect(mockReadFile).toHaveBeenCalledWith('mocked-path', 'utf-8');
    });

    it('should return empty string if config file does not exist', async () => {
        mockPath.mockReturnValue('mocked-path');
        mockExistsSync.mockReturnValue(false);

        const result: string = await (Utils as any).getApplicationKey();
        expect(result).toBe('');
        expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('should return empty string if config file is empty', async () => {
        mockPath.mockReturnValue('mocked-path');
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue('');

        const result: string = await (Utils as any).getApplicationKey();
        expect(result).toBe('');
    });

    it('should return empty string if application root is not found in config file', async () => {
        mockPath.mockReturnValue('mocked-path');
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(jsYaml.dump({}));

        const result: string = await (Utils as any).getApplicationKey();
        expect(result).toBe('');
    });

    it('should return empty string if application key is not found in config file', async () => {
        mockPath.mockReturnValue('mocked-path');
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValue(jsYaml.dump({ application: {} }));

        const result: string = await (Utils as any).getApplicationKey();
        expect(result).toBe('');
    });
});

describe('Test correct encoding of badge URL', () => {
    describe('getUsageBadge', () => {
        beforeEach(() => {
            process.env.JF_URL = 'https://example.jfrog.io/';
            process.env.GITHUB_RUN_ID = '123';
        });

        afterEach(() => {
            delete process.env.JF_URL;
            delete process.env.GITHUB_WORKFLOW;
            delete process.env.GITHUB_REPOSITORY;
            delete process.env.GITHUB_RUN_ID;
        });

        it('should return the correct usage badge URL', () => {
            process.env.GITHUB_WORKFLOW = 'test-job';
            process.env.GITHUB_REPOSITORY = 'test/repo';
            const expectedBadge: string = '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=test-job&run_id=123&git_repo=test%2Frepo)';
            expect(Utils.getUsageBadge()).toBe(expectedBadge);
        });

        it('should URL encode the job ID and repository with spaces', () => {
            process.env.GITHUB_WORKFLOW = 'test job';
            process.env.GITHUB_REPOSITORY = 'test repo';
            const expectedBadge: string = '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=test+job&run_id=123&git_repo=test+repo)';
            expect(Utils.getUsageBadge()).toBe(expectedBadge);
        });

        it('should URL encode the job ID and repository with special characters', () => {
            process.env.GITHUB_WORKFLOW = 'test/job@workflow';
            process.env.GITHUB_REPOSITORY = 'test/repo@special';
            const expectedBadge: string =
                '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=test%2Fjob%40workflow&run_id=123&git_repo=test%2Frepo%40special)';
            expect(Utils.getUsageBadge()).toBe(expectedBadge);
        });

        it('should handle missing environment variables gracefully', () => {
            delete process.env.GITHUB_WORKFLOW;
            delete process.env.GITHUB_REPOSITORY;
            const expectedBadge: string = '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=&run_id=123&git_repo=)';
            expect(Utils.getUsageBadge()).toBe(expectedBadge);
        });
    });
});

describe('getSeparateEnvConfigArgs', () => {
    beforeEach(() => {
        jest.spyOn(core, 'getInput').mockReturnValue('');
        jest.spyOn(core, 'setSecret').mockImplementation(() => {});
        (getExecOutput as jest.Mock).mockResolvedValueOnce({
            exitCode: 0,
            stdout: '{"AccessToken":"test-access-token","Username":"test-user"}',
            stderr: '',
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return undefined if URL is not set', async () => {
        const creds: JfrogCredentials = {} as JfrogCredentials;
        expect(await Utils.getSeparateEnvConfigArgs(creds)).toBeUndefined();
    });

    it('should use access token if provided', async () => {
        const creds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            accessToken: 'abc',
        } as JfrogCredentials;
        const args: string[] | undefined = await Utils.getSeparateEnvConfigArgs(creds);
        expect(args).toContain('--access-token');
        expect(args).toContain('abc');
    });

    it('should use username and password if provided and access token is not', async () => {
        const creds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            username: 'admin',
            password: '1234',
        } as JfrogCredentials;
        const args: string[] | undefined = await Utils.getSeparateEnvConfigArgs(creds);
        expect(args).toContain('--user');
        expect(args).toContain('admin');
        expect(args).toContain('--password');
        expect(args).toContain('1234');
    });

    it('should not include conflicting or duplicate arguments in the config command', async () => {
        const jfrogCredentials: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            username: 'test-user',
            password: 'test-password',
            accessToken: 'test-access-token',
            oidcProviderName: 'oidc-integration-test-provider',
            oidcAudience: 'jfrog-github',
            oidcTokenId: '',
        };

        const configArgs: string[] | undefined = await Utils.getSeparateEnvConfigArgs(jfrogCredentials);

        // Ensure the command does not include conflicting or duplicate arguments
        const configString: string = configArgs?.join(' ') || '';
        expect(configString).toContain('--url https://example.jfrog.io');
        expect(configString).toContain('--interactive=false');
        expect(configString).toContain('--overwrite=true');
        expect(configString).toContain('--access-token test-access-token');
        expect(configString).not.toContain('--oidc-provider-name=oidc-integration-test-provider');
        expect(configString).not.toContain('--username test-user');
        expect(configString).not.toContain('--oidc-audience=jfrog-github');

    });
    it('Access Token Auth should be prioritized over basic auth', async () => {
        const jfrogCredentials: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            username: 'test-user',
            password: 'test-password',
            accessToken: 'test-access-token',
            oidcProviderName: '',
            oidcAudience: '',
            oidcTokenId: '',
        };

        const configArgs: string[] | undefined = await Utils.getSeparateEnvConfigArgs(jfrogCredentials);

        // Ensure the command does not include conflicting or duplicate arguments
        const configString: string = configArgs?.join(' ') || '';
        expect(configString).toContain('--url https://example.jfrog.io');
        expect(configString).toContain('--interactive=false');
        expect(configString).toContain('--overwrite=true');
        expect(configString).toContain('--access-token test-access-token');
        expect(configString).not.toContain('--username test-user');
    });
});

describe('handleOidcAuth', () => {
    const credentials: JfrogCredentials = {
        jfrogUrl: 'https://test.jfrog.io',
        username: undefined,
        password: undefined,
        accessToken: undefined,
        oidcProviderName: 'test-provider',
        oidcAudience: 'jfrog-github',
        oidcTokenId: undefined,
    };

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should throw if GitHub fails to return ID token', async () => {
        jest.spyOn(core, 'getIDToken').mockRejectedValue(new Error('mock failure'));
        const creds: any = { ...credentials };
        await expect(Utils.handleOidcAuth(creds)).rejects.toThrow('Failed to fetch OpenID Connect JSON Web Token');
    });

    it('should call setOidcTokenID when CLI version is >= 2.75.0', async () => {
        jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === Utils.CLI_VERSION_ARG) return '2.75.0';
            return '';
        });
        jest.spyOn(semver, 'gte').mockReturnValue(true);
        jest.spyOn(Utils as any, 'getIdToken').mockResolvedValue('mock-token-id');

        const result: JfrogCredentials = await (Utils as any).handleOidcAuth(credentials);
        expect(result.oidcTokenId).toBe('mock-token-id');
    });

    it('should call manualOIDCExchange when CLI version is < 2.75.0', async () => {
        jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === Utils.CLI_VERSION_ARG) return '2.74.0';
            if (name === 'oidc-audience') return 'aud';
            return '';
        });
        jest.spyOn(semver, 'gte').mockReturnValue(false);
        jest.spyOn(core, 'getIDToken').mockResolvedValue('dummy-jwt');
        jest.spyOn(Utils as any, 'getApplicationKey').mockResolvedValue('dummy-app-key');

        jest.spyOn(Utils as any, 'exchangeOidcAndSetAsAccessToken').mockResolvedValue({
            ...credentials,
            accessToken: 'legacy-token',
        });

        const result: JfrogCredentials = await (Utils as any).handleOidcAuth(credentials);

        expect(result.accessToken).toBe('legacy-token');
    });

    it('should fallback to manualOIDCExchange when download repository is set even if CLI is >= 2.75.0', async () => {
        jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === Utils.CLI_VERSION_ARG) return '2.75.0';
            if (name === Utils.CLI_REMOTE_ARG) return 'jfrog-cli-remote'; // Simulate presence of remote arg
            if (name === 'oidc-audience') return 'aud';
            return '';
        });
        jest.spyOn(semver, 'gte').mockReturnValue(true);
        jest.spyOn(core, 'getIDToken').mockResolvedValue('dummy-jwt');
        jest.spyOn(Utils as any, 'getApplicationKey').mockResolvedValue('dummy-app-key');
        jest.spyOn(Utils as any, 'exchangeOidcAndSetAsAccessToken').mockResolvedValue({
            ...credentials,
            accessToken: 'forced-manual-token',
        });

        const result: JfrogCredentials = await (Utils as any).handleOidcAuth(credentials);
        expect(result.accessToken).toBe('forced-manual-token');
    });

    it('should not include OIDC flags for unsupported versions', async () => {
        const creds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            oidcProviderName: 'setup-jfrog-cli',
            oidcTokenId: 'abc-123',
            oidcAudience: 'jfrog-github',
        } as JfrogCredentials;

        jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === Utils.CLI_VERSION_ARG) return '2.74.0'; // Unsupported version
            return '';
        });

        const args: string[] | undefined = await Utils.getSeparateEnvConfigArgs(creds);
        expect(args).not.toContain('--oidc-provider-name=setup-jfrog-cli');
        expect(args).not.toContain('--oidc-provider-type=Github');
        expect(args).not.toContain('--oidc-token-id=abc-123');
        expect(args).not.toContain('--oidc-audience=jfrog-github');
    });
});

describe('getAccessTokenFromCliOutput', () => {
    it('should parse valid JSON input', () => {
        const input: string = '{"AccessToken":"test-access-token","Username":"test-user"}';
        const result: { accessToken: string; username: string } = getAccessTokenFromCliOutput(input);

        expect(result).toEqual({
            accessToken: 'test-access-token',
            username: 'test-user',
        });
    });

    it('should parse valid regex input', () => {
        const input: string = '{ AccessToken: test Username: test-user }';
        const result: { accessToken: string; username: string } = getAccessTokenFromCliOutput(input);

        expect(result).toEqual({
            accessToken: 'test',
            username: 'test-user',
        });
    });

    it('should throw an error for invalid input format', () => {
        const input: string = 'Invalid format';
        expect(() => getAccessTokenFromCliOutput(input)).toThrow('Failed to extract values. Input format is invalid.');
    });

    it('should throw an error for empty input', () => {
        const input: string = '';
        expect(() => getAccessTokenFromCliOutput(input)).toThrow('Input is empty. Cannot extract values.');
    });
});

describe('exchangeOIDCToken', () => {
    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });
    it('should return access token when CLI command succeeds', async () => {
        const mockOutput: ExecOutput = {
            exitCode: 0,
            stdout: '{"AccessToken":"test-access-token","Username":"test-user"}',
            stderr: '',
        };
        (getExecOutput as jest.Mock).mockResolvedValue(mockOutput);

        const result: string | undefined = await Utils.exchangeOIDCToken(
            'test-provider',
            'test-token-id',
            'https://example.jfrog.io',
            'test-audience',
        );

        expect(result).toBe('test-access-token');
        expect(core.setSecret).toHaveBeenCalledWith('test-access-token');
        expect(core.setOutput).toHaveBeenCalledWith('oidc-token', 'test-access-token');
        expect(core.setSecret).toHaveBeenCalledWith('test-user');
        expect(core.setOutput).toHaveBeenCalledWith('oidc-user', 'test-user');
    });

    it('should throw an error if CLI command fails', async () => {
        const mockOutput: ExecOutput = {
            exitCode: 1,
            stdout: '',
            stderr: 'Error occurred',
        };
        (getExecOutput as jest.Mock).mockResolvedValue(mockOutput);

        await expect(Utils.exchangeOIDCToken('test-provider', 'test-token-id', 'https://example.jfrog.io', 'test-audience')).rejects.toThrow(
            'CLI command failed with exit code 1: Error occurred',
        );
    });

    it('should throw an error if CLI execution throws an exception', async () => {
        (getExecOutput as jest.Mock).mockRejectedValue(new Error('Execution failed'));

        await expect(Utils.exchangeOIDCToken('test-provider', 'test-token-id', 'https://example.jfrog.io', 'test-audience')).rejects.toThrow(
            'Failed to exchange OIDC token with an access token: Execution failed',
        );
    });
});
