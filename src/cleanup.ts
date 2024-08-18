import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            core.startGroup('Generate Job Summary');
            await Utils.runCli(['generate-summary-markdown']);
            await Utils.setMarkdownAsJobSummary();
            core.endGroup();
        }
        core.startGroup('Cleanup JFrog CLI servers configuration');
        if (!Utils.addCachedCliToPath()) {
            return;
        }
        await Utils.removeJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

cleanup();
