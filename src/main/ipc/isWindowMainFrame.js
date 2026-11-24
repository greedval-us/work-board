export function isWindowMainFrame(window, event) {
  return Boolean(window && !window.isDestroyed() && event.senderFrame
    && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame);
}
