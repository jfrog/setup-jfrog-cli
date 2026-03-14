import { getSigstoreBundlePaths } from '../src/evidence-collection';
import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

jest.mock('@actions/core');

// Only test getSigstoreBundlePaths with real file system

describe('getSigstoreBundlePaths', () => {
    let tempDir: string;
    let attestationPathsFile: string;

    beforeEach(async () => {
        // Create a temporary directory for each test
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'evidence-test-'));
        attestationPathsFile = path.join(tempDir, 'created_attestation_paths.txt');
        process.env.RUNNER_TEMP = tempDir;
        (core.info as jest.Mock).mockClear();
        (core.warning as jest.Mock).mockClear();
    });

    afterEach(async () => {
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    it('should return empty array when attestation paths file does not exist', async () => {
        const result = await getSigstoreBundlePaths();

        expect(result).toEqual([]);
        expect(core.info).toHaveBeenCalledWith(
            `No attestation paths file found. Skipping evidence creation. Searched for: ${attestationPathsFile}. Error: Error: ENOENT: no such file or directory, access '${attestationPathsFile}'`,
        );
    });

    it('should return empty array when attestation paths file is empty', async () => {
        // Create empty file
        await fs.writeFile(attestationPathsFile, '');

        const result = await getSigstoreBundlePaths();

        expect(result).toEqual([]);
        expect(core.info).toHaveBeenCalledWith('Reading attestation paths file: ' + attestationPathsFile);
        expect(core.info).toHaveBeenCalledWith('No sigstore bundle files found in attestation paths file.');
    });

    it('should return file paths when attestation paths file contains valid paths', async () => {
        const fileContent = '/path/to/file1.sigstore\n/path/to/file2.sigstore\n/path/to/file3.sigstore';
        await fs.writeFile(attestationPathsFile, fileContent);

        const result = await getSigstoreBundlePaths();

        expect(result).toEqual(['/path/to/file1.sigstore', '/path/to/file2.sigstore', '/path/to/file3.sigstore']);
        expect(core.info).toHaveBeenCalledWith('Reading attestation paths file: ' + attestationPathsFile);
        expect(core.info).toHaveBeenCalledWith('Found 3 sigstore bundle file(s) to process.');
    });

    it('should filter out empty lines and whitespace', async () => {
        const fileContent = '/path/to/file1.sigstore\n\n  \n/path/to/file2.sigstore\n\t\n/path/to/file3.sigstore';
        await fs.writeFile(attestationPathsFile, fileContent);

        const result = await getSigstoreBundlePaths();

        expect(result).toEqual(['/path/to/file1.sigstore', '/path/to/file2.sigstore', '/path/to/file3.sigstore']);
        expect(core.info).toHaveBeenCalledWith('Found 3 sigstore bundle file(s) to process.');
    });

    it('should handle single file path', async () => {
        const fileContent = '/path/to/single.sigstore';
        await fs.writeFile(attestationPathsFile, fileContent);

        const result = await getSigstoreBundlePaths();

        expect(result).toEqual(['/path/to/single.sigstore']);
        expect(core.info).toHaveBeenCalledWith('Found 1 sigstore bundle file(s) to process.');
    });

    it('should return empty array when RUNNER_TEMP is not set', async () => {
        delete process.env.RUNNER_TEMP;

        const result = await getSigstoreBundlePaths();

        expect(result).toEqual([]);
        expect(core.warning).toHaveBeenCalledWith('RUNNER_TEMP environment variable is not set. Skipping evidence creation.');
    });

    it('should handle file with trailing newline', async () => {
        const fileContent = '/path/to/file1.sigstore\n/path/to/file2.sigstore\n';
        await fs.writeFile(attestationPathsFile, fileContent);

        const result = await getSigstoreBundlePaths();

        expect(result).toEqual(['/path/to/file1.sigstore', '/path/to/file2.sigstore']);
        expect(core.info).toHaveBeenCalledWith('Found 2 sigstore bundle file(s) to process.');
    });
});
