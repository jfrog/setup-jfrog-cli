import * as core from '@actions/core';
import { Utils } from './utils';
import { HttpClient, HttpClientResponse } from '@actions/http-client';
import { OutgoingHttpHeaders } from 'http';
import { JfrogCredentials } from './types';
import { promises as fs } from 'fs';
import * as path from 'path';

interface EvidenceConfigResponse {
    external_evidence_collection_supported: boolean;
    evidence_file_size_limit_mb?: number;
}

/**
 * Collects evidences from the current workflow.
 * This function first checks if attestation files exist, then checks if evidence collection is supported by the Artifactory server.
 */
export async function collectEvidences() {
    try {
        core.startGroup('Collecting evidence');

        // Check authentication method first - evidence collection requires access token or OIDC
        const credentials = Utils.collectJfrogCredentialsFromEnvVars();
        if (!credentials.accessToken && !credentials.oidcProviderName && (credentials.username || credentials.password)) {
            core.info('Evidence collection does not support authentication with username and password. Skipping evidence collection.');
            return;
        }

        // Check if attestation files exist first to fail fast
        const filePaths = await getSigstoreBundlePaths();
        if (filePaths.length === 0) {
            return;
        }

        // Check if evidence collection is supported by the server
        const evidenceConfig = await getEvidenceConfiguration();
        if (!evidenceConfig.external_evidence_collection_supported) {
            return;
        }

        // Use a default limit if the server doesn't provide one
        const maxFileSizeMB = evidenceConfig.evidence_file_size_limit_mb ?? 16;
        core.info(`Evidence collection is supported. Maximum file size: ${maxFileSizeMB} MB`);

        // Create evidence for each sigstore bundle file
        await createEvidenceFromSigstoreBundles(maxFileSizeMB, filePaths);
    } catch (error) {
        core.warning('Failed while attempting to collect evidences: ' + error);
    } finally {
        core.endGroup();
    }
}

/**
 * Checks if evidence collection is supported by the Artifactory server.
 * @returns EvidenceConfigResponse with support status and max file size
 */
async function getEvidenceConfiguration(): Promise<EvidenceConfigResponse> {
    const credentials = Utils.collectJfrogCredentialsFromEnvVars();

    if (!credentials.jfrogUrl) {
        throw new Error('JF_URL is required to check evidence support');
    }

    // Get access token for authentication
    let accessToken = credentials.accessToken;

    // Try to get access token if not available
    if (!accessToken && credentials.oidcProviderName) {
        // Import OidcUtils dynamically to avoid circular dependency
        const { OidcUtils } = await import('./oidc-utils');
        accessToken = await OidcUtils.exchangeOidcToken(credentials);
    }

    // Check if we have access token available
    if (!accessToken) {
        throw new Error('No access token available for authentication. Evidence collection requires access token authentication.');
    }

    // Remove trailing slash from jfrogUrl to avoid double slashes when appending the API path
    const url = `${credentials.jfrogUrl.replace(/\/$/, '')}/evidence/api/v1/config/`;
    const httpClient = new HttpClient();
    const headers: OutgoingHttpHeaders = {
        Authorization: `Bearer ${accessToken}`,
    };

    core.debug(`Getting evidence configuration at: ${url}`);
    let response: HttpClientResponse;
    let body: string;
    try {
        response = await httpClient.get(url, headers);
        body = await response.readBody();
    } catch (error) {
        core.warning(`Failed to get evidence configuration (network error or server unavailable): ${error}`);
        return { external_evidence_collection_supported: false, evidence_file_size_limit_mb: 0 };
    }

    // 200 OK
    if (response.message.statusCode !== 200) {
        // 401 Unauthorized
        if (response.message.statusCode === 401) {
            core.warning(
                `Failed to get evidence configuration. Given credentials are not sufficient` +
                    ` to create evidence in the JFrog platform, Response: ${body}`,
            );
        } else {
            core.warning(`Failed to get evidence configuration. Status: ${response.message.statusCode}, Response: ${body}`);
        }

        return { external_evidence_collection_supported: false, evidence_file_size_limit_mb: 0 };
    }

    try {
        const config: EvidenceConfigResponse = JSON.parse(body);
        if (!config.external_evidence_collection_supported) {
            core.info("Evidence collection is not supported by Artifactory's license type. Skipping evidence collection.");
        }
        return config;
    } catch (error) {
        core.warning(`Failed to parse evidence config response: ${error}`);
        return { external_evidence_collection_supported: false, evidence_file_size_limit_mb: 0 };
    }
}

/**
 * Read and parse sigstore bundle file paths from the attestation paths file
 * @returns Array of file paths, or empty array if file doesn't exist or is empty
 */
export async function getSigstoreBundlePaths(): Promise<string[]> {
    const runnerTemp = process.env.RUNNER_TEMP;
    if (!runnerTemp) {
        core.warning('RUNNER_TEMP environment variable is not set. Skipping evidence creation.');
        return [];
    }

    const attestationPathsFile = path.join(runnerTemp, 'created_attestation_paths.txt');

    try {
        // Check if the file exists
        await fs.access(attestationPathsFile);
    } catch (error) {
        core.info(`No attestation paths file found. Skipping evidence creation. Searched for: ${attestationPathsFile}. Error: ${error}`);
        return [];
    }

    // Read the file content
    core.info(`Reading attestation paths file: ${attestationPathsFile}`);
    const fileContent = await fs.readFile(attestationPathsFile, 'utf8');
    const filePaths = fileContent.split('\n').filter((line) => line.trim() !== '');

    if (filePaths.length === 0) {
        core.info('No sigstore bundle files found in attestation paths file.');
        return [];
    }

    core.info(`Found ${filePaths.length} sigstore bundle file(s) to process.`);
    if (core.isDebug()) {
        filePaths.forEach((filePath) => {
            core.debug(`Sigstore bundle file found: ${filePath}`);
        });
    }
    return filePaths;
}

/**
 * Creates evidence for sigstore bundle files.
 * @param maxFileSizeMB Maximum allowed file size in MB
 * @param filePaths Array of file paths to process
 */
async function createEvidenceFromSigstoreBundles(maxFileSizeMB: number, filePaths: string[]) {
    for (const filePath of filePaths) {
        try {
            const fileStats = await fs.stat(filePath);
            const fileSizeMB = fileStats.size / (1024 * 1024); // Convert bytes to MB

            if (fileSizeMB > maxFileSizeMB) {
                core.warning(`Skipping ${filePath}: File size (${fileSizeMB.toFixed(2)} MB) exceeds maximum allowed size (${maxFileSizeMB} MB)`);
                continue;
            }

            core.info(`Creating evidence for: ${filePath}`);
            const output = await Utils.runCliAndGetOutput(['evd', 'create', '--sigstore-bundle', filePath, '--provider-id', 'github']);
            core.info(`Evidence created successfully for ${filePath}: ${output}`);
        } catch (error) {
            core.warning(`Failed to create evidence for ${filePath}: ${error}`);
        }
    }
}
