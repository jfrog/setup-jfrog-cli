import os from 'os';
import { Utils } from '../src/utils';
jest.mock('os');

describe('JFrog CLI action Tests', () => {
    test('Get server tokens', async () => {
        let serverTokens: string[] = Utils.getServerTokens();
        expect(serverTokens).toStrictEqual([]);

        process.env['ARTIFACTORY_JF_1'] = 'ILLEGAL_SERVER_TOKEN';
        serverTokens = Utils.getServerTokens();
        expect(serverTokens).toStrictEqual([]);

        process.env['JF_ARTIFACTORY_1'] = 'DUMMY_SERVER_TOKEN_1';
        serverTokens = Utils.getServerTokens();
        expect(serverTokens).toStrictEqual(['DUMMY_SERVER_TOKEN_1']);

        process.env['JF_ARTIFACTORY_2'] = 'DUMMY_SERVER_TOKEN_2';
        serverTokens = Utils.getServerTokens();
        expect(serverTokens).toStrictEqual(['DUMMY_SERVER_TOKEN_1', 'DUMMY_SERVER_TOKEN_2']);
    });

    describe('JFrog CLI V1 URL Tests', () => {
        const myOs: jest.Mocked<typeof os> = os as any;
        let cases: string[][] = [
            [
                'win32' as NodeJS.Platform,
                'amd64',
                'jfrog.exe',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v1/1.2.3/jfrog-cli-windows-amd64/jfrog.exe',
            ],
            [
                'darwin' as NodeJS.Platform,
                'amd64',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v1/1.2.3/jfrog-cli-mac-386/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                'amd64',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v1/1.2.3/jfrog-cli-linux-amd64/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                'arm64',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v1/1.2.3/jfrog-cli-linux-arm64/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                '386',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v1/1.2.3/jfrog-cli-linux-386/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                'arm',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v1/1.2.3/jfrog-cli-linux-arm/jfrog',
            ],
        ];

        test.each(cases)('CLI Url for %s-%s', (platform, arch, fileName, cli_url, expectedUrl) => {
            myOs.platform.mockImplementation(() => <NodeJS.Platform>platform);
            myOs.arch.mockImplementation(() => arch);
            let cliUrl: string = Utils.getCliUrl(cli_url, '1.2.3', fileName);
            expect(cliUrl).toBe(expectedUrl);
        });
    });

    describe('JFrog CLI V2 URL Tests', () => {
        const myOs: jest.Mocked<typeof os> = os as any;
        let cases: string[][] = [
            [
                'win32' as NodeJS.Platform,
                'amd64',
                'jfrog.exe',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v2/2.3.4/jfrog-cli-windows-amd64/jfrog.exe',
            ],
            [
                'darwin' as NodeJS.Platform,
                'amd64',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v2/2.3.4/jfrog-cli-mac-386/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                'amd64',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v2/2.3.4/jfrog-cli-linux-amd64/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                'arm64',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v2/2.3.4/jfrog-cli-linux-arm64/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                '386',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v2/2.3.4/jfrog-cli-linux-386/jfrog',
            ],
            [
                'linux' as NodeJS.Platform,
                'arm',
                'jfrog',
                'https://releases.jfrog.io/artifactory/jfrog-cli',
                'https://releases.jfrog.io/artifactory/jfrog-cli/v2/2.3.4/jfrog-cli-linux-arm/jfrog',
            ],
        ];

        test.each(cases)('CLI Url for %s-%s', (platform, arch, fileName, cli_url, expectedUrl) => {
            myOs.platform.mockImplementation(() => <NodeJS.Platform>platform);
            myOs.arch.mockImplementation(() => arch);
            let cliUrl: string = Utils.getCliUrl(cli_url, '2.3.4', fileName);
            expect(cliUrl).toBe(expectedUrl);
        });
    });

    test('User agent', () => {
        let userAgent: string = Utils.USER_AGENT;
        let split: string[] = userAgent.split('/');
        expect(split).toHaveLength(2);
        expect(split[0]).toBe('setup-jfrog-cli-github-action');
        expect(split[1]).toMatch(/\d*.\d*.\d*/);
    });
});
