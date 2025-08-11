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
exports.getSigstoreBundlePaths = getSigstoreBundlePaths;
const core = __importStar(require("@actions/core"));
const utils_1 = require("./utils");
const http_client_1 = require("@actions/http-client");
const fs_1 = require("fs");
const path = __importStar(require("path"));
/**
 * Collects evidences from the current workflow.
 * This function first checks if attestation files exist, then checks if evidence collection is supported by the Artifactory server.
 */
function collectEvidences() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            core.startGroup('Collecting evidences');
            // Check authentication method first - evidence collection requires access token or OIDC
            const credentials = utils_1.Utils.collectJfrogCredentialsFromEnvVars();
            if (!credentials.accessToken && !credentials.oidcProviderName && (credentials.username || credentials.password)) {
                core.info('Evidence collection does not support authentication with username and password. Skipping evidence collection.');
                return;
            }
            // Check if attestation files exist first to fail fast
            const filePaths = yield getSigstoreBundlePaths();
            if (filePaths.length === 0) {
                return;
            }
            // Check if evidence collection is supported by the server
            const evidenceConfig = yield getEvidenceConfiguration();
            if (!evidenceConfig.external_evidence_collection_supported) {
                core.info("Evidence collection is not supported by Artifactory's license type. Skipping evidence collection.");
                return;
            }
            // Use a default limit if the server doesn't provide one
            const maxFileSizeMB = (_a = evidenceConfig.evidence_file_size_limit_mb) !== null && _a !== void 0 ? _a : 16;
            core.info(`Evidence collection is supported. Maximum file size: ${maxFileSizeMB} MB`);
            // Create evidence for each sigstore bundle file
            yield createEvidenceFromSigstoreBundles(maxFileSizeMB, filePaths);
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
        // Try to get access token if not available
        if (!accessToken && credentials.oidcProviderName) {
            // Import OidcUtils dynamically to avoid circular dependency
            const { OidcUtils } = yield Promise.resolve().then(() => __importStar(require('./oidc-utils')));
            accessToken = yield OidcUtils.exchangeOidcToken(credentials);
        }
        // Check if we have access token available
        if (!accessToken) {
            throw new Error('No access token available for authentication. Evidence collection requires access token authentication.');
        }
        // Remove trailing slash from jfrogUrl to avoid double slashes when appending the API path
        const url = `${credentials.jfrogUrl.replace(/\/$/, '')}/evidence/api/v1/config/`;
        const httpClient = new http_client_1.HttpClient();
        const headers = {
            Authorization: `Bearer ${accessToken}`,
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
            return { external_evidence_collection_supported: false, evidence_file_size_limit_mb: 0 };
        }
        if (response.message.statusCode !== 200) {
            core.warning(`Failed to get evidence configuration. Status: ${response.message.statusCode}, Response: ${body}`);
            return { external_evidence_collection_supported: false, evidence_file_size_limit_mb: 0 };
        }
        try {
            const config = JSON.parse(body);
            return config;
        }
        catch (error) {
            core.warning(`Failed to parse evidence config response: ${error}`);
            return { external_evidence_collection_supported: false, evidence_file_size_limit_mb: 0 };
        }
    });
}
/**
 * Read and parse sigstore bundle file paths from the attestation paths file
 * @returns Array of file paths, or empty array if file doesn't exist or is empty
 */
function getSigstoreBundlePaths() {
    return __awaiter(this, void 0, void 0, function* () {
        const runnerTemp = process.env.RUNNER_TEMP;
        if (!runnerTemp) {
            core.warning('RUNNER_TEMP environment variable is not set. Skipping evidence creation.');
            return [];
        }
        const attestationPathsFile = path.join(runnerTemp, 'created_attestation_paths.txt');
        try {
            // Check if the file exists
            yield fs_1.promises.access(attestationPathsFile);
        }
        catch (error) {
            core.info(`No attestation paths file found. Skipping evidence creation. Searched for: ${attestationPathsFile}. Error: ${error}`);
            return [];
        }
        // Read the file content
        core.info(`Reading attestation paths file: ${attestationPathsFile}`);
        const fileContent = yield fs_1.promises.readFile(attestationPathsFile, 'utf8');
        const filePaths = fileContent.split('\n').filter((line) => line.trim() !== '');
        if (filePaths.length === 0) {
            core.info('No sigstore bundle files found in attestation paths file.');
            return [];
        }
        core.info(`Found ${filePaths.length} sigstore bundle file(s) to process.`);
        return filePaths;
    });
}
/**
 * Creates evidence for sigstore bundle files.
 * @param maxFileSizeMB Maximum allowed file size in MB
 * @param filePaths Array of file paths to process
 */
function createEvidenceFromSigstoreBundles(maxFileSizeMB, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const filePath of filePaths) {
            try {
                const fileStats = yield fs_1.promises.stat(filePath);
                const fileSizeMB = fileStats.size / (1024 * 1024); // Convert bytes to MB
                if (fileSizeMB > maxFileSizeMB) {
                    core.warning(`Skipping ${filePath}: File size (${fileSizeMB.toFixed(2)} MB) exceeds maximum allowed size (${maxFileSizeMB} MB)`);
                    continue;
                }
                core.info(`Creating evidence for: ${filePath}`);
                const output = yield utils_1.Utils.runCliAndGetOutput(['evd', 'create', '--sigstore-bundle', filePath, '--provider-id', 'github']);
                core.info(`Evidence created successfully for ${filePath}: ${output}`);
            }
            catch (error) {
                core.warning(`Failed to create evidence for ${filePath}: ${error}`);
            }
        }
    });
}
