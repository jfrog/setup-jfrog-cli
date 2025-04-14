import * as core from '@actions/core';
import { JfrogCredentials, Utils } from './utils';

async function main() {
    try {
        core.startGroup('Setup JFrog CLI');
        if (core.getInput(Utils.OIDC_ONLY) !== 'true') {
            Utils.setCliEnv();
        } else {
            core.debug('Skipping CLI env setup as oidc-only is enabled.');
        }
        let jfrogCredentials: JfrogCredentials = await Utils.getJfrogCredentials();
        if (core.getInput(Utils.OIDC_ONLY) !== 'true') {
            await Utils.getAndAddCliToPath(jfrogCredentials);
            await Utils.configJFrogServers(jfrogCredentials);
        } else {
            core.debug('Skipping JFrog CLI setup as oidc-only is enabled.');
        }
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

main();
