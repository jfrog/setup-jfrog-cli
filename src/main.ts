import * as core from '@actions/core';
import { Utils } from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');        
        Utils.setCliEnv();
        let cliPath: string = await Utils.downloadCli();
        await Utils.configArtifactoryServers(cliPath);
    } catch (error) {
        core.setFailed(error.message);
    } finally {
        core.endGroup();
    }
}

main();
