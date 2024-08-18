import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    if (!Utils.addCachedCliToPath()) {
        return;
    }
    try {
        core.startGroup('Publish build info if needed');
        if (!core.getBooleanInput(Utils.AUTO_BUILD_PUBLISH_DISABLE)) {
            const workingDirectory: string = getWorkingDirectory();

            if (await hasUnpublishedModules(workingDirectory)) {
                // Running build-collect-env to collect environment variables and add them to the build info
                await Utils.runCli(['rt', 'build-collect-env'], { cwd: workingDirectory });
                // Running build-add-git to add git information to the build info
                await Utils.runCli(['rt', 'build-add-git'], { cwd: workingDirectory });
                // Running build-publish to publish the build info to artifactory
                await Utils.runCli(['rt', 'build-publish'], { cwd: workingDirectory });
            }
        }
    } catch (error) {
        console.warn('failed while attempting to publish build info: ' + error);
    } finally {
        core.endGroup();
    }

    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        await Utils.removeJFrogServers();
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            await Utils.generateWorkflowSummaryMarkdown();
        }
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
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
        console.error('Failed to parse JSON:', error);
        return false; // Return false if parsing fails
    } finally {
        core.exportVariable(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, origValue);
    }
}

function getWorkingDirectory(): string {
    const workingDirectory: string | undefined = process.env.GITHUB_WORKSPACE;
    if (!workingDirectory) {
        throw new Error('GITHUB_WORKSPACE is not defined.');
    }
    return workingDirectory;
}

cleanup();
