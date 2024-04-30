import * as core from '@actions/core';
import { JfrogCredentials, Utils } from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        let jfrogCredentials: JfrogCredentials = await Utils.getJfrogCredentials();
        await Utils.getAndAddCliToPath(jfrogCredentials);
        await Utils.configJFrogServers(jfrogCredentials);
       // await Utils.prepareGitHubJobSummaries();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

main();
