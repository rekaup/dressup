import { useEffect, useMemo, useRef, useState } from 'react'
import { LAYERS, TEMPLATE_SRC, CANVAS_W, CANVAS_H } from './config.js'
import { load, save } from './storage.js'
import Preview from './components/Preview.jsx'
import Editor from './components/Editor.jsx'
import Menu from './components/Menu.jsx'

const uid = () => Math.random().toString(36).slice(2, 10)
const DRAW_LAYERS = LAYERS.filter((l) => l.kind === 'draw')

const readAsDataUrl = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })

const loadImage = (src) =>
  new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })

// вписывает картинку в холст 800×1200 по центру, без искажений
const normalize = async (file) => {
  const img = await loadImage(await readAsDataUrl(file))
  const c = document.createElement('canvas')
  c.width = CANVAS_W
  c.height = CANVAS_H
  const k = Math.min(CANVAS_W / img.width, CANVAS_H / img.height)
  const w = img.width * k
  const h = img.height * k
  c.getContext('2d').drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h)
  return c.toDataURL('image/png')
}

export default function App() {
  const [items, setItems] = useState({})       // { layerId: [{id, src}] }
  const [selected, setSelected] = useState({}) // { layerId: itemId | null }
  const [ready, setReady] = useState(false)
  const [activeLayer, setActiveLayer] = useState(DRAW_LAYERS[0].id)
  const [editing, setEditing] = useState(null) // { layerId, itemId | null }
  const [template, setTemplate] = useState(null) // null = стандартный персонаж
  const [menuOpen, setMenuOpen] = useState(false)
  const charRef = useRef(null)
  const projectRef = useRef(null)
  const tpl = template || TEMPLATE_SRC

  // загрузка
  useEffect(() => {
    load('state')
      .then((s) => {
        if (s) {
          setItems(s.items || {})
          setSelected(s.selected || {})
          setTemplate(s.template || null)
        }
      })
      .catch(console.error)
      .finally(() => setReady(true))
  }, [])

  // автосохранение
  useEffect(() => {
    if (ready) save('state', { items, selected, template }).catch(console.error)
  }, [items, selected, template, ready])

  const findItem = (layerId, itemId) => (items[layerId] || []).find((i) => i.id === itemId)

  // слои для превью (снизу вверх)
  const previewLayers = useMemo(() => {
    const out = []
    for (const l of LAYERS) {
      if (l.kind === 'template') out.push({ id: l.id, src: tpl })
      else {
        const it = findItem(l.id, selected[l.id])
        if (it) out.push({ id: l.id, src: it.src })
      }
    }
    return out
    // eslint-disable-next-line
  }, [items, selected, template])

  const saveItem = (src) => {
    const { layerId, itemId } = editing
    if (itemId) {
      setItems((p) => ({ ...p, [layerId]: p[layerId].map((i) => (i.id === itemId ? { ...i, src } : i)) }))
    } else {
      const id = uid()
      setItems((p) => ({ ...p, [layerId]: [...(p[layerId] || []), { id, src }] }))
      setSelected((p) => ({ ...p, [layerId]: id }))
    }
    setEditing(null)
  }

  const deleteItem = (layerId, itemId) => {
    if (!confirm('Удалить эту часть?')) return
    setItems((p) => ({ ...p, [layerId]: p[layerId].filter((i) => i.id !== itemId) }))
    setSelected((p) => (p[layerId] === itemId ? { ...p, [layerId]: null } : p))
  }

  const exportPng = async () => {
    const c = document.createElement('canvas')
    c.width = CANVAS_W
    c.height = CANVAS_H
    const g = c.getContext('2d')
    for (const l of previewLayers) {
      await new Promise((res) => {
        const img = new Image()
        img.onload = () => { g.drawImage(img, 0, 0, CANVAS_W, CANVAS_H); res() }
        img.onerror = res
        img.src = l.src
      })
    }
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'character.png'
    a.click()
  }

  const importCharacter = async (file) => {
    if (!file) return
    try {
      setTemplate(await normalize(file))
    } catch (e) {
      console.error(e)
      alert('Не удалось открыть картинку')
    }
  }

  const resetCharacter = () => {
    if (confirm('Вернуть стандартного персонажа?')) setTemplate(null)
  }

  const exportProject = () => {
    const blob = new Blob([JSON.stringify({ items, selected, template })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'dressup-project.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importProject = async (file) => {
    if (!file) return
    try {
      const s = JSON.parse(await file.text())
      if (!confirm('Заменить текущий проект загруженным?')) return
      setItems(s.items || {})
      setSelected(s.selected || {})
      setTemplate(s.template || null)
    } catch (e) {
      console.error(e)
      alert('Это не файл проекта')
    }
  }

  const menuActions = [
    { icon: '⬇', label: 'Скачать PNG', hint: 'Готовый персонаж одной картинкой', onClick: exportPng },
    { icon: '🧍', label: 'Импортировать персонажа', hint: 'PNG/SVG с прозрачным фоном вместо стандартного', onClick: () => charRef.current.click() },
    { icon: '↺', label: 'Стандартный персонаж', onClick: resetCharacter },
    { icon: '💾', label: 'Сохранить проект в файл', hint: 'Резервная копия всех частей', onClick: exportProject },
    { icon: '📂', label: 'Загрузить проект из файла', onClick: () => projectRef.current.click() },
  ]

  if (!ready) return <div className="loading">Загрузка…</div>

  if (editing) {
    const layer = LAYERS.find((l) => l.id === editing.layerId)
    const ghosts = previewLayers.filter((l) => l.id !== 'body' && l.id !== editing.layerId)
    return (
      <Editor
        key={editing.layerId + (editing.itemId || 'new')}
        title={layer.name}
        initialSrc={editing.itemId ? findItem(editing.layerId, editing.itemId)?.src : null}
        template={tpl}
        ghosts={ghosts}
        onSave={saveItem}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const list = items[activeLayer] || []

  return (
    <div className="app">
      <section className="preview-pane">
        <Preview layers={previewLayers} />
        <button className="primary menu-btn" onClick={() => setMenuOpen(true)} aria-label="Меню">
          ☰
        </button>
      </section>

      <section className="panel">
        <nav className="tabs">
          {DRAW_LAYERS.map((l) => (
            <button key={l.id} className={l.id === activeLayer ? 'on' : ''} onClick={() => setActiveLayer(l.id)}>
              {l.name}
            </button>
          ))}
        </nav>

        <div className="grid">
          <button
            className={'cell' + (!selected[activeLayer] ? ' on' : '')}
            onClick={() => setSelected((p) => ({ ...p, [activeLayer]: null }))}
          >
            ✕
          </button>

          {list.map((it) => (
            <div key={it.id} className={'cell checker' + (selected[activeLayer] === it.id ? ' on' : '')}>
              <img src={it.src} alt="" draggable={false} onClick={() => setSelected((p) => ({ ...p, [activeLayer]: it.id }))} />
              <div className="cell-actions">
                <button onClick={() => setEditing({ layerId: activeLayer, itemId: it.id })}>✎</button>
                <button onClick={() => deleteItem(activeLayer, it.id)}>🗑</button>
              </div>
            </div>
          ))}

          <button className="cell add" onClick={() => setEditing({ layerId: activeLayer, itemId: null })}>
            + Нарисовать
          </button>
        </div>
      </section>

      <input ref={charRef} type="file" accept="image/*" hidden
        onChange={(e) => { importCharacter(e.target.files[0]); e.target.value = '' }} />
      <input ref={projectRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { importProject(e.target.files[0]); e.target.value = '' }} />

      {menuOpen && <Menu actions={menuActions} onClose={() => setMenuOpen(false)} />}
    </div>
  )
}
