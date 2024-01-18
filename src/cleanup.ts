import * as core from '@actions/core';
import { JfrogCredentials, Utils } from './utils';

async function cleanup() {
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        if (!(await Utils.addCachedCliToPath())) {
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
