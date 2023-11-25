[![JFrog CLI](readme_image.png)](#readme)

<div align="center">

# Setup JFrog CLI

[![Scanned by Frogbot](https://raw.github.com/jfrog/frogbot/master/images/frogbot-badge.svg)](https://github.com/jfrog/frogbot#readme)
[![Build status](https://github.com/jfrog/setup-jfrog-cli/workflows/Test/badge.svg)](https://github.com/jfrog/setup-jfrog-cli/actions)

</div>

This GitHub Action downloads, installs and configures JFrog CLI, so that it can be used as part of the workflow.

In addition, the Action includes the following features, when using JFrog CLI to work with JFrog Platform.
* The connection details of the JFrog platform used by JFrog CLI can be stored as secrets and variables. Read more about it [here](#Storing-JFrog-Connection-Details-as-Secrets-and-Variables).
* There's no need to add the *build name* and *build number* options and arguments to commands which accept them.
All build related operations will be automatically recorded with the *Workflow Name* as build name and *Run Number* as build number.

# Usage
## General

```yml
- uses: jfrog/setup-jfrog-cli@v3
- run: jf --version
```

## Storing JFrog connection details as secrets and variables
The connection details of the JFrog platform used by JFrog CLI can be stored as [secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository). Not-sensitive details can alternatively be stored as [configuration variables](https://docs.github.com/en/actions/learn-github-actions/variables#creating-configuration-variables-for-a-repository). Do not store sensitive details (passwords, tokens, etc) as configuration variables!
You can use one of the following two methods to define and store the JFrog Platform connection details as secrets and variables.
1. [Storing the connection details using separate environment variables](#Storing-the-connection-details-using-separate-environment-variables).
2. [Storing the connection details using single Config Token](#Storing-the-connection-details-using-single-Config-Token).

You may need to define these details on either [workflow or job level](https://docs.github.com/en/actions/learn-github-actions/variables#defining-environment-variables-for-a-single-workflow) in order to be able to refer to them in multiple workflow steps.

### Storing the connection details using separate environment variables
You can set the connection details to your JFrog Platform by using one of the following environment variables combinations:
1. JF_URL (no authentication)
2. JF_URL + JF_USER + JF_PASSWORD (basic authentication)
3. JF_URL + JF_ACCESS_TOKEN (authentication using a JFrog Access Token)

You can use these environment variables in your workflow as follows:
```yml
- uses: jfrog/setup-jfrog-cli@v3
  env:
    # JFrog platform url stored as a secret (for example: https://acme.jfrog.io) 
    JF_URL: ${{ secrets.JF_URL }}
    or
    # JFrog platform url stored as a configuration variable
    JF_URL: ${{ vars.JF_URL }}

    # Basic authentication credentials
    JF_USER: ${{ secrets.JF_USER }}
    JF_PASSWORD: ${{ secrets.JF_PASSWORD }}
    or
    # JFrog Platform access token
    JF_ACCESS_TOKEN: ${{ secrets.JF_ACCESS_TOKEN }}
- run: |
    jf rt ping
```

| Important: If both Config Token(JF_ENV_*) and separate environment variables(JF_URL, ...) are provided, the default config will be the Config Token. To make the above separate environment variables as the default config use ```jf c use setup-jfrog-cli-server``` |
|----------------------------------------------------------------------------------------------------------------------------------------------------------|

### Storing the connection details using single Config Token
1. Make sure JFrog CLI is installed on your local machine by running ```jf -v```.
2. Configure the details of the JFrog platform by running ```jf c add```.
3. Export the details of the JFrog platform you configured, using the server ID you chose. Do this by running ```jf c export <SERVER ID>```.
4. Copy the generated Config Token to the clipboard and save it as a secret on GitHub.

To use the saved JFrog platform configuration in the workflow, all you need to do it to expose the secret to the workflow.
The secret should be exposed as an environment variable with the *JF_ENV_* prefix.
Here's how you do this:
```yml
- uses: jfrog/setup-jfrog-cli@v3
  env:
    JF_ENV_1: ${{ secrets.JF_SECRET_ENV_1 }}
- run: |
    # Ping the server
    jf rt ping
```
As you can see in the example above, we created a secret named *JF_SECRET_ENV_1* and exposed it to the workflow 
as the *JF_ENV_1* environment variable. That's it - the ping command will now ping the configured Artifactory server.

If you have multiple Config Tokens as secrets, you can use all of them in the workflow as follows:
```yml
- uses: jfrog/setup-jfrog-cli@v3
  env:
    JF_ENV_1: ${{ secrets.JF_SECRET_ENV_1 }}
    JF_ENV_2: ${{ secrets.JF_SECRET_ENV_2 }}
- run: |
    # Set the JFrog configuration to use by providing the server ID (configured by the 'jf c add' command).
    jf c use local-1
    # Ping local-1 Artifactory server
    jf rt ping
    # Now use the second sever configuration exposed to the Action.
    jf c use local-2
    # Ping local-2 Artifactory server
    jf rt ping
```
| Important: When exposing more than one JFrog configuration to the Action, you should always add the ```jf c use``` command to specify the server to use. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------|

## Setting the build name and build number when publishing build-info to Artifactory
The Action automatically sets the following environment variables:
*JFROG_CLI_BUILD_NAME* and *JFROG_CLI_BUILD_NUMBER* with the workflow name and run number respectively.
You therefore don't need to specify the build name and build number on any of the build related JFrog CLI commands.

In the following example, all downloaded files are registered as dependencies of the build and all uploaded files
are registered as the build artifacts. 
```yml
- run: |
    jf rt dl artifacts/
    jf rt u aether artifacts/
    jf rt bp
```

## Setting JFrog CLI version
By default, the JFrog CLI version set in [action.yml](https://github.com/jfrog/setup-jfrog-cli/blob/master/action.yml) is used. To set a specific version, add the *version* input as follows:

```yml
- uses: jfrog/setup-jfrog-cli@v3
  with:
    version: X.Y.Z
```

It is also possible to set the latest JFrog CLI version by adding the *version* input as follows:

```yml
- uses: jfrog/setup-jfrog-cli@v3
  with:
    version: latest
```

| Important: Only JFrog CLI versions 1.29.0 or above are supported. |
| --- |

## Downloading JFrog CLI from Artifactory
If your agent has no Internet access, you can configure the workflow to download JFrog CLI from a [remote repository](https://www.jfrog.com/confluence/display/JFROG/Remote+Repositories) in your JFrog Artifactory, which is configured to proxy the official download URL.

Here's how you do this:

1. Create a remote repository in Artifactory. Name the repository jfrog-cli-remote and set its URL to https://releases.jfrog.io/artifactory/jfrog-cli/
2. Set *download-repository* input to jfrog-cli-remote:
    ```yml
    - uses: jfrog/setup-jfrog-cli@v3
      env:
       # JFrog platform url (for example: https://acme.jfrog.io) 
        JF_URL: ${{ secrets.JF_URL }}
    
        # Basic authentication credentials
        JF_USER: ${{ secrets.JF_USER }}
        JF_PASSWORD: ${{ secrets.JF_PASSWORD }}
    
        # JFrog platform access token (if JF_USER and JF_PASSWORD are not provided)
        # JF_ACCESS_TOKEN: ${{ secrets.JF_ACCESS_TOKEN }}
   
        # Same can be achieved with a Config Token using JF_ENV_1 environment variable
        # JF_ENV_1: ${{ secrets.JF_SECRET_ENV_1 }}
      with:
        download-repository: jfrog-cli-remote
    ```

* See instructions for configuring the JFrog connection details under [Storing JFrog connection details as secrets](#storing-jfrog-connection-details-as-secrets).


## Set up a FREE JFrog Environment in the Cloud
Need a FREE JFrog environment in the cloud to use with this GitHub Action? Just run one of the following commands in your terminal. The commands will do the following:

1. Install JFrog CLI on your machine.
2. Create a FREE JFrog environment in the cloud for you.

**MacOS and Linux using cUrl**
```
curl -fL "https://getcli.jfrog.io?setup" | sh
```

**Windows using PowerShell**
```
powershell "Start-Process -Wait -Verb RunAs powershell '-NoProfile iwr https://releases.jfrog.io/artifactory/jfrog-cli/v2-jf/[RELEASE]/jfrog-cli-windows-amd64/jf.exe -OutFile $env:SYSTEMROOT\system32\jf.exe'" ; jf setup
```

## Example projects
To help you get started, you can use [these](https://github.com/jfrog/project-examples/tree/master/github-action-examples) sample projects on GitHub.

# Developing the Action code
## Build the code
If you'd like to help us develop and enhance this Action, this section is for you.

To build and run the Action tests, run
```bash
npm i && npm t
```

## Code contributions
We welcome code contributions through pull requests.

Please help us enhance and improve this Action.
### Pull requests guidelines
- If the existing tests do not already cover your changes, please add tests.
- Please run `npm run format` for formatting the code before submitting the pull request.

# License
This Action is licensed under the [Apache License 2.0](https://github.com/jfrog/setup-jfrog-cli/blob/master/LICENSE).

# References
- [JFrog CLI Documentation](https://www.jfrog.com/confluence/display/CLI/JFrog+CLI)
- [GitHub Actions Documentation](https://help.github.com/en/categories/automating-your-workflow-with-github-actions)
