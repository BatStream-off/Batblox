"use strict";
// Pont sécurisé entre l'interface et le processus principal : seules ces deux fonctions sont exposées.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("batblox", {
  call: async (name, payload) => {
    const r = await ipcRenderer.invoke("api", name, payload);
    if (!r.ok) throw new Error(r.error || "Erreur inattendue.");
    return r.data;
  },
  on: (cb) => {
    const h = (_e, evt, payload) => cb(evt, payload);
    ipcRenderer.on("evt", h);
    return () => ipcRenderer.removeListener("evt", h);
  }
});
