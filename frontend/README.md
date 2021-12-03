# Browser

This project is a direct descendant of [Sabaki](https://github.com/SabakiHQ/Sabaki) and is derived from [BUGOUT/browser](https://github.com/Terkwood/BUGOUT/tree/unstable/browser)

Thank you to the Sabaki authors, the BUGOUT [author](https://github.com/Terkwood) and community for making their project available under MIT license.

## Run the frontend locally

```sh
npm install
npm run build
npm run start
```

## Watch changes during development

You can auto-build as files change, but for now, you'll need to run
a separate web server to host the build.

```sh
npm run watch
```

Then (something like):

```sh
python3 -m http.server
```

## Deployment

Deploy from _this_ directory. npm build artifacts will be deposited to this directory.

## Formatting the codebase

Install [prettier](https://prettier.io/docs/en/install.html) to format the code for the browser:

```sh
prettier --write .
```

We recommend installing the [prettier VSCode extension](https://prettier.io/docs/en/editors.html) and configuring it
as follows:

```json
    "[javascript]": {
        "editor.defaultFormatter": "esbenp.prettier-vscode"
    }
```
