import * as core from '@actions/core';
import { Utils } from './utils';
import { exec, ExecOptions } from '@actions/exec';

async function cleanup() {
    try {
        if (!addCachedJfToPath()) {
            core.error('Could not find JFrog CLI path in the step state. Skipping cleanup.');
            return;
        }
        if (!core.getBooleanInput(Utils.JOB_SUMMARY_DISABLE)) {
            core.startGroup('Generate Job Summary');
            await Utils.runCli(['generate-summary-markdown']);
            core.debug('settings markdown as job summary');
            await Utils.setMarkdownAsJobSummary();
            core.debug('Job summary generated successfully');
            core.endGroup();
        }
        core.startGroup('Remove JFrog Servers');
        await Utils.removeJFrogServers();
        core.endGroup();
        await listRunningProcesses();
    } catch (error) {
        core.setFailed((<any>error).message);
    } finally {
        core.info('finsihed cleanup');
    }
}

async function listRunningProcesses(): Promise<void> {
    try {
        let stdout: string = '';
        let stderr: string = '';
        const options: ExecOptions = {
            listeners: {
                stdout: (data: Buffer) => {
                    stdout += data.toString();
                },
                stderr: (data: Buffer) => {
                    stderr += data.toString();
                },
            },
        };

        await exec('ps aux', [], options);

        if (stderr) {
            console.error(`Error in command output: ${stderr}`);
            return;
        }
        console.log('Running processes:\n', stdout);
    } catch (error) {
        core.setFailed(`Error executing command: ${(error as Error).message}`);
    }
}

function addCachedJfToPath(): boolean {
    // Get the JFrog CLI path from step state. saveState/getState are methods to pass data between a step, and it's cleanup function.
    const jfrogCliPath: string = core.getState(Utils.JF_CLI_PATH_STATE);
    if (!jfrogCliPath) {
        // This means that the JFrog CLI was not installed in the first place, because there was a failure in the installation step.
        return false;
    }
    core.addPath(jfrogCliPath);
    return true;
}

cleanup();
