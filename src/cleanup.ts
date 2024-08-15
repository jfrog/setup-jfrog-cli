import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        if (!Utils.addCachedCliToPath()) {
            return;
        }

        if (await hasUnpublishedModules()) {
            let buildPublishResponseStr: string = await Utils.runCliAndGetOutput(['rt', 'bp']);
            console.log(buildPublishResponseStr);
        }

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
    // Save the old value of the environment variable
    const origValue = process.env.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR;
    try {
        core.exportVariable('JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR', '');

        const responseStr: string = await Utils.runCliAndGetOutput(['rt', 'bp', '--dry-run']);

        // Parse the JSON string to an object
        const response: BuildPublishResponse = JSON.parse(responseStr);
        // Check if the "modules" key exists and if it's an array with more than one item
        return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
    } catch (error) {
        console.error('Failed to parse JSON:', error);
        return false; // Return false if parsing fails
    } finally {
        core.exportVariable('JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR', origValue);
    }
}

cleanup();
