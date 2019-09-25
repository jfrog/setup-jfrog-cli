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

    describe('JFrog CLI URL Tests', () => {
        const myOs: jest.Mocked<typeof os> = os as any;
        let cases: string[][] = [
            [
                'win32' as NodeJS.Platform,
                'amd64',
                'jfrog.exe',
                'https://api.bintray.com/content/jfrog/jfrog-cli-go/1.2.3/jfrog-cli-windows-amd64/jfrog.exe?bt_package=jfrog-cli-windows-amd64'
            ],
            [
                'darwin' as NodeJS.Platform,
                'amd64',
                'jfrog',
                'https://api.bintray.com/content/jfrog/jfrog-cli-go/1.2.3/jfrog-cli-mac-386/jfrog?bt_package=jfrog-cli-mac-386'
            ],
            [
                'linux' as NodeJS.Platform,
                'amd64',
                'jfrog',
                'https://api.bintray.com/content/jfrog/jfrog-cli-go/1.2.3/jfrog-cli-linux-amd64/jfrog?bt_package=jfrog-cli-linux-amd64'
            ],
            [
                'linux' as NodeJS.Platform,
                'arm64',
                'jfrog',
                'https://api.bintray.com/content/jfrog/jfrog-cli-go/1.2.3/jfrog-cli-linux-arm64/jfrog?bt_package=jfrog-cli-linux-arm64'
            ],
            [
                'linux' as NodeJS.Platform,
                '386',
                'jfrog',
                'https://api.bintray.com/content/jfrog/jfrog-cli-go/1.2.3/jfrog-cli-linux-386/jfrog?bt_package=jfrog-cli-linux-386'
            ],
            [
                'linux' as NodeJS.Platform,
                'arm',
                'jfrog',
                'https://api.bintray.com/content/jfrog/jfrog-cli-go/1.2.3/jfrog-cli-linux-arm/jfrog?bt_package=jfrog-cli-linux-arm'
            ]
        ];

        test.each(cases)('CLI Url for %s-%s', (platform, arch, fileName, expectedUrl) => {
            myOs.platform.mockImplementation(() => <NodeJS.Platform>platform);
            myOs.arch.mockImplementation(() => arch);
            let cliUrl: string = Utils.getCliUrl('1.2.3', fileName);
            expect(cliUrl).toBe(expectedUrl);
        });
    });
});
