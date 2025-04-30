"use strict";
/**
 * OIDC Utility functions for JFrog CLI setup and GitHub OIDC integration.
 * Handles CLI-based and manual REST-based token exchanges, output management, and usage tracking.
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OidcUtils = void 0;
const core = __importStar(require("@actions/core"));
const http_client_1 = require("@actions/http-client");
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const semver_1 = require("semver");
const utils_1 = require("./utils");
const js_yaml_1 = require("js-yaml");
class OidcUtils {
    /*
    Currently, OIDC authentication can be handled in two ways due to CLI version limitations:
    1. Manually call the REST API from this codebase.
    2. Use the new OIDC token ID exchange command in the CLI (2.75.0+).

    Note: Why not use config command with OIDC params?
    Because the username and access token should output as a step output
    for further use by the users, this cannot be done in secure way using jf config add command.

    */
    static exchangeOidcToken(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!jfrogCredentials.jfrogUrl) {
                throw new Error(`JF_URL must be provided when oidc-provider-name is specified`);
            }
            // Get OIDC token ID from GitHub
            jfrogCredentials.oidcTokenId = yield this.getIdToken(jfrogCredentials.oidcAudience);
            // Version should be more than min version
            // If CLI_REMOTE_ARG specified, we have to fetch token before we can download the CLI.
            if (this.isCLIVersionOidcSupported() && !core.getInput(utils_1.Utils.CLI_REMOTE_ARG)) {
                core.debug('Using CLI exchange-oidc-token..');
                return yield this.exchangeOIDCTokenAndExportStepOutputs(jfrogCredentials);
            }
            // Fallback to manual OIDC exchange for backward compatibility
            core.debug('Using Manual OIDC Auth Method..');
            // Exchanges the token and set as access token in the credential's object
            let token = yield this.manualExchangeOidc(jfrogCredentials);
            if (!token) {
                throw new Error('Failed to manually exchange OIDC token via RESTApi');
            }
            return token;
        });
    }
    /**
     * Uses the CLI to exchange OIDC token for an access token and sets outputs.
     */
    static exchangeOIDCTokenAndExportStepOutputs(creds) {
        return __awaiter(this, void 0, void 0, function* () {
            let output;
            if (creds.oidcProviderName === undefined || creds.oidcTokenId === undefined || creds.jfrogUrl === undefined) {
                throw new Error('Missing one or more required fields: OIDC provider name, token ID, or JFrog Platform URL.');
            }
            const args = ['eot', creds.oidcProviderName, creds.oidcTokenId, '--url', creds.jfrogUrl];
            if (creds.oidcAudience) {
                args.push('--oidc-audience', creds.oidcAudience);
            }
            output = yield utils_1.Utils.runCliAndGetOutput(args, { silent: true });
            const { accessToken, username } = this.extractValuesFromOIDCToken(output);
            this.setOidcStepOutputs(username, accessToken);
            return accessToken;
        });
    }
    /**
     * Performs a manual token exchange via HTTP for older CLI versions.
     */
    static manualExchangeOidc(creds) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = creds.jfrogUrl;
            const providerName = creds.oidcProviderName;
            const applicationKey = yield this.getApplicationKey();
            if (!url || !providerName) {
                throw new Error('Missing required JFrog URL or OIDC provider name.');
            }
            if (!creds.oidcTokenId) {
                throw new Error('Missing required OIDC token ID.');
            }
            const exchangeUrl = url.replace(/\/$/, '') + '/access/api/v1/oidc/token';
            const payload = this.buildOidcTokenExchangePayload(creds.oidcTokenId, providerName, applicationKey);
            const httpClient = new http_client_1.HttpClient();
            const headers = { 'Content-Type': 'application/json' };
            const response = yield httpClient.post(exchangeUrl, JSON.stringify(payload), headers);
            const body = yield response.readBody();
            const responseJson = JSON.parse(body);
            if (responseJson.errors) {
                throw new Error(`OIDC token exchange failed: ${JSON.stringify(responseJson.errors)}`);
            }
            if (!responseJson.access_token) {
                throw new Error('Access token not found in the response');
            }
            // Export env vars for usage tracking
            this.trackOldOidcUsage();
            // Export step outputs
            this.outputOidcTokenAndUsernameFromToken(responseJson.access_token);
            return responseJson.access_token;
        });
    }
    /**
     * Extracts the access token and username from the CLI output.
     * Attempts to parse the input as JSON first, then falls back to regex.
     * Currently, in the CLI 2.75.0 version, the output is not a valid JSON.
     * This will be fixed in the next versions, but for now we need to support both.
     * @param input
     */
    static extractValuesFromOIDCToken(input) {
        if (!input) {
            throw new Error('JFrog CLI command output is empty. Failed to exchange OIDC access token.');
        }
        try {
            const parsed = JSON.parse(input);
            if (parsed.AccessToken && parsed.Username) {
                return { accessToken: parsed.AccessToken, username: parsed.Username };
            }
        }
        catch (e) {
            core.debug('Failed to parse JSON from CLI output. Falling back to regex...');
        }
        const regex = /AccessToken:\s*(\S+)\s*Username:\s*(\S+)/;
        const match = regex.exec(input);
        if (!match) {
            throw new Error('Failed to extract access token and username values from jf exchange-oidc-token command');
        }
        return {
            accessToken: match[1],
            username: match[2],
        };
    }
    static setOidcStepOutputs(username, accessToken) {
        core.setSecret(accessToken);
        core.setSecret(username);
        core.setOutput('oidc-token', accessToken);
        core.setOutput('oidc-user', username);
    }
    static outputOidcTokenAndUsernameFromToken(token) {
        let payload = this.decodeOidcToken(token);
        let tokenUser = this.extractTokenUser(payload.sub);
        this.setOidcStepOutputs(tokenUser, token);
    }
    /**
     * Extract the username from the OIDC access token subject.
     * @param subject OIDC token subject
     * @returns the username
     */
    static extractTokenUser(subject) {
        // Main OIDC user parsing logic
        if (subject.startsWith('jfrt@') || subject.includes('/users/')) {
            let lastSlashIndex = subject.lastIndexOf('/');
            // Return the user extracted from the token
            return subject.substring(lastSlashIndex + 1);
        }
        // No parsing was needed, returning original sub from the token as the user
        return subject;
    }
    /**
     * Decode the OIDC access token and return the payload.
     * @param oidcToken access token received from the JFrog platform during OIDC token exchange
     * @returns the payload of the OIDC access token
     */
    static decodeOidcToken(oidcToken) {
        // Split jfrogCredentials.accessToken into 3 parts divided by .
        let tokenParts = oidcToken.split('.');
        if (tokenParts.length != 3) {
            // this error should not happen since access only generates valid JWT tokens
            throw new Error(`OIDC invalid access token format`);
        }
        // Decode the second part of the token
        let base64Payload = tokenParts[1];
        let utf8Payload = Buffer.from(base64Payload, 'base64').toString('utf8');
        let payload = JSON.parse(utf8Payload);
        if (!payload || !payload.sub) {
            throw new Error(`OIDC invalid access token format`);
        }
        return payload;
    }
    static trackOldOidcUsage() {
        core.exportVariable('JFROG_CLI_USAGE_CONFIG_OIDC', 'TRUE');
        core.exportVariable('JFROG_CLI_USAGE_OIDC_USED', 'TRUE');
    }
    static buildOidcTokenExchangePayload(jwt, providerName, applicationKey) {
        var _a, _b, _c, _d;
        return {
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
            subject_token: jwt,
            provider_name: providerName,
            project_key: (_a = process.env.JF_PROJECT) !== null && _a !== void 0 ? _a : '',
            gh_job_id: (_b = process.env.GITHUB_JOB) !== null && _b !== void 0 ? _b : '',
            gh_run_id: (_c = process.env.GITHUB_RUN_ID) !== null && _c !== void 0 ? _c : '',
            gh_repo: (_d = process.env.GITHUB_REPOSITORY) !== null && _d !== void 0 ? _d : '',
            application_key: applicationKey,
        };
    }
    /**
     * Retrieves the application key from .jfrog/config file.
     *
     * This method attempts to read config file from the file system.
     * If the configuration file exists and contains the application key, it returns the key.
     * If the configuration file does not exist or does not contain the application key, it returns an empty string.
     *
     * @returns A promise that resolves to the application key as a string.
     */
    static getApplicationKey() {
        return __awaiter(this, void 0, void 0, function* () {
            const configFilePath = path_1.default.join(this.JF_CONFIG_DIR_NAME, this.JF_CONFIG_FILE_NAME);
            try {
                const config = yield this.readConfigFromFileSystem(configFilePath);
                if (!config) {
                    console.debug('Config file is empty or not found.');
                    return '';
                }
                const configObj = (0, js_yaml_1.load)(config);
                const application = configObj[this.APPLICATION_ROOT_YML];
                if (!application) {
                    console.log('Application root is not found in the config file.');
                    return '';
                }
                const applicationKey = application[this.KEY];
                if (!applicationKey) {
                    console.log('Application key is not found in the config file.');
                    return '';
                }
                console.debug('Found application key: ' + applicationKey);
                return applicationKey;
            }
            catch (error) {
                console.error('Error reading config:', error);
                return '';
            }
        });
    }
    /**
     * Reads .jfrog configuration file from file system.
     *
     * This method attempts to read .jfrog configuration file from the specified relative path.
     * If the file exists, it reads the file content and returns it as a string.
     * If the file does not exist, it returns an empty string.
     *
     * @param configRelativePath - The relative path to the configuration file.
     * @returns A promise that resolves to the content of the configuration file as a string.
     */
    static readConfigFromFileSystem(configRelativePath) {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug(`Reading config from file system. Looking for ${configRelativePath}`);
            if (!(0, fs_1.existsSync)(configRelativePath)) {
                core.debug(`config.yml not found in ${configRelativePath}`);
                return '';
            }
            core.debug(`config.yml found in ${configRelativePath}`);
            return yield fs_1.promises.readFile(configRelativePath, 'utf-8');
        });
    }
    /**
     * Fetches a JSON Web Token (JWT) ID token from GitHub's OIDC provider.
     * @param audience - The intended audience for the token.
     * @returns A promise that resolves to the JWT ID token as a string.
     * @throws An error if fetching the token fails.
     */
    static getIdToken(audience) {
        return __awaiter(this, void 0, void 0, function* () {
            core.debug('Attempting to fetch JSON Web Token (JWT) ID token...');
            try {
                return yield core.getIDToken(audience);
            }
            catch (error) {
                throw new Error(`Failed to fetch OpenID Connect JSON Web Token: ${error.message}`);
            }
        });
    }
    static isCLIVersionOidcSupported() {
        const version = core.getInput(utils_1.Utils.CLI_VERSION_ARG) || '';
        if (version === '') {
            // No input meaning default version which is supported
            return true;
        }
        return version === utils_1.Utils.LATEST_CLI_VERSION || (0, semver_1.gte)(version, this.MIN_CLI_OIDC_VERSION);
    }
}
exports.OidcUtils = OidcUtils;
OidcUtils.MIN_CLI_OIDC_VERSION = '2.75.0';
// Application yaml root key
OidcUtils.APPLICATION_ROOT_YML = 'application';
// Application Config file key, yaml should look like:
// application:
//   key: <application key>
OidcUtils.KEY = 'key';
// Config file directory name
OidcUtils.JF_CONFIG_DIR_NAME = '.jfrog';
// Config file name
OidcUtils.JF_CONFIG_FILE_NAME = 'config.yml';
