import * as core from '@actions/core';
import { Utils } from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        Utils.setCliEnv();
        await Utils.addCliToPath();
        await Utils.configJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

main();
