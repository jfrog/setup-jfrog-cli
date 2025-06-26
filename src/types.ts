/**
 * Core type definitions used across setup-jfrog-cli utilities.
 */

/**
 * Represents credentials and context for configuring the JFrog CLI.
 */
export interface JfrogCredentials {
    jfrogUrl?: string;
    username?: string;
    password?: string;
    accessToken?: string;
    oidcProviderName?: string;
    oidcTokenId?: string;
    oidcAudience: string;
}

/**
 * Represents a successful response from the JFrog OIDC token exchange endpoint.
 */
export interface TokenExchangeResponseData {
    access_token?: string;
    errors?: {
        status: number;
        message: string;
    }[];
}

/**
 * Represents artifact download configuration.
 */
export interface DownloadDetails {
    artifactoryUrl: string;
    repository: string;
    auth: string;
}

/**
 * JWT token data structure.
 */
export interface JWTTokenData {
    sub: string;
    scp: string;
    aud: string;
    iss: string;
    exp: bigint;
    iat: bigint;
    jti: string;
}

export interface CliExchangeTokenResponse {
    accessToken: string;
    username: string;
}
