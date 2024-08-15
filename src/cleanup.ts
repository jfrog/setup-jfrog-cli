import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        if (!Utils.addCachedCliToPath()) {
            return;
        }
        let response: string = await Utils.runCliWithOutput(['rt', 'bp', '--dry-run', '--detailed-summary', 'false']);
        console.log(response);

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

cleanup();
