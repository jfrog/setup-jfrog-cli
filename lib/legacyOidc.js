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
exports.LegacyOidc = void 0;
const core = __importStar(require("@actions/core"));
const http_client_1 = require("@actions/http-client");
const js_yaml_1 = require("js-yaml");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class LegacyOidc {
    static handleLegacyOidcFlow(jfrogCredentials) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info('Obtaining an access token through OpenID Connect (legacy fallback)...');
            const audience = core.getInput('oidc-audience');
            let jsonWebToken;
            try {
                core.debug('Fetching JSON web token (legacy)');
                jsonWebToken = yield core.getIDToken(audience);
            }
            catch (error) {
                throw new Error(`Getting OpenID Connect JSON web token failed: ${error.message}`);
            }
            const applicationKey = yield this.getApplicationKey();
            return yield this.exchangeToken(jfrogCredentials, jsonWebToken, applicationKey);
        });
    }
    static exchangeToken(jfrogCredentials, jsonWebToken, applicationKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const oidcProviderName = jfrogCredentials.oidcProviderName;
            const exchangeUrl = `${jfrogCredentials.jfrogUrl.replace(/\/$/, '')}/access/api/v1/oidc/token`;
            const data = {
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
                subject_token: jsonWebToken,
                provider_name: oidcProviderName,
                project_key: process.env.JF_PROJECT || '',
                gh_job_id: process.env.GITHUB_WORKFLOW || '',
                gh_run_id: process.env.GITHUB_RUN_ID || '',
                gh_repo: process.env.GITHUB_REPOSITORY || '',
                application_key: applicationKey,
            };
            const httpClient = new http_client_1.HttpClient();
            const response = yield httpClient.post(exchangeUrl, JSON.stringify(data), {
                'Content-Type': 'application/json',
            });
            const responseBody = yield response.readBody();
            const responseJson = JSON.parse(responseBody);
            if (responseJson.errors) {
                throw new Error(`OIDC token exchange failed: ${JSON.stringify(responseJson.errors)}`);
            }
            core.exportVariable('JFROG_CLI_USAGE_CONFIG_OIDC', 'TRUE');
            core.exportVariable('JFROG_CLI_USAGE_OIDC_USED', 'TRUE');
            jfrogCredentials.accessToken = responseJson.access_token;
            return jfrogCredentials;
        });
    }
    static getApplicationKey() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const configFilePath = path.join('.jfrog', 'config.yaml');
            if (!fs.existsSync(configFilePath)) {
                core.debug('JFrog config file not found');
                return '';
            }
            const configContent = yield fs.promises.readFile(configFilePath, 'utf-8');
            const configObj = (0, js_yaml_1.load)(configContent);
            return (_b = (_a = configObj === null || configObj === void 0 ? void 0 : configObj.application) === null || _a === void 0 ? void 0 : _a.key) !== null && _b !== void 0 ? _b : '';
        });
    }
}
exports.LegacyOidc = LegacyOidc;
