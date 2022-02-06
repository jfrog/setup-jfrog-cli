import * as core from '@actions/core';
import { Utils } from './utils';

async function cleanup() {
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        let cliPath: string = await Utils.downloadCli();
        await Utils.removeJFrogServers(cliPath);
    } catch (error) {
        core.setFailed(error.message);
    } finally {
        core.endGroup();
    }
}

cleanup();
