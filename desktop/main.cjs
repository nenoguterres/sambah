const { app, BrowserWindow, Menu, Tray, nativeImage, shell, session, ipcMain, powerSaveBlocker, Notification } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");

const SAMBAH_URL = process.env.SAMBAH_DESKTOP_URL || "https://api.insanofoodtruck.com.br/conversas";
const SAMBAH_ORIGIN = new URL(SAMBAH_URL).origin;
const APP_ID = "br.com.insanofoodtruck.sambah";

let mainWindow = null;
let tray = null;
let quitting = false;
let powerBlockerId = null;
let reconnectTimer = null;

app.setAppUserModelId(APP_ID);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function iconPath() {
  return path.join(__dirname, "assets", "icon.png");
}

function isSamBahUrl(value) {
  try {
    return new URL(value).origin === SAMBAH_ORIGIN;
  } catch {
    return false;
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: iconPath() }).show();
}

async function loadSamBah() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(reconnectTimer);
  try {
    await mainWindow.loadURL(SAMBAH_URL);
  } catch {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    await mainWindow.loadFile(path.join(__dirname, "renderer", "offline.html"));
    reconnectTimer = setTimeout(loadSamBah, 15000);
  }
}

function createApplicationMenu() {
  const template = [
    {
      label: "SamBah",
      submenu: [
        { label: "Abrir central", click: showMainWindow },
        { label: "Recarregar", accelerator: "CmdOrCtrl+R", click: loadSamBah },
        { type: "separator" },
        {
          label: "Sair completamente",
          click: () => {
            quitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: "Visualizar",
      submenu: [
        { role: "resetZoom", label: "Tamanho normal" },
        { role: "zoomIn", label: "Aumentar" },
        { role: "zoomOut", label: "Diminuir" },
        { role: "togglefullscreen", label: "Tela cheia" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 32, height: 32 });
  tray = new Tray(image);
  tray.setToolTip("SamBah Central — atendimento ativo");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir SamBah", click: showMainWindow },
    { label: "Recarregar", click: loadSamBah },
    { type: "separator" },
    {
      label: "Sair completamente",
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("double-click", showMainWindow);
}

function disableLegacyBrowserLauncher() {
  if (process.platform !== "win32") return;
  const script = [
    "$legacyScript = Join-Path $env:LOCALAPPDATA 'SamBahCentral\\SamBahWorkstation.ps1'",
    "$shortcut = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs\\Startup\\SamBah Central.lnk'",
    "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe' OR Name = 'pwsh.exe'\" -ErrorAction SilentlyContinue |",
    "  Where-Object { $_.CommandLine -like \"*$legacyScript*\" -and $_.CommandLine -like '*-Watch*' } |",
    "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    "if (Test-Path -LiteralPath $shortcut) { Remove-Item -LiteralPath $shortcut -Force }"
  ].join("\n");
  execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true }, () => {});
}

function enableAutoStart() {
  if (process.platform === "win32") {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: ["--autostart"] });
    return;
  }
  if (process.platform !== "linux" || !app.isPackaged) return;

  const autoStartDir = path.join(app.getPath("home"), ".config", "autostart");
  const autoStartFile = path.join(autoStartDir, "sambah-central.desktop");
  const executable = process.env.APPIMAGE || process.execPath;
  const desktopEntry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=SamBah Central",
    "Comment=Central operacional de atendimento SamBah",
    `Exec=\"${executable.replaceAll('"', '\\"')}\" --autostart`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "Categories=Office;Network;",
    ""
  ].join("\n");
  fs.mkdirSync(autoStartDir, { recursive: true });
  fs.writeFileSync(autoStartFile, desktopEntry, "utf8");
}

function configureSession() {
  const appSession = session.fromPartition("persist:sambah-central");
  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return permission === "notifications" && isSamBahUrl(requestingOrigin);
  });
  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = permission === "notifications" && isSamBahUrl(webContents.getURL());
    callback(allowed);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b141a",
    title: "SamBah Central",
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      partition: "persist:sambah-central",
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    showMainWindow();
    if (process.argv.includes("--autostart")) notify("SamBah ativo", "A central de atendimento iniciou com o computador.");
  });

  mainWindow.on("close", event => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    notify("SamBah continua ativo", "A central permaneceu aberta na bandeja do sistema.");
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSamBahUrl(url)) {
      mainWindow.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isSamBahUrl(url) || url.startsWith("file:")) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason === "clean-exit") return;
    setTimeout(loadSamBah, 1000);
  });

  mainWindow.on("unresponsive", () => setTimeout(loadSamBah, 1000));
  loadSamBah();
}

app.on("second-instance", () => showMainWindow());

ipcMain.on("sambah:retry", () => loadSamBah());
ipcMain.on("sambah:quit", () => {
  quitting = true;
  app.quit();
});

app.whenReady().then(() => {
  disableLegacyBrowserLauncher();
  configureSession();
  createApplicationMenu();
  createTray();
  enableAutoStart();
  powerBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  createWindow();
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) showMainWindow();
  else createWindow();
});

app.on("before-quit", () => {
  quitting = true;
  clearTimeout(reconnectTimer);
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) powerSaveBlocker.stop(powerBlockerId);
});

app.on("window-all-closed", event => {
  event.preventDefault();
});
