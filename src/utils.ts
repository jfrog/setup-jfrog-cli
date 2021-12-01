import * as core from '@actions/core';
import { exec } from '@actions/exec';
import * as toolCache from '@actions/tool-cache';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';

export class Utils {
    public static readonly USER_AGENT: string = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
    public static readonly SERVER_TOKEN_PREFIX: RegExp = /^JF_ARTIFACTORY_.*$/;
    // Since 1.45.0, 'jfrog rt c' command changed to 'jfrog c add'
    public static readonly NEW_CONFIG_CLI_VERSION: string = '1.45.0';
    public static readonly CLI_VERSION_ARG: string = 'version';
    public static readonly CLI_URL: string = 'cli_url';
    public static readonly MIN_CLI_VERSION: string = '1.29.0';

    public static async downloadCli(): Promise<string> {
        let cli_url: string = core.getInput(Utils.CLI_URL);
        let version: string = core.getInput(Utils.CLI_VERSION_ARG);
        if (semver.lt(version, this.MIN_CLI_VERSION)) {
            throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
        }
        let fileName: string = Utils.getCliExecutableName();
        let cliDir: string = toolCache.find(fileName, version);
        if (cliDir) {
            core.addPath(cliDir);
            return path.join(cliDir, fileName);
        }
        let url: string = Utils.getCliUrl(cli_url, version, fileName);
        core.debug('Downloading JFrog CLI from ' + url);
        let downloadDir: string = await toolCache.downloadTool(url);
        cliDir = await toolCache.cacheFile(downloadDir, fileName, fileName, version);
        let cliPath: string = path.join(cliDir, fileName);
        if (!Utils.isWindows()) {
            fs.chmodSync(cliPath, 0o555);
        }
        core.addPath(cliDir);
        return cliPath;
    }

    public static getCliUrl(cli_url: string, version: string, fileName: string): string {
        let architecture: string = 'jfrog-cli-' + Utils.getArchitecture();
        let major: string = version.split('.')[0];
        return cli_url + '/v' + major + '/' + version + '/' + architecture + '/' + fileName;
    }

    public static getServerTokens(): string[] {
        return Object.keys(process.env)
            .filter((env) => env.match(Utils.SERVER_TOKEN_PREFIX))
            .map((envKey) => process.env[envKey] || '');
    }

    public static setCliEnv() {
        core.exportVariable('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;JF_ARTIFACTORY_*');
        core.exportVariable('JFROG_CLI_OFFER_CONFIG', 'false');
        let buildNameEnv: string | undefined = process.env.GITHUB_WORKFLOW;
        if (buildNameEnv) {
            core.exportVariable('JFROG_CLI_BUILD_NAME', buildNameEnv);
        }
        let buildNumberEnv: string | undefined = process.env.GITHUB_RUN_NUMBER;
        if (buildNumberEnv) {
            core.exportVariable('JFROG_CLI_BUILD_NUMBER', buildNumberEnv);
        }
        core.exportVariable(
            'JFROG_CLI_BUILD_URL',
            process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID
        );
        core.exportVariable('JFROG_CLI_USER_AGENT', Utils.USER_AGENT);
    }

    public static async configArtifactoryServers(cliPath: string) {
        let useOldConfig: boolean = Utils.useOldConfig();
        if (useOldConfig) {
            let version: string = core.getInput(Utils.CLI_VERSION_ARG);
            core.warning('JFrog CLI ' + version + ' on Setup JFrog CLI GitHub Action is deprecated. Please use version 1.46.4 or above.');
        }
        for (let serverToken of Utils.getServerTokens()) {
            let importCmd: string[] = useOldConfig ? ['rt', 'c', 'import', serverToken] : ['c', 'import', serverToken];
            await Utils.runCli(cliPath, importCmd);
        }
    }

    public static async removeArtifactoryServers(cliPath: string) {
        if (Utils.useOldConfig()) {
            await Utils.runCli(cliPath, ['rt', 'c', 'clear', '--interactive=false']);
        } else {
            await Utils.runCli(cliPath, ['c', 'rm', '--quiet']);
        }
    }

    public static getArchitecture() {
        if (Utils.isWindows()) {
            return 'windows-amd64';
        }
        if (os.platform().includes('darwin')) {
            return 'mac-386';
        }
        if (os.arch().includes('arm')) {
            return os.arch().includes('64') ? 'linux-arm64' : 'linux-arm';
        }
        return os.arch().includes('64') ? 'linux-amd64' : 'linux-386';
    }

    public static getCliExecutableName() {
        return Utils.isWindows() ? 'jfrog.exe' : 'jfrog';
    }

    public static isWindows() {
        return os.platform().startsWith('win');
    }

    public static async runCli(cliPath: string, args: string[] | undefined) {
        let res: number = await exec(cliPath, args);
        if (res !== core.ExitCode.Success) {
            throw new Error('JFrog CLI exited with exit code ' + res);
        }
    }

    /**
     * Return true if should use 'jfrog rt c' instead of 'jfrog c'.
     * @returns true if should use 'jfrog rt c' instead of 'jfrog c'.
     */
    private static useOldConfig(): boolean {
        let version: string = core.getInput(Utils.CLI_VERSION_ARG);
        return semver.lt(version, this.NEW_CONFIG_CLI_VERSION);
    }
}
