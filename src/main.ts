import * as core from '@actions/core';
import {JfrogCredentials, Utils} from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        console.log("ERAN CHECK: ####################### 35 #######################") // TODO del
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
