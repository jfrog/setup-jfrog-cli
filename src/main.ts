import * as core from '@actions/core';
import { Utils } from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        console.log("ERAN CHECK: starting access Token flow")
        let accessToken = await Utils.getJfrogAccessToken()
        console.log(`ERAN CHECK: finished access token flow with access token: ${accessToken}`)
        await Utils.getAndAddCliToPath();
        await Utils.configJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

main();
