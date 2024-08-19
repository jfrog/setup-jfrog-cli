import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        // Get the JFrog CLI path from step state. saveState/getState are methods to pass data between a step, and it's cleanup function.
        const jfrogCliPath: string = core.getState(Utils.JFROG_CLI_PATH_STATE);
        core.addPath(jfrogCliPath);

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

cleanup();
