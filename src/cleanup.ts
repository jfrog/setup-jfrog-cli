import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    if (!addCachedJfToPath()) {
        core.warning('Could not find JFrog CLI path in the step state. Skipping cleanup.');
        return;
    }

    // Auto-publish build info if needed
    try {
        if (!core.getBooleanInput(Utils.AUTO_BUILD_PUBLISH_DISABLE)) {
            await collectAndPublishBuildInfoIfNeeded();
        }
    } catch (error) {
        core.warning('failed while attempting to collect and publish build info: ' + error);
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

function addCachedJfToPath(): boolean {
    let version: string = core.getInput(Utils.CLI_VERSION_ARG);
    if (version == Utils.LATEST_CLI_VERSION) {
        // If the version is 'latest', we keep it on cache as 0.0.0
        version = Utils.LATEST_SEMVER;
    }
    let jfFileName: string = Utils.getJfExecutableName();
    let jfrogFileName: string = Utils.getJFrogExecutableName();
    return Utils.loadFromCache(jfFileName, jfrogFileName, version);
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
        throw new Error('Failed to check if there are any unpublished modules: ' + error);
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

cleanup();
