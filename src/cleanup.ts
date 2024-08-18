import * as core from '@actions/core';
import { Utils } from './utils';

const buildPublishCmd : string = 'build-publish';

async function cleanup() {
    try {
        if (!Utils.addCachedCliToPath()) {
            return;
        }

        core.startGroup('Publish build info if needed');
        if (await hasUnpublishedModules()) {
            let buildPublishResponse: string = await Utils.runCliAndGetOutput(['rt', buildPublishCmd]);
            console.log(buildPublishResponse);
        }
        core.endGroup();

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

async function hasUnpublishedModules(): Promise<boolean> {
    // Save the old value of the environment variable to revert it later
    const origValue: string | undefined = process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
    try {
        // Avoid saving a command summary for this dry-run command
        core.exportVariable(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, '');

        // Running build-publish command with a dry-run flag to check if there are any unpublished modules
        const responseStr: string = await Utils.runCliAndGetOutput(['rt', buildPublishCmd, '--dry-run']);

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

cleanup();
