import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        if (!Utils.addCachedCliToPath()) {
            return;
        }
        await Utils.removeJFrogServers();
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            // Generate summary Markdown from data files
            await Utils.runCli(['create-summary-markdown']);
            // Combine to a unified report
            await Utils.createUnifiedReport();
        }
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

cleanup();
