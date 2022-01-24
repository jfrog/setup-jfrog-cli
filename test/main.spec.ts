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

        process.env['JFROG_SERVER_1'] = 'DUMMY_SERVER_TOKEN_1';
        serverTokens = Utils.getServerTokens();
        expect(serverTokens).toStrictEqual(['DUMMY_SERVER_TOKEN_1']);

        process.env['JFROG_SERVER_2'] = 'DUMMY_SERVER_TOKEN_2';
        serverTokens = Utils.getServerTokens();
        expect(serverTokens).toStrictEqual(['DUMMY_SERVER_TOKEN_1', 'DUMMY_SERVER_TOKEN_2']);
    });

    describe('JFrog CLI V2 (jf) URL Tests', () => {
        const myOs: jest.Mocked<typeof os> = os as any;
        let cases: string[][] = [
            ['win32' as NodeJS.Platform, 'amd64', 'jf.exe', 'https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/2.6.0/jfrog-cli-windows-amd64/jf.exe'],
            ['darwin' as NodeJS.Platform, 'amd64', 'jf', 'https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/2.6.0/jfrog-cli-mac-386/jf'],
            ['linux' as NodeJS.Platform, 'amd64', 'jf', 'https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/2.6.0/jfrog-cli-linux-amd64/jf'],
            ['linux' as NodeJS.Platform, 'arm64', 'jf', 'https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/2.6.0/jfrog-cli-linux-arm64/jf'],
            ['linux' as NodeJS.Platform, '386', 'jf', 'https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/2.6.0/jfrog-cli-linux-386/jf'],
            ['linux' as NodeJS.Platform, 'arm', 'jf', 'https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/2.6.0/jfrog-cli-linux-arm/jf'],
        ];

        test.each(cases)('CLI Url for %s-%s', (platform, arch, fileName, expectedUrl) => {
            myOs.platform.mockImplementation(() => <NodeJS.Platform>platform);
            myOs.arch.mockImplementation(() => arch);
            let cliUrl: string = Utils.getCliUrl('2.6.0', fileName);
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
