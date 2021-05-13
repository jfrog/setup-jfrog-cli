import * as core from '@actions/core';
import { Utils } from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        let cliPath: string = await Utils.downloadCli();
        await Utils.configArtifactoryServers(cliPath);
        if (
            core.getInput('jfrog-api-key') != 'none' &&
            core.getInput('jfrog-api-user') != 'none' &&
            core.getInput('jfrog-url') != 'none'
        ) {
            await Utils.configJFrogAPIKey(cliPath);
        }
    } catch (error) {
        core.setFailed(error.message);
    } finally {
        core.endGroup();
    }
}

main();
