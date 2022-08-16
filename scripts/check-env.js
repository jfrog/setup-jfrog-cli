/**
 * This file should be run only in the workflow that check this action.
 * @see{.github/workflows/workflow.yml}
 */

checkEnv('JFROG_CLI_OFFER_CONFIG', 'false');
checkEnv('JFROG_CLI_BUILD_NAME', process.env.GITHUB_WORKFLOW);
checkEnv('JFROG_CLI_BUILD_NUMBER', process.env.GITHUB_RUN_NUMBER);
checkEnv('JFROG_CLI_ENV_EXCLUDE', '*password*;*secret*;*key*;*token*;*auth*;JF_ARTIFACTORY_*;JF_ENV_*;JF_URL;JF_USER;JF_PASSWORD;JF_ACCESS_TOKEN');
checkEnv('JFROG_CLI_USER_AGENT', 'setup-jfrog-cli-github-action/' + require('../package.json').version);

function checkEnv(envKey, expectedValue) {
    // Verify that the environment variable is not empty
    if (!process.env[envKey]) {
        console.error(envKey + ' env is missing');
        process.exit(1);
    }
    // Verify that the environment variable is as expected
    if (process.env[envKey] !== expectedValue) {
        console.error(envKey + " env is '" + process.env[envKey] + "' but expected to be " + expectedValue);
        process.exit(1);
    }
    console.log(envKey + ' is correct');
}
