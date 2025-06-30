import * as os from 'os';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

import { Utils } from '../src/utils';
import { DownloadDetails, JfrogCredentials } from '../src/types';

jest.mock('os');
jest.mock('@actions/exec');
jest.mock('@actions/core');

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

    test('collectJfrogCredentialsFromEnvVars should return default values when no environment variables are set', () => {
        // Ensure no relevant environment variables are set
        delete process.env['JF_URL'];
        delete process.env['JF_ACCESS_TOKEN'];
        delete process.env['JF_USER'];
        delete process.env['JF_PASSWORD'];

        // Call the function
        const jfrogCredentials: JfrogCredentials = Utils.collectJfrogCredentialsFromEnvVars();

        // Verify default values
        expect(jfrogCredentials.jfrogUrl).toBeUndefined();
        expect(jfrogCredentials.accessToken).toBeUndefined();
        expect(jfrogCredentials.username).toBeUndefined();
        expect(jfrogCredentials.password).toBeUndefined();
        expect(jfrogCredentials.oidcAudience).toEqual('');
    });
});

async function testConfigCommand(expectedServerId: string) {
    // No url
    let configCommand: string[] | undefined = await Utils.getJfrogCliConfigArgs({} as JfrogCredentials);
    expect(configCommand).toBe(undefined);

    let jfrogCredentials: JfrogCredentials = {} as JfrogCredentials;
    jfrogCredentials.jfrogUrl = DEFAULT_CLI_URL;

    // No credentials
    configCommand = await Utils.getJfrogCliConfigArgs(jfrogCredentials);
    expect(configCommand).toStrictEqual([expectedServerId, '--url', DEFAULT_CLI_URL, '--interactive=false', '--overwrite=true']);

    // Basic authentication
    jfrogCredentials.username = 'user';
    jfrogCredentials.password = 'password';
    configCommand = await Utils.getJfrogCliConfigArgs(jfrogCredentials);
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
    configCommand = await Utils.getJfrogCliConfigArgs(jfrogCredentials);
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

describe('getJfrogCliConfigArgs', () => {
    beforeEach(() => {
        jest.spyOn(core, 'getInput').mockReturnValue('');
        jest.spyOn(core, 'setSecret').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('should return undefined if URL is not set', async () => {
        const creds: JfrogCredentials = {} as JfrogCredentials;
        expect(await Utils.getJfrogCliConfigArgs(creds)).toBeUndefined();
    });

    it('should use access token if provided', async () => {
        const creds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            accessToken: 'abc',
        } as JfrogCredentials;
        const args: string[] | undefined = await Utils.getJfrogCliConfigArgs(creds);
        expect(args).toContain('--access-token');
        expect(args).toContain('abc');
    });

    it('should use username and password if provided and access token is not', async () => {
        const creds: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            username: 'admin',
            password: '1234',
        } as JfrogCredentials;
        const args: string[] | undefined = await Utils.getJfrogCliConfigArgs(creds);
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
            // Notice this isn't the access token expected, expected OIDC exchanged token
            accessToken: 'test-access-token',
            oidcProviderName: 'oidc-integration-test-provider',
            oidcAudience: 'jfrog-github',
            oidcTokenId: '',
        };
        jest.spyOn(core, 'getIDToken').mockResolvedValue('mock-token-id');
        jest.spyOn(exec, 'getExecOutput').mockResolvedValue({
            stdout: '{AccessToken: abc Username: def }',
            exitCode: 0,
            stderr: '',
        });
        const configArgs: string[] | undefined = await Utils.getJfrogCliConfigArgs(jfrogCredentials);

        // Ensure we generate a config command with access token auth after exchanging OIDC token
        const configString: string = configArgs?.join(' ') || '';
        expect(configString).toContain('--url https://example.jfrog.io');
        expect(configString).toContain('--interactive=false');
        expect(configString).toContain('--overwrite=true');
        expect(configString).toContain('--access-token abc');
        expect(configString).not.toContain('--oidc-provider-name=oidc-integration-test-provider');
        expect(configString).not.toContain('--username test-user');
        expect(configString).not.toContain('--oidc-audience=jfrog-github');
    });

    it('should use access token when provided with password', async () => {
        const jfrogCredentials: JfrogCredentials = {
            jfrogUrl: 'https://example.jfrog.io',
            username: 'test-user',
            password: 'test-password',
            accessToken: 'test-access-token',
            oidcProviderName: '',
            oidcAudience: '',
            oidcTokenId: '',
        };
        const configArgs: string[] | undefined = await Utils.getJfrogCliConfigArgs(jfrogCredentials);
        const configString: string = configArgs?.join(' ') || '';
        expect(configString).toContain('--url https://example.jfrog.io');
        expect(configString).toContain('--interactive=false');
        expect(configString).toContain('--overwrite=true');
        expect(configString).toContain('--access-token test-access-token');
        expect(configString).not.toContain('--username test-user');
    });
});
