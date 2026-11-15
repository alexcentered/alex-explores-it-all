/*
 * store/presets.js -- the pattern log's storage.
 *
 * Records live in IndexedDB so photos can be stored as binary blobs without
 * hitting the few-megabyte limit of localStorage. If IndexedDB is not
 * available (private windows, locked-down embeds) the store falls back to
 * memory and says so, rather than failing silently.
 *
 * Record shape (schema 1). Phase two's 3D lab opens these same records.
 *   { id, schema, name, freq, waveform, notes, medium, photo: Blob|null,
 *     mode: string|null, plate: object|null, createdAt, updatedAt }
 */
(function (root) {
  'use strict';

  var SP = root.SP = root.SP || {};
  var DB_NAME = 'singing-plate';
  var STORE = 'presets';
  var SCHEMA = 1;
  var NAME_MAX = 120;
  var NOTES_MAX = 4000;
  var PHOTO_MAX_EDGE = 1280;
  var WAVEFORMS = ['sine', 'triangle', 'square'];
  var MEDIA = ['sand', 'salt', 'semolina', 'water', 'cornflour', 'other'];

  function newId() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* Coerce anything (form input, imported file) into a well-formed record. */
  function normalize(raw) {
    var r = raw || {};
    var freq = SP.freq.sanitize(r.freq, NaN);
    if (!isFinite(freq)) throw new Error('Preset has no valid frequency');
    var now = Date.now();
    return {
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : newId(),
      schema: SCHEMA,
      name: String(r.name || '').trim().slice(0, NAME_MAX) || 'Pattern @ ' + SP.freq.formatHz(freq) + ' Hz',
      freq: freq,
      waveform: WAVEFORMS.indexOf(r.waveform) === -1 ? 'sine' : r.waveform,
      notes: String(r.notes || '').slice(0, NOTES_MAX),
      medium: MEDIA.indexOf(r.medium) === -1 ? 'sand' : r.medium,
      photo: r.photo instanceof Blob ? r.photo : null,
      mode: typeof r.mode === 'string' ? r.mode.slice(0, 24) : null,
      plate: r.plate && typeof r.plate === 'object' ? SP.chladni.sanitizePlate(r.plate) : null,
      createdAt: isFinite(Number(r.createdAt)) && r.createdAt ? Number(r.createdAt) : now,
      updatedAt: now
    };
  }

  /* ---- backends -------------------------------------------------------- */

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req;
      try { req = root.indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
    });
  }

  function idbBackend(db) {
    function run(mode, fn) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Transaction aborted')); };
      });
    }
    return {
      persistent: true,
      list: function () { return run('readonly', function (s) { return s.getAll(); }); },
      put: function (rec) { return run('readwrite', function (s) { return s.put(rec); }); },
      remove: function (id) { return run('readwrite', function (s) { return s.delete(id); }); }
    };
  }

  function memoryBackend() {
    var map = new Map();
    return {
      persistent: false,
      list: function () { return Promise.resolve(Array.from(map.values())); },
      put: function (rec) { map.set(rec.id, rec); return Promise.resolve(); },
      remove: function (id) { map.delete(id); return Promise.resolve(); }
    };
  }

  /* ---- photos ---------------------------------------------------------- */

  /* Shrink a camera photo to a sensible size before it goes in the log. */
  function shrinkPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!(file instanceof Blob) || file.type.indexOf('image/') !== 0) {
        reject(new Error('That file is not an image'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error('Could not process that image'));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image'));
      };
      img.src = url;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    var match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!match) return null;
    var bin = atob(match[2]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  }

  /* ---- public store ---------------------------------------------------- */

  function Store(backend) {
    this._b = backend;
    this.persistent = backend.persistent;
  }

  Store.open = function () {
    return openDb()
      .then(function (db) {
        var backend = idbBackend(db);
        // Prove the store is really usable before trusting it.
        return backend.list().then(function () { return new Store(backend); });
      })
      .catch(function () { return new Store(memoryBackend()); });
  };

  Store.prototype.list = function () { return this._b.list(); };

  Store.prototype.save = function (raw) {
    var rec = normalize(raw);
    return this._b.put(rec).then(function () { return rec; });
  };

  Store.prototype.remove = function (id) { return this._b.remove(id); };

  /* The whole log as one portable JSON document, photos inlined. */
  Store.prototype.exportJson = function () {
    return this.list().then(function (records) {
      return Promise.all(records.map(function (r) {
        var photo = r.photo ? blobToDataUrl(r.photo) : Promise.resolve(null);
        return photo.then(function (dataUrl) {
          var copy = {};
          Object.keys(r).forEach(function (k) { copy[k] = r[k]; });
          copy.photo = dataUrl;
          return copy;
        });
      }));
    }).then(function (presets) {
      return JSON.stringify({
        app: 'singing-plate',
        schema: SCHEMA,
        exportedAt: new Date().toISOString(),
        presets: presets
      }, null, 2);
    });
  };

  /* Merge a previously exported log. Same id overwrites; returns the count. */
  Store.prototype.importJson = function (text) {
    var doc;
    try { doc = JSON.parse(text); } catch (e) { return Promise.reject(new Error('That file is not valid JSON')); }
    if (!doc || doc.app !== 'singing-plate' || !Array.isArray(doc.presets)) {
      return Promise.reject(new Error('That file is not a Singing Plate log'));
    }
    var self = this;
    var records = [];
    doc.presets.forEach(function (raw) {
      try {
        var withPhoto = {};
        Object.keys(raw || {}).forEach(function (k) { withPhoto[k] = raw[k]; });
        withPhoto.photo = typeof raw.photo === 'string' ? dataUrlToBlob(raw.photo) : null;
        var rec = normalize(withPhoto);
        if (isFinite(Number(raw.updatedAt))) rec.updatedAt = Number(raw.updatedAt);
        records.push(rec);
      } catch (e) { /* skip records that cannot be made valid */ }
    });
    return records.reduce(function (chain, rec) {
      return chain.then(function () { return self._b.put(rec); });
    }, Promise.resolve()).then(function () { return records.length; });
  };

  SP.Store = Store;
  SP.photos = { shrink: shrinkPhoto };
  SP.MEDIA = MEDIA;
})(typeof self !== 'undefined' ? self : this);
