import * as core from '@actions/core';
import {JfrogCredentials, Utils} from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        console.log("ERAN CHECK: ####################### 35 #######################") // TODO del
        let jfrogCredentials :JfrogCredentials = await Utils.getJfrogCredentials() //TODO make it return a struct with: username, password and access_token, jfrog url
        console.log(`ERAN CHECK: finished access token flow with access token: ${jfrogCredentials.accessToken}`) // TODO del
        await Utils.getAndAddCliToPath();
        await Utils.configJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

main();
