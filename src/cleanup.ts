import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        await Utils.getAndAddCliToPath();
        await Utils.removeJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

cleanup();
