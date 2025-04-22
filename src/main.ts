import * as core from '@actions/core';
import { JfrogCredentials } from './types';
import { Utils } from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        let jfrogCredentials: JfrogCredentials = Utils.collectJfrogCredentialsFromEnvVars();
        await Utils.getAndAddCliToPath(jfrogCredentials);
        await Utils.configJFrogServers(jfrogCredentials);
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

main();
