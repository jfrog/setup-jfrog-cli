import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    if (!addCachedJfToPath()) {
        core.error('Could not find JFrog CLI path in the step state. Skipping cleanup.');
        return;
    }
    // Auto publish builds and generate job summary if CLI version is compatible
    await autoPublishBuildsAndGenerateSummary();

    // Cleanup JFrog CLI servers configuration
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        await Utils.removeJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

async function autoPublishBuildsAndGenerateSummary() {
    // First we check for compatible CLI version
    let supported: boolean = await supportedCliVersion();
    core.info('JFrog CLI version is compatible: ' + supported);
    if (supported) {
        // Auto-publish build info if needed
        try {
            if (!core.getBooleanInput(Utils.AUTO_BUILD_PUBLISH_DISABLE)) {
                core.startGroup('Auto-publishing build info to JFrog Artifactory');
                await collectAndPublishBuildInfoIfNeeded();
                core.endGroup();
            }
        } catch (error) {
            core.warning('failed while attempting to publish build info: ' + error);
        }
        // Generate job summary
        try {
            if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
                core.startGroup('Generating Job Summary');
                await Utils.runCli(['generate-summary-markdown']);
                await Utils.setMarkdownAsJobSummary();
                core.endGroup();
            }
        } catch (error) {
            core.warning('failed while attempting to generate job summary: ' + error);
        }
    }
}

function addCachedJfToPath(): boolean {
    // Get the JFrog CLI path from step state. saveState/getState are methods to pass data between a step, and it's cleanup function.
    const jfCliPath: string = core.getState(Utils.JF_CLI_PATH_STATE);
    if (!jfCliPath) {
        // This means that the JFrog CLI was not installed in the first place, because there was a failure in the installation step.
        return false;
    }
    core.addPath(jfCliPath);
    return true;
}

interface BuildPublishResponse {
    modules: any[];
}

async function hasUnpublishedModules(workingDirectory: string): Promise<boolean> {
    // Save the old value of the environment variable to revert it later
    const origValue: string | undefined = process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
    try {
        // Avoid saving a command summary for this dry-run command
        core.exportVariable(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, '');

        // Running build-publish command with a dry-run flag to check if there are any unpublished modules, 'silent' to avoid polluting the logs
        const responseStr: string = await Utils.runCliAndGetOutput(['rt', 'build-publish', '--dry-run'], { silent: true, cwd: workingDirectory });

        // Parse the JSON string to an object
        const response: BuildPublishResponse = JSON.parse(responseStr);
        // Check if the "modules" key exists and if it's an array with more than one item
        return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
    } catch (error) {
        core.error('Failed to parse JSON: ' + error);
        return false; // Return false if parsing fails
    } finally {
        core.exportVariable(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, origValue);
    }
}

async function collectAndPublishBuildInfoIfNeeded() {
    const workingDirectory: string = getWorkingDirectory();
    // Check if there are any unpublished modules
    if (!(await hasUnpublishedModules(workingDirectory))) {
        return;
    }

    // The flow here is to collect Git information before publishing the build info.
    // We allow this step to fail, and we don't want to fail the entire build publish if they do.

    try {
        core.startGroup('Collect the Git information');
        await Utils.runCli(['rt', 'build-add-git'], { cwd: workingDirectory });
    } catch (error) {
        core.warning('failed while attempting to collect Git information: ' + error);
    } finally {
        core.endGroup();
    }

    core.startGroup('Publish the build info to JFrog Artifactory');
    await Utils.runCli(['rt', 'build-publish'], { cwd: workingDirectory });
    core.endGroup();
}

function getWorkingDirectory(): string {
    const workingDirectory: string | undefined = process.env.GITHUB_WORKSPACE;
    if (!workingDirectory) {
        throw new Error('GITHUB_WORKSPACE is not defined.');
    }
    return workingDirectory;
}

export async function supportedCliVersion(): Promise<boolean> {
    let cliVersion: string | null = await getCliVersion();
    if (!cliVersion) {
        return false;
    }
    return isVersionGreaterThan(cliVersion, Utils.minJobSummaryCLIVersion);
}

async function getCliVersion(): Promise<string | null> {
    try {
        const versionOutput: string = await Utils.runCliAndGetOutput(['--version']);
        const versionMatch: RegExpMatchArray | null = versionOutput.match(/jf version (\d+\.\d+\.\d+)/);
        return versionMatch ? versionMatch[1] : null;
    } catch (error) {
        core.warning('Failed to get JFrog CLI version: ' + error);
        return null;
    }
}

function isVersionGreaterThan(currentVersion: string, targetVersion: string): boolean {
    const currentParts: number[] = currentVersion.split('.').map(Number);
    const targetParts: number[] = targetVersion.split('.').map(Number);

    for (let i: number = 0; i < targetParts.length; i++) {
        if (currentParts[i] > targetParts[i]) return true;
        if (currentParts[i] < targetParts[i]) return false;
    }
    return false;
}

cleanup();
