import * as core from '@actions/core';
import { Utils } from './utils';
import {HttpClient, HttpClientResponse} from '@actions/http-client';
import http from "http";

const AUTO_BUILD_PUBLISH_TEST: string = 'AUTO_BUILD_PUBLISH_TEST';

async function cleanup() {
    if (!addCachedCliToPath()) {
        return;
    }
    try {
        if (!core.getBooleanInput(Utils.AUTO_BUILD_PUBLISH_DISABLE)) {
            await collectAndPublishBuildInfoIfNeeded();

            // The following check is only relevant when the cleanup function is running inside a GitHub Actions test workflow
            if (!core.getState(AUTO_BUILD_PUBLISH_TEST)) {
                // Check that build info was published successfully
                await checkBuildInfoExistsInArtifactory();
            }
        }
    } catch (error) {
        core.warning('failed while attempting to publish build info: ' + error);
    }

    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        await Utils.removeJFrogServers();
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            await Utils.generateWorkflowSummaryMarkdown();
        }
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

function addCachedCliToPath(): boolean {
    // Get the JFrog CLI path from step state. saveState/getState are methods to pass data between a step, and it's cleanup function.
    const jfrogCliPath: string = core.getState(Utils.JFROG_CLI_PATH_STATE);
    if (!jfrogCliPath) {
        // This means that the JFrog CLI was not installed in the first place, because there was a failure in the installation step.
        return false;
    }
    core.addPath(jfrogCliPath);
    return true;
}

interface BuildPublishResponse {
    modules: any[];
}

async function hasUnpublishedModules(workingDirectory: string): Promise<boolean> {
    // Save the old value of the environment variable to revert it later
    const origValue: string | undefined = process.env[Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
    try {
        // Avoid saving a command summary for this dry-run command
        core.exportVariable(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, '');

        // Running build-publish command with a dry-run flag to check if there are any unpublished modules, 'silent' to avoid polluting the logs
        const responseStr: string = await Utils.runCliAndGetOutput(['rt', 'build-publish', '--dry-run'], { silent: true, cwd: workingDirectory });

        // Parse the JSON string to an object
        const response: BuildPublishResponse = JSON.parse(responseStr);
        // Check if the "modules" key exists and if it's an array with more than one item
        return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
    } catch (error) {
        core.error('Failed to parse JSON: ' + error);
        return false; // Return false if parsing fails
    } finally {
        core.exportVariable(Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, origValue);
    }
}

async function collectAndPublishBuildInfoIfNeeded() {
    const workingDirectory: string = getWorkingDirectory();
    // Check if there are any unpublished modules
    if (!(await hasUnpublishedModules(workingDirectory))) {
        return;
    }

    core.startGroup('Collect environment variables information');
    await Utils.runCli(['rt', 'build-collect-env'], { cwd: workingDirectory });
    core.endGroup();

    core.startGroup('Collect the Git information');
    await Utils.runCli(['rt', 'build-add-git'], { cwd: workingDirectory });
    core.endGroup();

    core.startGroup('Publish the build info to JFrog Artifactory');
    await Utils.runCli(['rt', 'build-publish'], { cwd: workingDirectory });
    core.endGroup();
}

function getWorkingDirectory(): string {
    const workingDirectory: string | undefined = process.env.GITHUB_WORKSPACE;
    if (!workingDirectory) {
        throw new Error('GITHUB_WORKSPACE is not defined.');
    }
    return workingDirectory;
}

async function checkBuildInfoExistsInArtifactory() {
    // Define the API endpoint for the build-info
    const url: string = `${process.env.JF_URL}/artifactory/api/build/${process.env.JFROG_CLI_BUILD_NAME}/${process.env.JFROG_CLI_BUILD_NUMBER}`;
    const headers: http.OutgoingHttpHeaders = {
        Authorization: Utils.generateAuthString({user: process.env.JF_USER, password: process.env.JF_PASSWORD}),
    };
    try {
        // Send GET request to the API
        const response: HttpClientResponse = await new HttpClient().get(url, headers);

        // Check if the status is 200 (OK)
        const statusCode: number | undefined = response.message.statusCode;
        if (statusCode !== 200) {
            core.info(`Build-info not found. Status ${statusCode}, Response: ${await response.readBody()}`);
            return;
        }
        core.info(`Build-info successfully published!`);
        return;
    } catch (error) {
        core.error(`Error occurred while making the API request - '${url}' :${error}`);
        return;
    }
}

cleanup();
