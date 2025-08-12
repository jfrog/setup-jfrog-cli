import * as core from '@actions/core';
import { Utils } from './utils';
import { JobSummary } from './job-summary';
import { collectEvidences } from './evidence-collection';

async function cleanup() {
    if (await shouldSkipCleanup()) {
        return;
    }

    // Run post tasks related to Build Info (auto build publish, evidence collection, job summary)
    await buildInfoPostTasks();

    // Cleanup JFrog CLI servers configuration
    try {
        core.startGroup('Cleanup JFrog CLI servers configuration');
        await Utils.removeJFrogServers();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.endGroup();
    }
}

/**
 * Executes post tasks related to build information.
 *
 * This function performs several tasks after the main build process:
 * 1. Checks if auto build publish, evidence collection, and job summary are disabled.
 * 2. Verifies connection to JFrog Artifactory.
 * 3. Collects and publishes build information if needed.
 * 4. Collects evidences if enabled.
 * 5. Generates a job summary if required.
 */
async function buildInfoPostTasks() {
    const disableAutoBuildPublish: boolean = core.getBooleanInput(Utils.AUTO_BUILD_PUBLISH_DISABLE);
    const disableAutoEvidenceCollection: boolean = core.getBooleanInput(Utils.AUTO_EVIDENCE_COLLECTION_DISABLE);
    const disableJobSummary: boolean = core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE) || !JobSummary.isJobSummarySupported();
    if (disableAutoBuildPublish && disableAutoEvidenceCollection && disableJobSummary) {
        core.info(`All post tasks (auto-build-publish, evidence collection, and job-summary) are disabled. Skipping Build Info post tasks.`);
        return;
    }

    // Check connection to Artifactory before proceeding with build info post tasks
    const pingWorked: boolean = await checkConnectionToArtifactory();

    // Auto-publish build info if needed
    if (pingWorked && !disableAutoBuildPublish) {
        await collectAndPublishBuildInfoIfNeeded();
    } else {
        core.info('Auto build info publish is disabled or jf rt ping failed. Skipping auto build info collection and publishing');
    }

    // Collect evidences if not disabled. Evidence use Access token that may not work with jf rt ping.
    if (!disableAutoEvidenceCollection) {
        await collectEvidences();
    } else {
        core.info('Auto evidence collection is disabled. Skipping evidence collection');
    }

    // Generate job summary if not disabled and the JFrog CLI version supports it
    if (pingWorked && !disableJobSummary) {
        await generateJobSummary();
    } else {
        core.info('Job summary is disabled or jf rt ping failed. Skipping job summary generation');
    }
}

interface BuildPublishResponse {
    modules: any[];
}

async function hasUnpublishedModules(workingDirectory: string): Promise<boolean> {
    // Save the old value of the environment variable to revert it later
    const origValue: string | undefined = process.env[JobSummary.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
    try {
        core.startGroup('Check for unpublished modules');
        // Avoid saving a command summary for this dry-run command
        core.exportVariable(JobSummary.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, '');

        // Running build-publish command with a dry-run flag to check if there are any unpublished modules, 'silent' to avoid polluting the logs
        const responseStr: string = await Utils.runCliAndGetOutput(['rt', 'build-publish', '--dry-run'], { cwd: workingDirectory });

        // Parse the JSON string to an object
        const response: BuildPublishResponse = JSON.parse(responseStr);
        // Check if the "modules" key exists and if it's an array with more than one item
        return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
    } catch (error) {
        core.warning('Failed to check if there are any unpublished modules: ' + error);
        return false;
    } finally {
        core.exportVariable(JobSummary.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, origValue);
        core.endGroup();
    }
}

async function collectAndPublishBuildInfoIfNeeded() {
    const workingDirectory: string = getWorkingDirectory();
    // Check if there are any unpublished modules
    if (!(await hasUnpublishedModules(workingDirectory))) {
        return;
    }

    // The flow here is to collect Git information before publishing the build info.
    // We allow this step to fail, and we don't want to fail the entire build publish if they do.
    try {
        core.startGroup('Collect the Git information');
        await Utils.runCli(['rt', 'build-add-git'], { cwd: workingDirectory });
    } catch (error) {
        core.warning('Failed while attempting to collect Git information: ' + error);
    } finally {
        core.endGroup();
    }

    // Publish the build info to Artifactory
    try {
        core.startGroup('Publish the build info to JFrog Artifactory');
        // Set the environment variable to indicate that the build has been automatically published.
        // This is used by the usage report to track instances of automatic build publication.
        core.exportVariable('JFROG_CLI_USAGE_AUTO_BUILD_PUBLISHED', 'TRUE');
        await Utils.runCli(['rt', 'build-publish'], { cwd: workingDirectory });
    } catch (error) {
        core.warning('Failed while attempting to publish the build info to JFrog Artifactory: ' + error);
    } finally {
        core.endGroup();
    }
}

function getWorkingDirectory(): string {
    const workingDirectory: string | undefined = process.env.GITHUB_WORKSPACE;
    if (!workingDirectory) {
        throw new Error('GITHUB_WORKSPACE is not defined.');
    }
    return workingDirectory;
}

export async function checkConnectionToArtifactory(): Promise<boolean> {
    try {
        core.startGroup('Checking connection to JFrog Artifactory');
        const pingResult: string = await Utils.runCliAndGetOutput(['rt', 'ping']);
        if (pingResult.trim() !== 'OK') {
            core.debug(`Ping result: ${pingResult}`);
            core.warning('Could not connect to Artifactory. Skipping Build Info post tasks.');
            return false;
        }
        return true;
    } catch (error) {
        core.warning(`An error occurred while trying to connect to Artifactory: ${error}. Skipping Build Info post tasks.`);
        return false;
    } finally {
        core.endGroup();
    }
}

async function generateJobSummary() {
    try {
        core.startGroup('Generating Job Summary');
        await Utils.runCli(['generate-summary-markdown']);
        await JobSummary.setMarkdownAsJobSummary();
        await JobSummary.populateCodeScanningTab();
        // Clear files
        await JobSummary.clearCommandSummaryDir();
    } catch (error) {
        core.warning('Failed while attempting to generate job summary: ' + error);
    } finally {
        core.endGroup();
    }
}

async function shouldSkipCleanup(): Promise<boolean> {
    if (!Utils.loadFromCache(core.getInput(Utils.CLI_VERSION_ARG))) {
        core.warning('Could not find JFrog CLI executable. Skipping cleanup.');
        return true;
    }

    // Skip cleanup if no servers are configured (already removed)
    const servers: string | undefined = process.env[Utils.JFROG_CLI_SERVER_IDS_ENV_VAR];
    if (!servers) {
        core.debug('No servers are configured. Skipping cleanup.');
        return true;
    }
    return false;
}

cleanup();
