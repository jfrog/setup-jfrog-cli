import * as core from '@actions/core';
import {JfrogCredentials, Utils} from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        // If a valid server url is not found in JF_URL and neither through JF_ENV_*, an Error will be thrown
        //let credentialsCollectionMode: string = Utils.assertCliEnvAndReturnCredCollectionMode()
        let jfrogCredentials :JfrogCredentials = await Utils.getJfrogCredentials()

        await Utils.getAndAddCliToPath(jfrogCredentials);
        await Utils.configJFrogServers(jfrogCredentials);
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

main();
