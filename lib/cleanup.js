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
const buildPublishCmd = 'build-publish';
function cleanup() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!utils_1.Utils.addCachedCliToPath()) {
                return;
            }
            if (!core.getBooleanInput(utils_1.Utils.POST_BUILD_PUBLISH_DISABLE)) {
                core.startGroup('Publish build info if needed');
                if (yield hasUnpublishedModules()) {
                    let buildPublishResponse = yield utils_1.Utils.runCliAndGetOutput(['rt', buildPublishCmd]);
                    console.log(buildPublishResponse);
                }
                core.endGroup();
            }
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
function hasUnpublishedModules() {
    return __awaiter(this, void 0, void 0, function* () {
        // Save the old value of the environment variable to revert it later
        const origValue = process.env[utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
        try {
            // Avoid saving a command summary for this dry-run command
            core.exportVariable(utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, '');
            // Running build-publish command with a dry-run flag to check if there are any unpublished modules
            const responseStr = yield utils_1.Utils.runCliAndGetOutput(['rt', buildPublishCmd, '--dry-run']);
            // Parse the JSON string to an object
            const response = JSON.parse(responseStr);
            // Check if the "modules" key exists and if it's an array with more than one item
            return response.modules != undefined && Array.isArray(response.modules) && response.modules.length > 0;
        }
        catch (error) {
            console.error('Failed to parse JSON:', error);
            return false; // Return false if parsing fails
        }
        finally {
            core.exportVariable(utils_1.Utils.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV, origValue);
        }
    });
}
cleanup();
