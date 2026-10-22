// Мини-обёртка над IndexedDB (localStorage слишком маленький для картинок)
const DB = 'dressup'
const STORE = 'kv'

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function load(key) {
  const db = await open()
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key)
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
}

export async function save(key, value) {
  const db = await open()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}
