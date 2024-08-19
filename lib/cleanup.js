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
const http_client_1 = require("@actions/http-client");
const AUTO_BUILD_PUBLISH_TEST = 'AUTO_BUILD_PUBLISH_TEST';
function cleanup() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!addCachedCliToPath()) {
            return;
        }
        try {
            if (!core.getBooleanInput(utils_1.Utils.AUTO_BUILD_PUBLISH_DISABLE)) {
                yield collectAndPublishBuildInfoIfNeeded();
                // The following check is only relevant when the cleanup function is running inside a GitHub Actions test workflow
                if (!core.getState(AUTO_BUILD_PUBLISH_TEST)) {
                    // Check that build info was published successfully
                    yield checkBuildInfoExistsInArtifactory();
                }
            }
        }
        catch (error) {
            core.warning('failed while attempting to publish build info: ' + error);
        }
        try {
            core.startGroup('Cleanup JFrog CLI servers configuration');
            yield utils_1.Utils.removeJFrogServers();
            if (!core.getBooleanInput(utils_1.Utils.JOB_SUMMARY_DISABLE)) {
                yield utils_1.Utils.generateWorkflowSummaryMarkdown();
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
        finally {
            core.endGroup();
        }
    });
}
function addCachedCliToPath() {
    // Get the JFrog CLI path from step state. saveState/getState are methods to pass data between a step, and it's cleanup function.
    const jfrogCliPath = core.getState(utils_1.Utils.JFROG_CLI_PATH_STATE);
    if (!jfrogCliPath) {
        // This means that the JFrog CLI was not installed in the first place, because there was a failure in the installation step.
        return false;
    }
    core.addPath(jfrogCliPath);
    return true;
}
function hasUnpublishedModules(workingDirectory) {
    return __awaiter(this, void 0, void 0, function* () {
        // Save the old value of the environment variable to revert it later
        const origValue = process.env[utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
        try {
            // Avoid saving a command summary for this dry-run command
            core.exportVariable(utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, '');
            // Running build-publish command with a dry-run flag to check if there are any unpublished modules, 'silent' to avoid polluting the logs
            const responseStr = yield utils_1.Utils.runCliAndGetOutput(['rt', 'build-publish', '--dry-run'], { silent: true, cwd: workingDirectory });
            // Parse the JSON string to an object
            const response = JSON.parse(responseStr);
            // Check if the "modules" key exists and if it's an array with more than one item
            return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
        }
        catch (error) {
            core.error('Failed to parse JSON: ' + error);
            return false; // Return false if parsing fails
        }
        finally {
            core.exportVariable(utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, origValue);
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
        core.startGroup('Collect environment variables information');
        yield utils_1.Utils.runCli(['rt', 'build-collect-env'], { cwd: workingDirectory });
        core.endGroup();
        core.startGroup('Collect the Git information');
        yield utils_1.Utils.runCli(['rt', 'build-add-git'], { cwd: workingDirectory });
        core.endGroup();
        core.startGroup('Publish the build info to JFrog Artifactory');
        yield utils_1.Utils.runCli(['rt', 'build-publish'], { cwd: workingDirectory });
        core.endGroup();
    });
}
function getWorkingDirectory() {
    const workingDirectory = process.env.GITHUB_WORKSPACE;
    if (!workingDirectory) {
        throw new Error('GITHUB_WORKSPACE is not defined.');
    }
    return workingDirectory;
}
function checkBuildInfoExistsInArtifactory() {
    return __awaiter(this, void 0, void 0, function* () {
        // Define the API endpoint for the build-info
        const url = `${process.env.JF_URL}/artifactory/api/build/${process.env.JFROG_CLI_BUILD_NAME}/${process.env.JFROG_CLI_BUILD_NUMBER}`;
        const headers = {
            Authorization: utils_1.Utils.generateAuthString({
                user: process.env.JF_USER,
                password: process.env.JF_PASSWORD
            }),
        };
        try {
            // Send GET request to the API
            const response = yield new http_client_1.HttpClient().get(url, headers);
            // Check if the status is 200 (OK)
            const statusCode = response.message.statusCode;
            if (statusCode !== 200) {
                core.info(`Build-info not found. Status ${statusCode}, Response: ${yield response.readBody()}`);
                return;
            }
            core.info(`Build-info successfully published!`);
            return;
        }
        catch (error) {
            core.error(`Error occurred while making the API request - '${url}' :${error}`);
            return;
        }
    });
}
cleanup();
