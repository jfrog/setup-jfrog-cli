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
        try {
            if (!utils_1.Utils.addCachedCliToPath()) {
                return;
            }
            yield publishBuildInfoIfNeeded();
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
function publishBuildInfoIfNeeded() {
    return __awaiter(this, void 0, void 0, function* () {
        core.exportVariable('JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR', '');
        let response = yield utils_1.Utils.runCliWithOutput(['rt', 'bp', '--dry-run']);
        console.log('Response:', response);
        console.log(hasUnpublishedModules(response));
        yield utils_1.Utils.runCli(['npm', 'i']);
        response = yield utils_1.Utils.runCliWithOutput(['rt', 'bp', '--dry-run']);
        console.log('Response:', response);
        console.log(hasUnpublishedModules(response));
    });
}
function hasUnpublishedModules(responseStr) {
    try {
        // Parse the JSON string to an object
        const response = JSON.parse(responseStr);
        // Check if the "modules" key exists and if it's an array with more than one item
        return response.modules && Array.isArray(response.modules) && response.modules.length > 0;
    }
    catch (error) {
        console.error('Failed to parse JSON:', error);
        return false; // Return false if parsing fails
    }
}
cleanup();
