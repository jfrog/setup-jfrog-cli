import os from 'os';
import { Utils, DownloadDetails } from '../src/utils';
jest.mock('os');

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
    ['JF_ARTIFACTORY_1', 'JF_ARTIFACTORY_2', 'ARTIFACTORY_JF_1', 'JF_ENV_1', 'JF_ENV_2', 'ENV_JF_1', 'JF_ENV_LOCAL'].forEach((envKey) => {
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

test('Get legacy Config Tokens', async () => {
    process.env['ARTIFACTORY_JF_1'] = 'ILLEGAL_CONFIG_TOKEN';
    expect(Utils.getConfigTokens().size).toBe(0);

    process.env['JF_ARTIFACTORY_1'] = 'DUMMY_CONFIG_TOKEN_1';
    expect(Utils.getConfigTokens()).toStrictEqual(new Set(['DUMMY_CONFIG_TOKEN_1']));

    process.env['JF_ARTIFACTORY_2'] = 'DUMMY_CONFIG_TOKEN_2';
    expect(Utils.getConfigTokens()).toStrictEqual(new Set(['DUMMY_CONFIG_TOKEN_1', 'DUMMY_CONFIG_TOKEN_2']));

    process.env['JF_ENV_1'] = 'DUMMY_CONFIG_TOKEN_1';
    process.env['JF_ENV_2'] = 'DUMMY_CONFIG_TOKEN_3';
    expect(Utils.getConfigTokens()).toStrictEqual(new Set(['DUMMY_CONFIG_TOKEN_1', 'DUMMY_CONFIG_TOKEN_2', 'DUMMY_CONFIG_TOKEN_3']));
});

test('Get separate env config', async () => {
    // No url
    let configCommand: string[] | undefined = Utils.getSeparateEnvConfigArgs();
    expect(configCommand).toBe(undefined);

    process.env['JF_URL'] = DEFAULT_CLI_URL;

    // No credentials
    configCommand = Utils.getSeparateEnvConfigArgs();
    expect(configCommand).toStrictEqual([Utils.SETUP_JFROG_CLI_SERVER_ID, '--url', DEFAULT_CLI_URL]);

    // Basic authentication
    process.env['JF_USER'] = 'user';
    process.env['JF_PASSWORD'] = 'password';
    configCommand = Utils.getSeparateEnvConfigArgs();
    expect(configCommand).toStrictEqual([Utils.SETUP_JFROG_CLI_SERVER_ID, '--url', DEFAULT_CLI_URL, '--user', 'user', '--password', 'password']);

    // Access Token
    process.env['JF_USER'] = '';
    process.env['JF_PASSWORD'] = '';
    process.env['JF_ACCESS_TOKEN'] = 'accessToken';
    configCommand = Utils.getSeparateEnvConfigArgs();
    expect(configCommand).toStrictEqual([Utils.SETUP_JFROG_CLI_SERVER_ID, '--url', DEFAULT_CLI_URL, '--access-token', 'accessToken']);
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
        let cliUrl: string = Utils.getCliUrl('1', '1.2.3', fileName, Utils.DEFAULT_DOWNLOAD_DETAILS);
        expect(cliUrl).toBe(DEFAULT_CLI_URL + expectedUrl);

        process.env.JF_ENV_LOCAL = V1_CONFIG;
        cliUrl = Utils.getCliUrl('1', '1.2.3', fileName, Utils.extractDownloadDetails('jfrog-cli-remote'));
        expect(cliUrl).toBe(CUSTOM_CLI_URL + expectedUrl);
    });
});

describe('JFrog CLI V2 URL Tests', () => {
    const myOs: jest.Mocked<typeof os> = os as any;
    let cases: string[][] = [
        ['win32' as NodeJS.Platform, 'amd64', 'jfrog.exe', 'v2/2.3.4/jfrog-cli-windows-amd64/jfrog.exe'],
        ['darwin' as NodeJS.Platform, 'amd64', 'jfrog', 'v2/2.3.4/jfrog-cli-mac-386/jfrog'],
        ['linux' as NodeJS.Platform, 'amd64', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-amd64/jfrog'],
        ['linux' as NodeJS.Platform, 'arm64', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-arm64/jfrog'],
        ['linux' as NodeJS.Platform, '386', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-386/jfrog'],
        ['linux' as NodeJS.Platform, 'arm', 'jfrog', 'v2/2.3.4/jfrog-cli-linux-arm/jfrog'],
    ];

    test.each(cases)('CLI Url for %s-%s', (platform, arch, fileName, expectedUrl) => {
        myOs.platform.mockImplementation(() => <NodeJS.Platform>platform);
        myOs.arch.mockImplementation(() => arch);

        let cliUrl: string = Utils.getCliUrl('2', '2.3.4', fileName, Utils.extractDownloadDetails(''));
        expect(cliUrl).toBe(DEFAULT_CLI_URL + expectedUrl);

        process.env.JF_ENV_LOCAL = V2_CONFIG;
        cliUrl = Utils.getCliUrl('2', '2.3.4', fileName, Utils.extractDownloadDetails('jfrog-cli-remote'));
        expect(cliUrl).toBe(CUSTOM_CLI_URL + expectedUrl);
    });
});

test('Extract download details Tests', () => {
    for (let config of [V1_CONFIG, V2_CONFIG]) {
        process.env.JF_ENV_LOCAL = config;
        let downloadDetails: DownloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote');
        expect(downloadDetails.artifactoryUrl).toBe('http://127.0.0.1:8081/artifactory/');
        expect(downloadDetails.repository).toBe('jfrog-cli-remote');
        expect(downloadDetails.auth).toBe('Basic YWRtaW46cGFzc3dvcmQ=');
    }

    process.env.JF_ENV_LOCAL = V2_CONFIG_TOKEN;
    let downloadDetails: DownloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote');
    expect(downloadDetails.artifactoryUrl).toBe('http://127.0.0.1:8081/artifactory/');
    expect(downloadDetails.repository).toBe('jfrog-cli-remote');
    expect(downloadDetails.auth).toBe(`Bearer ZXlKMlpYSWlPaUl5SWl3aWRIbHdJam9pU2xkVUlpd2lZV3huSWpvaVVsTXlOVFlpTENKcmFXUWlPaUkzWms1cmRYUnpVemR1WDB\
oaVlUTkVkMkZSU1RaTWFUTjNjazlyVkZSRk4wWkZhRFZKUkVoRk56VjNJbjAuZXlKbGVIUWlPaUo3WENKeVpYWnZZMkZpYkdWY0lqcGNJblJ5ZFdWY0luMGlMQ0p6ZFdJaU9pSnFabUZqUURBeFpu\
TnphRzR5WTJKck0zSjVNVEV4TUhaa1pHUXhlbm8xWEM5MWMyVnljMXd2WVdSdGFXNGlMQ0p6WTNBaU9pSmhjSEJzYVdWa0xYQmxjbTFwYzNOcGIyNXpYQzloWkcxcGJpSXNJbUYxWkNJNklpcEFLa\
UlzSW1semN5STZJbXBtWm1WQU1EQXdJaXdpWlhod0lqb3hOamd3T1RZMk1Ea3hMQ0pwWVhRaU9qRTJORGswTXpBd09URXNJbXAwYVNJNklqQmpNalExT1RObExUbGtZalV0TkRZeFl5MDVZbUl5TF\
dObVlqVXdaV0kzWTJGaVppSjkuVnE0bXlDd0tpdVVQb1MyMU1lbFJtckoyb2plWVZBUVNTYXc1UXk5TG1yMUx6TjB2bEY4bmJWbFhfVVgyRXg4Z0ZLRW9Gd2UzZEIwNG9PUDQ5WVlCV1BaMDB4WXB\
kUVd6dFpIQ0x6Nkc5QmhnWmtXb1B0cTcyMnZvTVk5MDRGTzFwdDZHOWVkQk1DX2h0Uk1FUzJoY2xBZHd2VUktbkU3cGtBYTVoVU5kVDE0RTdvUmdrUzR1MzlqdTZfWmhnY1ZsaFZQNnkwTkJCVFJy\
MXZ1SWRpaWlia2dhN0NtTk1mV285VEdLZk9VTlM2SVBtbzUyOF9KREd1VXJlYWNKWWxudXhwNDlkZGdnY1VzNHlmTjd5TEdoc0ZJTE96LUdodDFtcWtRaURvaVp4Qkx1aVh4YTN1R2toX0JPdmt4Y\
kxPZE1IVEtmNWR3M2xDN2pJeTNKZ250LVZB`);

    process.env.JF_ENV_LOCAL = '';
    process.env['JF_URL'] = 'http://127.0.0.1:8081';
    process.env['JF_USER'] = 'user';
    process.env['JF_PASSWORD'] = 'password';

    downloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote');
    expect(downloadDetails.artifactoryUrl).toBe('http://127.0.0.1:8081/artifactory');
    expect(downloadDetails.repository).toBe('jfrog-cli-remote');
    expect(downloadDetails.auth).toBe('Basic dXNlcjpwYXNzd29yZA==');

    process.env['JF_USER'] = '';
    process.env['JF_PASSWORD'] = '';
    process.env['JF_ACCESS_TOKEN'] = 'accessToken';

    downloadDetails = Utils.extractDownloadDetails('jfrog-cli-remote');
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
