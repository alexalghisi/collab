const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAuth', {
  isElectron: true,
  clientId: '560742571865-eqeojukg2kqm2gmaumm79n2606e75pus.apps.googleusercontent.com',
  loginWithGoogle: (clientId) => ipcRenderer.invoke('auth:google', clientId),
  requestCalendarToken: (clientId, prompt) =>
    ipcRenderer.invoke('auth:google-calendar', { clientId, prompt }),
});
