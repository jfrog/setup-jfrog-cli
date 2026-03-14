/**
 * test/job-summary.sarif.baseurl.spec.ts
 * Checking baseUrl selection when loading SARIF on GHES.
 */

import * as core from '@actions/core';

jest.mock('@actions/github', () => {
    const actual = jest.requireActual('@actions/github');
    return {
        ...actual,
        getOctokit: jest.fn((token: string, opts?: { baseUrl?: string }) => {
            const usedBaseUrl = (opts && opts.baseUrl) || process.env.__AUTO_BASE_URL__ || 'https://api.github.com';

            const req = jest.fn(async (_route: string, _params: any) => {
                (global as any).__USED_BASE_URL__ = usedBaseUrl;
                return { status: 201, data: {} };
            }) as unknown as any;

            req.endpoint = { DEFAULTS: { baseUrl: usedBaseUrl } };

            return { request: req } as any;
        }),
        context: {
            repo: { owner: 'o', repo: 'r' },
            sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            ref: 'refs/heads/main',
        },
    };
});

import { JobSummary } from '../src/job-summary';

describe('uploadCodeScanningSarif baseUrl selection (GHES)', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.spyOn(core, 'getInput').mockImplementation((_name: string) => '');

        delete process.env.__AUTO_BASE_URL__;
        delete (global as any).__USED_BASE_URL__;
    });

    it('Should use explicit input ghe-base-url if given', async () => {
        (core.getInput as jest.Mock).mockImplementation((name: string) => {
            if (name === 'ghe-base-url') return 'https://github.enterprise.local/api/v3';
            if (name === 'ghe_base_url') return '';
            return '';
        });

        await (JobSummary as any).uploadCodeScanningSarif('eJx4YWJj', 'ghs_token');

        expect((global as any).__USED_BASE_URL__).toBe('https://github.enterprise.local/api/v3');
    });

    it('Should falls back to auto GHES baseUrl via @actions/github if input is not specified', async () => {
        process.env.__AUTO_BASE_URL__ = 'https://ghe.corp.local/api/v3';

        await (JobSummary as any).uploadCodeScanningSarif('eJx4YWJj', 'ghs_token');

        expect((global as any).__USED_BASE_URL__).toBe('https://ghe.corp.local/api/v3');
    });
});
