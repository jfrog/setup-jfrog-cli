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
exports.collectEvidences = collectEvidences;
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
const http_client_1 = require("@actions/http-client");
const fs_1 = require("fs");
const path = __importStar(require("path"));
/**
 * Collects evidences from the current workflow.
 * This function first checks if evidence collection is supported by the Artifactory server.
 */
function collectEvidences() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            core.startGroup('Collecting evidences');
            // Check if evidence collection is supported by the server
            const evidenceConfig = yield getEvidenceConfiguration();
            if (!evidenceConfig.external_evidence_collection_supported) {
                core.info('Evidence collection is not supported by this Artifactory server. Skipping evidence collection.');
                return;
            }
            core.info(`Evidence collection is supported. Maximum file size: ${evidenceConfig.max_evidence_file_size_mb} MB`);
            // Read sigstore bundle file paths and create evidence for each
            yield createEvidenceFromSigstoreBundles(evidenceConfig.max_evidence_file_size_mb);
        }
        catch (error) {
            core.warning('Failed while attempting to collect evidences: ' + error);
        }
        finally {
            core.endGroup();
        }
    });
}
/**
 * Checks if evidence collection is supported by the Artifactory server.
 * @returns EvidenceConfigResponse with support status and max file size
 */
function getEvidenceConfiguration() {
    return __awaiter(this, void 0, void 0, function* () {
        const credentials = utils_1.Utils.collectJfrogCredentialsFromEnvVars();
        if (!credentials.jfrogUrl) {
            throw new Error('JF_URL is required to check evidence support');
        }
        // Get access token for authentication
        let accessToken = credentials.accessToken;
        if (!accessToken && credentials.oidcProviderName) {
            // Import OidcUtils dynamically to avoid circular dependency
            const { OidcUtils } = yield Promise.resolve().then(() => __importStar(require('./oidc-utils')));
            accessToken = yield OidcUtils.exchangeOidcToken(credentials);
        }
        if (!accessToken) {
            throw new Error('No access token available for authentication');
        }
        // Remove trailing slash from jfrogUrl to avoid double slashes when appending the API path
        const url = `${credentials.jfrogUrl.replace(/\/$/, '')}/evidence/api/v1/config/`;
        const httpClient = new http_client_1.HttpClient();
        const headers = {
            'Authorization': `Bearer ${accessToken}`,
        };
        core.debug(`Getting evidence configuration at: ${url}`);
        let response;
        let body;
        try {
            response = yield httpClient.get(url, headers);
            body = yield response.readBody();
        }
        catch (error) {
            core.warning(`Failed to get evidence configuration (network error or server unavailable): ${error}`);
            return { external_evidence_collection_supported: false, max_evidence_file_size_mb: 0 };
        }
        if (response.message.statusCode !== 200) {
            core.warning(`Failed to get evidence configuration. Status: ${response.message.statusCode}, Response: ${body}`);
            return { external_evidence_collection_supported: false, max_evidence_file_size_mb: 0 };
        }
        try {
            const config = JSON.parse(body);
            return config;
        }
        catch (error) {
            core.warning(`Failed to parse evidence config response: ${error}`);
            return { external_evidence_collection_supported: false, max_evidence_file_size_mb: 0 };
        }
    });
}
/**
 * Reads sigstore bundle file paths and creates evidence for each file.
 * Reads from ${RUNNER_TEMP}/created_attestation_paths.txt
 * @param maxFileSizeMB Maximum allowed file size in MB
 */
function createEvidenceFromSigstoreBundles(maxFileSizeMB) {
    return __awaiter(this, void 0, void 0, function* () {
        const runnerTemp = process.env.RUNNER_TEMP;
        if (!runnerTemp) {
            core.warning('RUNNER_TEMP environment variable is not set. Skipping evidence creation.');
            return;
        }
        const attestationPathsFile = path.join(runnerTemp, 'created_attestation_paths.txt');
        try {
            // Check if the file exists
            yield fs_1.promises.access(attestationPathsFile);
        }
        catch (error) {
            core.info(`No attestation paths file found. Skipping evidence creation. Searched for: ${attestationPathsFile}. Error: ${error}`);
            return;
        }
        // Read the file content
        core.info(`Reading attestation paths file: ${attestationPathsFile}`);
        const fileContent = yield fs_1.promises.readFile(attestationPathsFile, 'utf8');
        const filePaths = fileContent.split('\n').filter(line => line.trim() !== '');
        if (filePaths.length === 0) {
            core.info('No sigstore bundle files found in attestation paths file.');
            return;
        }
        core.info(`Found ${filePaths.length} sigstore bundle file(s) to process.`);
        for (const filePath of filePaths) {
            try {
                const fileStats = yield fs_1.promises.stat(filePath);
                const fileSizeMB = fileStats.size / (1024 * 1024); // Convert bytes to MB
                if (fileSizeMB > maxFileSizeMB) {
                    core.warning(`Skipping ${filePath}: File size (${fileSizeMB.toFixed(2)} MB) exceeds maximum allowed size (${maxFileSizeMB} MB)`);
                    continue;
                }
                core.info(`Creating evidence for: ${filePath}`);
                const output = yield utils_1.Utils.runCliAndGetOutput(['evd', 'create', '--sigstore-bundle', filePath]);
                core.info(`Evidence created successfully for ${filePath}: ${output}`);
            }
            catch (error) {
                core.warning(`Failed to create evidence for ${filePath}: ${error}`);
            }
        }
    });
}
