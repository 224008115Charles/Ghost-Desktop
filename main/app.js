const {app, BrowserWindow} = require('electron');
const debug = require('debug-electron')('ghost-desktop:main:app');

const {fetchWindowState} = require('./window-state');
const {state} = require('./state-manager');
const {ensureSingleInstance} = require('./single-instance');
const {parseArguments} = require('./parse-arguments');

const emberAppLocation = `file://${__dirname}/../dist/index.html`;

// Before we do anything else, handle Squirrel Events
if (require('./squirrel')()) return;

let mainWindow = null;

function setupListeners(window) {
    // If a loading operation goes wrong, we'll send Electron back to
    // Ember App entry point
    window.webContents.on('did-fail-load', () => window.loadURL(emberAppLocation));
    window.webContents.on('did-finish-load', () => window.show());

    // Chromium drag and drop events tend to navigate the app away, making the
    // app impossible to use without restarting. These events should be prevented.
    window.webContents.on('will-navigate', (event) => event.preventDefault());

    // Once the last window is closed, we'll exit
    app.on('window-all-closed', () => app.quit());

    // Close stuff a bit harder than usual
    app.on('before-quit', () => {
        if (window && !window.isDestroyed()) {
            window.removeAllListeners();
            window.close();

            setTimeout(() => app.exit(), 2000);
        }
    });
}

function createMainWindow() {
    const titleBarStyle = (process.platform === 'darwin') ? 'hidden' : 'default';
    const frame = !(process.platform === 'win32');
    let windowState, usableState, windowStateKeeper, window;

    // Instantiate the window with the existing size and position.
    try {
        windowState = fetchWindowState();
        usableState = windowState.usableState;
        windowStateKeeper = windowState.windowStateKeeper;

        window = new BrowserWindow(
            Object.assign(usableState, {show: false, titleBarStyle, vibrancy: 'dark', frame})
        );
    } catch (error) {
        // Window state keeper failed, let's still open a window
        debug(`Window state keeper failed: ${error}`);
        window = new BrowserWindow({
            show: false,
            height: 800,
            width: 1000,
            titleBarStyle,
            vibrancy: 'dark',
            transparent: (process.platform === 'darwin'),
            frame
        });
    }

    window.loadURL(emberAppLocation);

    delete window.module;

    // Letting the state keeper listen to window resizing and window moving
    // event, and save them accordingly.
    if (windowStateKeeper) windowStateKeeper.manage(window);

    return window;
}

function reloadMainWindow() {
    let oldMainWindow;

    if (mainWindow) {
        oldMainWindow = mainWindow;
        oldMainWindow.hide();
    }

    mainWindow = createMainWindow();
    setupListeners(mainWindow);

    if (oldMainWindow) {
        // Burn, burn, buuuuurn
        oldMainWindow.destroy();
    }
}

app.on('ready', function onReady() {
    ensureSingleInstance();
    parseArguments();

    mainWindow = createMainWindow();

    // Greetings
    if (process.platform === 'win32') {
        console.log('\n Welcome to Ghost \n');
    } else {
        console.log('\n ⚡️  Welcome to Ghost  👻\n');
    }

    // If you want to open up dev tools programmatically, call
    // mainWindow.openDevTools();

    state.mainWindowId = mainWindow.id;

    setupListeners(mainWindow);

    require('./ipc');
    require('./basic-auth');
});

module.exports = {mainWindow, reloadMainWindow};
