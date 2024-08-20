import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        if (!addCachedCliToPath()) {
            return;
        }
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            core.startGroup('Generate Job Summary');
            core.info('generating summary....');
            await Utils.runCli(['generate-summary-markdown']);
            core.info('done generating summary....');
            await Utils.setMarkdownAsJobSummary();
            core.endGroup();
        }
        core.startGroup('Cleanup JFrog CLI servers configuration');
        await Utils.removeJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

function addCachedCliToPath(): boolean {
    // Get the JFrog CLI path from step state. saveState/getState are methods to pass data between a step, and it's cleanup function.
    const jfrogCliPath: string = core.getState(Utils.JFROG_CLI_PATH_STATE);
    if (!jfrogCliPath) {
        // This means that the JFrog CLI was not installed in the first place, because there was a failure in the installation step.
        return false;
    }
    core.addPath(jfrogCliPath);
    return true;
}

cleanup();
