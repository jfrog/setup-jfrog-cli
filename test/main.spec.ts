import * as os from 'os';
import { Utils, DownloadDetails, JfrogCredentials } from '../src/utils';
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
    [
        'JF_ARTIFACTORY_1',
        'JF_ARTIFACTORY_2',
        'ARTIFACTORY_JF_1',
        'JF_ENV_1',
        'JF_ENV_2',
        'ENV_JF_1',
        'JF_ENV_LOCAL',
        'JF_USER',
        'JF_PASSWORD',
        'JF_ACCESS_TOKEN',
    ].forEach((envKey) => {
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

describe('Collect credentials from environment variables test', () => {
    let cases: string[][] = [
        // [JF_URL, JF_ACCESS_TOKEN, JF_USER, JF_PASSWORD]
        ['', '', '', ''],
        ['https://my-server.io', 'my-access-token', '', ''],
        ['https://my-server.io', 'my-access-token', 'my-user', 'my-password'],
    ];

    test.each(cases)(
        'Checking Jfrog credentials struct for url: %s, access token %s, username: %s, password: %s',
        (jfrogUrl, accessToken, username, password) => {
            process.env['JF_URL'] = jfrogUrl;
            process.env['JF_ACCESS_TOKEN'] = accessToken;
            process.env['JF_USER'] = username;
            process.env['JF_PASSWORD'] = password;

            let jfrogCredentials: JfrogCredentials = Utils.collectJfrogCredentialsFromEnvVars();
            if (jfrogUrl) {
                expect(jfrogCredentials.jfrogUrl).toEqual(jfrogUrl);
            } else {
                expect(jfrogCredentials.jfrogUrl).toBeUndefined();
            }

            if (accessToken) {
                expect(jfrogCredentials.accessToken).toEqual(accessToken);
            } else {
                expect(jfrogCredentials.accessToken).toBeUndefined();
            }

            if (username) {
                expect(jfrogCredentials.username).toEqual(username);
            } else {
                expect(jfrogCredentials.username).toBeUndefined();
            }

            if (password) {
                expect(jfrogCredentials.password).toEqual(password);
            } else {
                expect(jfrogCredentials.password).toBeUndefined();
            }
        },
    );
});

test('Collect JFrog Credentials from env vars', async () => {
    process.env['JF_URL'] = '';
    let jfrogCredentials: JfrogCredentials = Utils.collectJfrogCredentialsFromEnvVars();
    expect(jfrogCredentials.jfrogUrl).toBeUndefined();
    expect(jfrogCredentials.username).toBeUndefined();
    expect(jfrogCredentials.password).toBeUndefined();
    expect(jfrogCredentials.accessToken).toBeUndefined();

    process.env['JF_URL'] = 'https://my-server.io';
    process.env['JF_ACCESS_TOKEN'] = 'my-access-token';
    jfrogCredentials = Utils.collectJfrogCredentialsFromEnvVars();
    expect(jfrogCredentials.jfrogUrl).toEqual('https://my-server.io');
    expect(jfrogCredentials.username).toBeUndefined();
    expect(jfrogCredentials.password).toBeUndefined();
    expect(jfrogCredentials.accessToken).toEqual('my-access-token');

    process.env['JF_USER'] = 'user';
    process.env['JF_PASSWORD'] = 'password';
    jfrogCredentials = Utils.collectJfrogCredentialsFromEnvVars();
    expect(jfrogCredentials.jfrogUrl).toEqual('https://my-server.io');
    expect(jfrogCredentials.username).toEqual('user');
    expect(jfrogCredentials.password).toEqual('password');
    expect(jfrogCredentials.accessToken).toEqual('my-access-token');
});

test('Get separate env config', async () => {
    // No url
    let configCommand: string[] | undefined = Utils.getSeparateEnvConfigArgs({} as JfrogCredentials);
    expect(configCommand).toBe(undefined);

    let jfrogCredentials: JfrogCredentials = {} as JfrogCredentials;
    jfrogCredentials.jfrogUrl = DEFAULT_CLI_URL;

    // No credentials
    configCommand = Utils.getSeparateEnvConfigArgs(jfrogCredentials);
    expect(configCommand).toStrictEqual([Utils.SETUP_JFROG_CLI_SERVER_ID, '--url', DEFAULT_CLI_URL, '--interactive=false', '--overwrite=true']);

    // Basic authentication
    jfrogCredentials.username = 'user';
    jfrogCredentials.password = 'password';
    configCommand = Utils.getSeparateEnvConfigArgs(jfrogCredentials);
    expect(configCommand).toStrictEqual([
        Utils.SETUP_JFROG_CLI_SERVER_ID,
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
    configCommand = Utils.getSeparateEnvConfigArgs(jfrogCredentials);
    expect(configCommand).toStrictEqual([
        Utils.SETUP_JFROG_CLI_SERVER_ID,
        '--url',
        DEFAULT_CLI_URL,
        '--interactive=false',
        '--overwrite=true',
        '--access-token',
        'accessToken',
    ]);
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
        cliUrl = Utils.getCliUrl('1', '1.2.3', fileName, Utils.extractDownloadDetails('jfrog-cli-remote', {} as JfrogCredentials));
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

        let cliUrl: string = Utils.getCliUrl('2', '2.3.4', fileName, Utils.extractDownloadDetails('', {} as JfrogCredentials));
        expect(cliUrl).toBe(DEFAULT_CLI_URL + expectedUrl);

        process.env.JF_ENV_LOCAL = V2_CONFIG;
        cliUrl = Utils.getCliUrl('2', '2.3.4', fileName, Utils.extractDownloadDetails('jfrog-cli-remote', {} as JfrogCredentials));
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
