import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        if (!Utils.addCachedCliToPath()) {
            return;
        }

        await publishBuildInfoIfNeeded();

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

async function publishBuildInfoIfNeeded() {
    core.exportVariable('JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR', '');
    let response: string = await Utils.runCliAndGetOutput(['rt', 'bp', '--dry-run']);
    console.log('Response:', response);
    console.log(hasUnpublishedModules(response))

    await Utils.runCli(['npm-config', '--repo-resolve', 'npm-virtual']);
    await Utils.runCli(['npm', 'i']);

    response = await Utils.runCliAndGetOutput(['rt', 'bp', '--dry-run']);
    console.log(hasUnpublishedModules(response))
}

interface BuildInfoResponse {
    modules: any[];
}

function hasUnpublishedModules(responseStr: string): boolean {
    try {
        // Parse the JSON string to an object
        const response : BuildInfoResponse = JSON.parse(responseStr);
        // Check if the "modules" key exists and if it's an array with more than one item
        return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
    } catch (error) {
        console.error('Failed to parse JSON:', error);
        return false; // Return false if parsing fails
    }
}

cleanup();
