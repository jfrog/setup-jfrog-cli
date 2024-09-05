"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
function cleanup() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!utils_1.Utils.loadFromCache(core.getInput(utils_1.Utils.CLI_VERSION_ARG))) {
            core.warning('Could not find JFrog CLI executable. Skipping cleanup.');
            return;
        }
        // Run post tasks related to Build Info (auto build publish, job summary)
        yield buildInfoPostTasks();
        // Cleanup JFrog CLI servers configuration
        try {
            core.startGroup('Cleanup JFrog CLI servers configuration');
            yield utils_1.Utils.removeJFrogServers();
        }
        catch (error) {
            core.setFailed(error.message);
        }
        finally {
            core.endGroup();
        }
    });
}
/**
 * Executes post tasks related to build information.
 *
 * This function performs several tasks after the main build process:
 * 1. Checks if auto build publish and job summary are disabled.
 * 2. Verifies connection to JFrog Artifactory.
 * 3. Collects and publishes build information if needed.
 * 4. Generates a job summary if required.
 */
function buildInfoPostTasks() {
    return __awaiter(this, void 0, void 0, function* () {
        const disableAutoBuildPublish = core.getBooleanInput(utils_1.Utils.AUTO_BUILD_PUBLISH_DISABLE);
        const disableJobSummary = core.getBooleanInput(utils_1.Utils.JOB_SUMMARY_DISABLE) || !utils_1.Utils.isJobSummarySupported();
        if (disableAutoBuildPublish && disableJobSummary) {
            core.info(`Both auto-build-publish and job-summary are disabled. Skipping Build Info post tasks.`);
            return;
        }
        // Check connection to Artifactory before proceeding with build info post tasks
        if (!(yield checkConnectionToArtifactory())) {
            return;
        }
        // Auto-publish build info if needed
        if (!disableAutoBuildPublish) {
            yield collectAndPublishBuildInfoIfNeeded();
        }
        else {
            core.info('Auto build info publish is disabled. Skipping auto build info collection and publishing');
        }
        // Generate job summary if not disabled and the JFrog CLI version supports it
        if (!disableJobSummary) {
            yield generateJobSummary();
        }
        else {
            core.info('Job summary is disabled. Skipping job summary generation');
        }
    });
}
function hasUnpublishedModules(workingDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        // Save the old value of the environment variable to revert it later
        const origValue = process.env[utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
        try {
            core.startGroup('Check for unpublished modules');
            // Avoid saving a command summary for this dry-run command
            core.exportVariable(utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, '');
            // Running build-publish command with a dry-run flag to check if there are any unpublished modules, 'silent' to avoid polluting the logs
            const responseStr = yield utils_1.Utils.runCliAndGetOutput(['rt', 'build-publish', '--dry-run'], { cwd: workingDirectory });
            // Parse the JSON string to an object
            const response = JSON.parse(responseStr);
            // Check if the "modules" key exists and if it's an array with more than one item
            return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
        }
        catch (error) {
            core.warning('Failed to check if there are any unpublished modules: ' + error);
            return false;
        }
        finally {
            core.exportVariable(utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, origValue);
            core.endGroup();
        }
    });
}
function collectAndPublishBuildInfoIfNeeded() {
    return __awaiter(this, void 0, void 0, function* () {
        const workingDirectory = getWorkingDirectory();
        // Check if there are any unpublished modules
        if (!(yield hasUnpublishedModules(workingDirectory))) {
            return;
        }
        // The flow here is to collect Git information before publishing the build info.
        // We allow this step to fail, and we don't want to fail the entire build publish if they do.
        try {
            core.startGroup('Collect the Git information');
            yield utils_1.Utils.runCli(['rt', 'build-add-git'], { cwd: workingDirectory });
        }
        catch (error) {
            core.warning('Failed while attempting to collect Git information: ' + error);
        }
        finally {
            core.endGroup();
        }
        // Publish the build info to Artifactory
        try {
            core.startGroup('Publish the build info to JFrog Artifactory');
            yield utils_1.Utils.runCli(['rt', 'build-publish'], { cwd: workingDirectory });
        }
        catch (error) {
            core.warning('Failed while attempting to publish the build info to JFrog Artifactory: ' + error);
        }
        finally {
            core.endGroup();
        }
    });
}
function getWorkingDirectory() {
    const workingDirectory = process.env.GITHUB_WORKSPACE;
    if (!workingDirectory) {
        throw new Error('GITHUB_WORKSPACE is not defined.');
    }
    return workingDirectory;
}
function checkConnectionToArtifactory() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            core.startGroup('Checking connection to JFrog Artifactory');
            const pingResult = yield utils_1.Utils.runCliAndGetOutput(['rt', 'ping']);
            if (pingResult.trim() !== 'OK') {
                core.debug(`Ping result: ${pingResult}`);
                core.warning('Could not connect to Artifactory. Skipping Build Info post tasks.');
                return false;
            }
            return true;
        }
        catch (error) {
            core.warning(`An error occurred while trying to connect to Artifactory: ${error}. Skipping Build Info post tasks.`);
            return false;
        }
        finally {
            core.endGroup();
        }
    });
}
function generateJobSummary() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            core.startGroup('Generating Job Summary');
            yield utils_1.Utils.runCli(['generate-summary-markdown']);
            yield utils_1.Utils.setMarkdownAsJobSummary();
            yield utils_1.Utils.populateCodeScanningTab();
            // Clear files
            yield utils_1.Utils.clearCommandSummaryDir();
        }
        catch (error) {
            core.warning('Failed while attempting to generate job summary: ' + error);
        }
        finally {
            core.endGroup();
        }
    });
}
cleanup();
