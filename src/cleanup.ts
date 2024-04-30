import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        if (!Utils.addCachedCliToPath()) {
            return;
        }
        await Utils.removeJFrogServers();
        await Utils.generateJobSummary();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

cleanup();

