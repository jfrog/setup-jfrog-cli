import * as core from '@actions/core';
import { exec } from '@actions/exec';
import * as toolCache from '@actions/tool-cache';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';

export class Utils {
    public static readonly USER_AGENT: string = 'setup-jfrog-cli-github-action/' + require('../package.json').version;
    public static readonly SERVER_TOKEN_LEGACY_PREFIX: RegExp = /^JF_ARTIFACTORY_.*$/;
    public static readonly SERVER_TOKEN_PREFIX: RegExp = /^JF_ENV_.*$/;
    // Since 1.45.0, 'jfrog rt c' command changed to 'jfrog c add'
    public static readonly NEW_CONFIG_CLI_VERSION: string = '1.45.0';
    public static readonly CLI_VERSION_ARG: string = 'version';
    public static readonly MIN_CLI_VERSION: string = '1.29.0';
    public static readonly LATEST_CLI_VERSION_ARG: string = 'latest';

    private static readonly LATEST_RELEASE_VERSION: string = '[RELEASE]';

    public static async addCliToPath() {
        let version: string = core.getInput(Utils.CLI_VERSION_ARG);
        let major: string = version.split('.')[0];
        if (version === this.LATEST_CLI_VERSION_ARG) {
            version = Utils.LATEST_RELEASE_VERSION;
            major = '2';
        } else if (semver.lt(version, this.MIN_CLI_VERSION)) {
            throw new Error('Requested to download JFrog CLI version ' + version + ' but must be at least ' + this.MIN_CLI_VERSION);
        }

        let jfFileName: string = Utils.getJfExecutableName();
        let jfrogFileName: string = Utils.getJFrogExecutableName();
        if (this.loadFromCache(jfFileName, jfrogFileName, version)) {
            // Download is not needed
            return;
        }

        // Download JFrog CLI
        let url: string = Utils.getCliUrl(major, version, jfrogFileName);
        core.debug('Downloading JFrog CLI from ' + url);
        let downloadDir: string = await toolCache.downloadTool(url);

        // Cache 'jf' and 'jfrog' executables
        await this.cacheAndAddPath(downloadDir, version, jfFileName);
        await this.cacheAndAddPath(downloadDir, version, jfrogFileName);
    }

    /**
     * Try to load the JFrog CLI executables from cache.
     *
     * @param jfFileName    - 'jf' or 'jf.exe'
     * @param jfrogFileName - 'jfrog' or 'jfrog.exe'
     * @param version       - JFrog CLI version
     * @returns true if the CLI executable was loaded from cache and added to path
     */
    private static loadFromCache(jfFileName: string, jfrogFileName: string, version: string): boolean {
        if (version === Utils.LATEST_RELEASE_VERSION) {
            return false;
        }
        let jfExecDir: string = toolCache.find(jfFileName, version);
        let jfrogExecDir: string = toolCache.find(jfrogFileName, version);
        if (jfExecDir && jfrogExecDir) {
            core.addPath(jfExecDir);
            core.addPath(jfrogExecDir);
            return true;
        }
        return false;
    }

    /**
     * Add JFrog CLI executables to cache and to the system path.
     * @param downloadDir - The directory whereby the CLI was downloaded to
     * @param version     - JFrog CLI version
     * @param fileName    - 'jf', 'jfrog', 'jf.exe', or 'jfrog.exe'
     */
    private static async cacheAndAddPath(downloadDir: string, version: string, fileName: string) {
        let cliDir: string = await toolCache.cacheFile(downloadDir, fileName, fileName, version);

        if (!Utils.isWindows()) {
            fs.chmodSync(path.join(cliDir, fileName), 0o555);
        }
        core.addPath(cliDir);
    }

    public static getCliUrl(major: string, version: string, fileName: string): string {
        let architecture: string = 'jfrog-cli-' + Utils.getArchitecture();
        return 'https://releases.jfrog.io/artifactory/jfrog-cli/v' + major + '/' + version + '/' + architecture + '/' + fileName;
    }

    public static getServerTokens(): Set<string> {
        let serverTokens: Set<string> = new Set(
            Object.keys(process.env)
                .filter((envKey) => envKey.match(Utils.SERVER_TOKEN_PREFIX))
                .filter((envKey) => process.env[envKey])
                .map((envKey) => process.env[envKey]?.trim() || '')
        );

        let legacyServerTokens: Set<string> = new Set(
            Object.keys(process.env)
                .filter((envKey) => envKey.match(Utils.SERVER_TOKEN_LEGACY_PREFIX))
                .filter((envKey) => process.env[envKey])
                .map((envKey) => process.env[envKey]?.trim() || '')
        );

        if (legacyServerTokens.size > 0) {
            core.warning(
                'The "JF_ARTIFACTORY_" prefix for environment variables is deprecated and is expected to be removed in v3. ' +
                'Please use the "JF_ENV_" prefix instead. The environment variables value should not be changed.'
            );
        }

        legacyServerTokens.forEach((serverToken) => serverTokens.add(serverToken));
        return serverTokens;
    }

    public static setCliEnv() {
        core.exportVariable('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*');
        core.exportVariable('JFROG_CLI_OFFER_CONFIG', 'false');
        core.exportVariable('CI', 'true');
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

    public static async configJFrogServers() {
        let useOldConfig: boolean = Utils.useOldConfig();
        if (useOldConfig) {
            let version: string = core.getInput(Utils.CLI_VERSION_ARG);
            core.warning('JFrog CLI ' + version + ' on Setup JFrog CLI GitHub Action is deprecated. Please use version 1.46.4 or above.');
        }
        for (let serverToken of Utils.getServerTokens()) {
            let importCmd: string[] = useOldConfig ? ['rt', 'c', 'import', serverToken] : ['c', 'import', serverToken];
            await Utils.runCli(importCmd);
        }
    }

    public static async removeJFrogServers() {
        if (Utils.useOldConfig()) {
            await Utils.runCli(['rt', 'c', 'clear', '--interactive=false']);
        } else {
            await Utils.runCli(['c', 'rm', '--quiet']);
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

    public static getJfExecutableName() {
        return Utils.isWindows() ? 'jf.exe' : 'jf';
    }

    public static getJFrogExecutableName() {
        return Utils.isWindows() ? 'jfrog.exe' : 'jfrog';
    }

    public static isWindows() {
        return os.platform().startsWith('win');
    }

    /**
     * Execute JFrog CLI command. 
     * This GitHub Action downloads the requested 'jfrog' executable and stores it as 'jfrog' and 'jf'. 
     * Therefore the 'jf' executable is expected to be in the path also for older CLI versions.
     * @param args - CLI arguments
     */
    public static async runCli(args: string[]) {
        let res: number = await exec('jf', args);
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
        if (version === this.LATEST_CLI_VERSION_ARG) {
            return false;
        }
        return semver.lt(version, this.NEW_CONFIG_CLI_VERSION);
    }
}
