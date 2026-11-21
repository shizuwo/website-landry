/* Travailleur du convertisseur : fait tourner ffmpeg (version WebAssembly) à part,
   pour que la page reste fluide pendant la conversion. */
let core = null;
self.onmessage = async (e) => {
  const { type, id, data } = e.data;
  try {
    if (type === 'charger') {
      if (!core) {
        importScripts(data.coreURL);
        core = await self.createFFmpegCore({ mainScriptUrlOrBlob: `${data.coreURL}#${btoa(JSON.stringify({ wasmURL: data.wasmURL }))}` });
        core.setLogger(({ message }) => self.postMessage({ type: 'journal', message }));
        core.setProgress(({ progress, time }) => self.postMessage({ type: 'progression', progress, time }));
      }
      self.postMessage({ type: 'fini', id });
    } else if (type === 'executer') {
      const { entree, octets, args, sortie } = data;
      core.FS.writeFile(entree, new Uint8Array(octets));
      core.exec(...args);
      const ret = core.ret; core.reset();
      let res = null;
      try { res = core.FS.readFile(sortie); } catch {}
      try { core.FS.unlink(entree); } catch {}
      try { core.FS.unlink(sortie); } catch {}
      if (ret !== 0 || !res || !res.length) throw new Error('la conversion a échoué (format non pris en charge ?)');
      self.postMessage({ type: 'fini', id, octets: res.buffer }, [res.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'erreur', id, message: String(err && err.message || err) });
  }
};
