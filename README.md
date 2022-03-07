[![JFrog CLI](readme_image.png)](#readme)

<div align="center">

# Setup JFrog CLI

[![Build status](https://github.com/jfrog/setup-jfrog-cli/workflows/Main%20workflow/badge.svg)](https://github.com/jfrog/setup-jfrog-cli/actions)

</div>

This GitHub Action downloads, installs and configures JFrog CLI, so that it can be used as part of the workflow.

In addition, the Action includes the following features, when using JFrog CLI to work with Artifactory.
* The connection details of the JFrog platform used by JFrog CLI can be stored as secrets. Read more about it [here](#storing-JFrog-details-as-secrets).
* There's no need to add the *build name* and *build number* options and arguments to commands which accept them.
All build related operations will be automatically recorded with the *Workflow Name* as build name and *Run Number* as build number.

# Usage
## General

```yml
- uses: jfrog/setup-jfrog-cli@v2
- run: jf --version
```

## Storing JFrog details as secrets
### General
The connection details of the JFrog platform used by JFrog CLI can be stored as secrets.

### Creating the configuration on your local machine 
1. Make sure JFrog CLI version **1.29.0** or above is installed on your local machine by running ```jf -v```.
2. Configure the details of the JFrog platform by running ```jf c add```.
3. Export the details of the JFrog platform you configured, using the server ID you chose. Do this by running ```jf c export <SERVER ID>```.
4. Copy the generated token to the clipboard and save it as a secret on GitHub.

### Using the secret in the workflow
To use the saved JFrog platform configuration in the workflow, all you need to do it to expose the secret to the workflow.
The secret should be exposed as an environment variable with the *JF_ENV_* prefix.
Here's how you do this:
```yml
- uses: jfrog/setup-jfrog-cli@v2
  env:
    JF_ENV_1: ${{ secrets.JF_SECRET_ENV_1 }}
- run: |
    # Ping the server
    jfrog rt ping
```
As you can see in the example above, we created a secret named *JF_SECRET_ENV_1* and we exposed it to the workflow 
as the *JF_ENV_1* environment variable. That's it - the ping command will now ping the configured Artifactory server.

If you have multiple JFrog platform configurations as secrets, you can use all of the in the workflow as follows:
```yml
- uses: jfrog/setup-jfrog-cli@v2
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
    # Ping local-2 Xray server
    jf xr ping
```
| Important: When exposing more than one JFrog configuration to the Action, you should always add the ```jf c use``` command to specify the server to use. |
| --- |

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
By default the JFrog CLI version set in [action.yml](https://github.com/jfrog/setup-jfrog-cli/blob/master/action.yml) is used. To set a specific version, add the *version* input as follows:

```yml
- uses: jfrog/setup-jfrog-cli@v2
  with:
    version: X.Y.Z
```

It is also possible to set the latest JFrog CLI version by adding the *version* input as follows:

```yml
- uses: jfrog/setup-jfrog-cli@v2
  with:
    version: latest
```

| Important: Only JFrog CLI versions 1.29.0 or above are supported. |
| --- |

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
