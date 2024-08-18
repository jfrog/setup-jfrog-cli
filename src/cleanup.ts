import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            core.startGroup('Generate Job Summary');
            // Generate summary Markdown from data files
            await Utils.runCli(['generate-summary-markdown']);
            // Combine to a unified report
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
