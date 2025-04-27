import { Utils } from '../src/utils';
import { JobSummary } from '../src/job-summary';
import * as core from '@actions/core';
import os from 'os';

describe('Job Summaries', () => {
    describe('Job summaries sanity', () => {
        it('should not crash if no files were found', async () => {
            expect(async () => await JobSummary.setMarkdownAsJobSummary()).not.toThrow();
        });
    });
    describe('Command Summaries Disable Flag', () => {
        const myCore: jest.Mocked<typeof core> = core as any;
        beforeEach(() => {
            delete process.env[JobSummary.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV];
            delete process.env.RUNNER_TEMP;
        });

        it('should not set JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR if disable-job-summary is true', () => {
            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return true;
            });
            Utils.setCliEnv();
            expect(process.env[JobSummary.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV]).toBeUndefined();
        });

        it('should set JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR if disable-job-summary is false', () => {
            process.env.RUNNER_TEMP = '/tmp';
            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return false;
            });
            myCore.exportVariable = jest.fn().mockImplementation((name: string, val: string) => {
                process.env[name] = val;
            });
            Utils.setCliEnv();
            expect(process.env[JobSummary.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV]).toBe('/tmp');
        });

        it('should handle self-hosted machines and set JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR based on OS temp dir', () => {
            // Mock os.tmpdir() to simulate different OS temp directories
            const tempDir: string = '/mocked-temp-dir';
            jest.spyOn(os, 'tmpdir').mockReturnValue(tempDir);

            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return false;
            });
            myCore.exportVariable = jest.fn().mockImplementation((name: string, val: string) => {
                process.env[name] = val;
            });

            Utils.setCliEnv();

            expect(process.env[JobSummary.JFROG_CLI_COMMAND_SUMMARY_OUTPUT_DIR_ENV]).toBe(tempDir);
        });

        it('Should throw error when failing to get temp dir', () => {
            // Mock os.tmpdir() to return an empty string
            jest.spyOn(os, 'tmpdir').mockReturnValue('');

            myCore.getBooleanInput = jest.fn().mockImplementation(() => {
                return false;
            });
            myCore.exportVariable = jest.fn().mockImplementation((name: string, val: string) => {
                process.env[name] = val;
            });

            // Expect the function to throw an error
            expect(() => Utils.setCliEnv()).toThrow('Failed to determine the temporary directory');

            // Restore the mock to avoid affecting other tests
            jest.restoreAllMocks();
        });
    });
});

describe('isJobSummarySupported', () => {
    const LATEST_CLI_VERSION: string = 'latest';

    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('should return true if the version is the latest', () => {
        jest.spyOn(core, 'getInput').mockReturnValue(LATEST_CLI_VERSION);
        expect(JobSummary.isJobSummarySupported()).toBe(true);
    });

    it('should return true if the version is greater than or equal to the minimum supported version', () => {
        const version: string = '2.66.0';
        jest.spyOn(core, 'getInput').mockReturnValue(version);
        expect(JobSummary.isJobSummarySupported()).toBe(true);
    });

    it('should return false if the version is less than the minimum supported version', () => {
        const version: string = '2.65.0';
        jest.spyOn(core, 'getInput').mockReturnValue(version);
        expect(JobSummary.isJobSummarySupported()).toBe(false);
    });
});

describe('Test correct encoding of badge URL', () => {
    describe('getUsageBadge', () => {
        beforeEach(() => {
            process.env.JF_URL = 'https://example.jfrog.io/';
            process.env.GITHUB_RUN_ID = '123';
        });

        afterEach(() => {
            delete process.env.JF_URL;
            delete process.env.GITHUB_WORKFLOW;
            delete process.env.GITHUB_REPOSITORY;
            delete process.env.GITHUB_RUN_ID;
        });

        it('should return the correct usage badge URL', () => {
            process.env.GITHUB_WORKFLOW = 'test-job';
            process.env.GITHUB_REPOSITORY = 'test/repo';
            const expectedBadge: string = '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=test-job&run_id=123&git_repo=test%2Frepo)';
            expect(JobSummary.getUsageBadge()).toBe(expectedBadge);
        });

        it('should URL encode the job ID and repository with spaces', () => {
            process.env.GITHUB_WORKFLOW = 'test job';
            process.env.GITHUB_REPOSITORY = 'test repo';
            const expectedBadge: string = '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=test+job&run_id=123&git_repo=test+repo)';
            expect(JobSummary.getUsageBadge()).toBe(expectedBadge);
        });

        it('should URL encode the job ID and repository with special characters', () => {
            process.env.GITHUB_WORKFLOW = 'test/job@workflow';
            process.env.GITHUB_REPOSITORY = 'test/repo@special';
            const expectedBadge: string =
                '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=test%2Fjob%40workflow&run_id=123&git_repo=test%2Frepo%40special)';
            expect(JobSummary.getUsageBadge()).toBe(expectedBadge);
        });

        it('should handle missing environment variables gracefully', () => {
            delete process.env.GITHUB_WORKFLOW;
            delete process.env.GITHUB_REPOSITORY;
            const expectedBadge: string = '![](https://example.jfrog.io/ui/api/v1/u?s=1&m=1&job_id=&run_id=123&git_repo=)';
            expect(JobSummary.getUsageBadge()).toBe(expectedBadge);
        });
    });
});
