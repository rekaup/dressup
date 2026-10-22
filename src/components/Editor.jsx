import { useEffect, useRef, useState } from 'react'
import { CANVAS_W, CANVAS_H } from '../config.js'

const MAX_HISTORY = 40
const MIN_SCALE = 0.5
const MAX_SCALE = 8
const PADDING = 16
const PALETTE = ['#000000', '#ffffff', '#e63946', '#f4a261', '#ffd166', '#06d6a0', '#118ab2', '#7b2cbf', '#ff8fab', '#8d5b3b']
const clamp = (v) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v))

/**
 * props:
 *  title      — название слоя
 *  initialSrc — dataURL, если редактируем существующую часть
 *  template   — src голой модели
 *  ghosts     — [{id, src}] остальные надетые части (для ориентира)
 *  onSave(dataUrl), onCancel()
 *
 * Управление: 1 палец / мышь — рисовать, 2 пальца — зум и перемещение,
 * колесо мыши — зум, средняя кнопка мыши или инструмент «Двигать» — перемещение.
 */
export default function Editor({ title, initialSrc, template, ghosts, onSave, onCancel }) {
  const canvasRef = useRef(null)
  const viewportRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const history = useRef([])
  const hIndex = useRef(-1)
  const [, force] = useState(0)

  // жесты
  const pointers = useRef(new Map()) // id -> {x, y} относительно viewport
  const gesture = useRef(null)
  const panning = useRef(null)
  const skipDraw = useRef(false)

  // вид (перемещение + масштаб)
  const viewRef = useRef({ x: 0, y: 0, scale: 1 })
  const fitRef = useRef({ w: 0, h: 0, vw: 0, vh: 0 })
  const [view, setViewState] = useState(viewRef.current)
  const [fit, setFit] = useState(fitRef.current)
  const setView = (v) => { viewRef.current = v; setViewState(v) }

  const [tool, setTool] = useState('brush') // brush | eraser | pan
  const [color, setColor] = useState('#000000')
  const [size, setSize] = useState(8)
  const [showTemplate, setShowTemplate] = useState(true)
  const [templateOpacity, setTemplateOpacity] = useState(0.5)
  const [templateOnTop, setTemplateOnTop] = useState(false)
  const [showGhosts, setShowGhosts] = useState(true)

  const ctx = () => canvasRef.current.getContext('2d')

  /* ---------- история ---------- */
  const pushHistory = () => {
    const c = canvasRef.current
    const snap = ctx().getImageData(0, 0, c.width, c.height)
    history.current = history.current.slice(0, hIndex.current + 1)
    history.current.push(snap)
    if (history.current.length > MAX_HISTORY) history.current.shift()
    hIndex.current = history.current.length - 1
    force((n) => n + 1)
  }

  const restore = (i) => {
    hIndex.current = i
    ctx().putImageData(history.current[i], 0, 0)
    force((n) => n + 1)
  }

  const undo = () => hIndex.current > 0 && restore(hIndex.current - 1)
  const redo = () => hIndex.current < history.current.length - 1 && restore(hIndex.current + 1)

  useEffect(() => {
    const c = canvasRef.current
    c.width = CANVAS_W
    c.height = CANVAS_H
    if (initialSrc) {
      const img = new Image()
      img.onload = () => {
        ctx().drawImage(img, 0, 0, CANVAS_W, CANVAS_H)
        pushHistory()
      }
      img.src = initialSrc
    } else {
      pushHistory()
    }
    // eslint-disable-next-line
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------- вид: подгонка, зум ---------- */
  const resetView = () => {
    const { w, h, vw, vh } = fitRef.current
    setView({ scale: 1, x: (vw - w) / 2, y: (vh - h) / 2 })
  }

  useEffect(() => {
    const el = viewportRef.current
    const measure = () => {
      const vw = el.clientWidth
      const vh = el.clientHeight
      if (!vw || !vh) return
      const k = Math.min((vw - PADDING * 2) / CANVAS_W, (vh - PADDING * 2) / CANVAS_H)
      const first = !fitRef.current.w
      fitRef.current = { w: CANVAS_W * k, h: CANVAS_H * k, vw, vh }
      setFit(fitRef.current)
      if (first || viewRef.current.scale === 1) resetView()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // зум вокруг точки (cx, cy — координаты внутри viewport)
  const zoomAt = (cx, cy, factor) => {
    const v = viewRef.current
    const s = clamp(v.scale * factor)
    const k = s / v.scale
    setView({ scale: s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k })
  }

  const zoomCenter = (factor) => zoomAt(fitRef.current.vw / 2, fitRef.current.vh / 2, factor)

  // колесо мыши / pinch на тачпаде
  useEffect(() => {
    const el = viewportRef.current
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------- рисование ---------- */
  const pos = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect() // учитывает transform
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height }
  }

  const setupBrush = (e) => {
    const g = ctx()
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? 0.3 + e.pressure * 0.9 : 1
    const w = size * pressure
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.lineWidth = w
    g.strokeStyle = color
    g.fillStyle = color
    g.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    return w
  }

  const startStroke = (e) => {
    drawing.current = true
    const p = pos(e)
    last.current = p
    const w = setupBrush(e)
    const g = ctx()
    g.beginPath()
    g.arc(p.x, p.y, w / 2, 0, Math.PI * 2)
    g.fill()
  }

  const endStroke = () => {
    drawing.current = false
    ctx().globalCompositeOperation = 'source-over'
    pushHistory()
  }

  // второй палец коснулся экрана — отменяем начатый штрих (это жест, а не рисунок)
  const cancelStroke = () => {
    if (!drawing.current) return
    drawing.current = false
    ctx().globalCompositeOperation = 'source-over'
    ctx().putImageData(history.current[hIndex.current], 0, 0)
  }

  /* ---------- указатели ---------- */
  const rel = (e) => {
    const r = viewportRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onDown = (e) => {
    viewportRef.current.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, rel(e))
    const n = pointers.current.size

    if (n === 2) {
      cancelStroke()
      panning.current = null
      skipDraw.current = true
      const [a, b] = [...pointers.current.values()]
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        view: { ...viewRef.current },
      }
      return
    }
    if (n > 2 || skipDraw.current) return

    if (tool === 'pan' || (e.pointerType === 'mouse' && e.button === 1)) {
      e.preventDefault()
      panning.current = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startStroke(e)
  }

  const onMove = (e) => {
    const p = pointers.current.get(e.pointerId)
    if (!p) return
    Object.assign(p, rel(e))

    if (gesture.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const g = gesture.current
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const s = clamp((g.view.scale * dist) / g.dist)
      const px = (g.cx - g.view.x) / g.view.scale
      const py = (g.cy - g.view.y) / g.view.scale
      setView({ scale: s, x: cx - px * s, y: cy - py * s })
      return
    }

    if (panning.current) {
      const v = viewRef.current
      const dx = e.clientX - panning.current.x
      const dy = e.clientY - panning.current.y
      panning.current = { x: e.clientX, y: e.clientY }
      setView({ ...v, x: v.x + dx, y: v.y + dy })
      return
    }

    if (drawing.current) {
      const g = ctx()
      const events = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : []
      for (const ev of events.length ? events : [e.nativeEvent]) {
        const pt = pos(ev)
        setupBrush(ev)
        g.beginPath()
        g.moveTo(last.current.x, last.current.y)
        g.lineTo(pt.x, pt.y)
        g.stroke()
        last.current = pt
      }
    }
  }

  const onUp = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    if (drawing.current) endStroke()
    if (pointers.current.size < 2) gesture.current = null
    if (pointers.current.size === 0) {
      skipDraw.current = false
      panning.current = null
    }
  }

  const clearAll = () => {
    ctx().clearRect(0, 0, CANVAS_W, CANVAS_H)
    pushHistory()
  }

  const handleSave = () => onSave(canvasRef.current.toDataURL('image/png'))

  const tplStyle = { opacity: templateOpacity, zIndex: templateOnTop ? 3 : 1 }
  const pickColor = (c) => { setColor(c); setTool('brush') }

  return (
    <div className="editor">
      <header className="editor-bar">
        <button onClick={onCancel}>← Отмена</button>
        <strong>{title}</strong>
        <button className="primary" onClick={handleSave}>Сохранить</button>
      </header>

      <div
        className="viewport"
        ref={viewportRef}
        style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="stage checker"
          style={{ width: fit.w, height: fit.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        >
          {showGhosts &&
            ghosts.map((g) => <img key={g.id} src={g.src} alt="" draggable={false} className="layer-img" style={{ zIndex: 0 }} />)}
          {showTemplate && <img src={template} alt="" draggable={false} className="layer-img" style={tplStyle} />}
          <canvas ref={canvasRef} className="layer-img draw-canvas" style={{ zIndex: 2 }} />
        </div>
      </div>

      <div className="tools">
        <div className="row">
          <button className={tool === 'brush' ? 'on' : ''} onClick={() => setTool('brush')}>Кисть</button>
          <button className={tool === 'eraser' ? 'on' : ''} onClick={() => setTool('eraser')}>Ластик</button>
          {/* <button className={tool === 'pan' ? 'on' : ''} onClick={() => setTool('pan')}>Двигать</button>*/}
          <button onClick={undo} disabled={hIndex.current <= 0}>↶</button>
          <button onClick={redo} disabled={hIndex.current >= history.current.length - 1}>↷</button>
          <button onClick={clearAll}>Очистить</button>
        </div>

        <div className="row">
          <input type="color" value={color} onChange={(e) => pickColor(e.target.value)} />
          {PALETTE.map((c) => (
            <button
              key={c}
              className={'swatch' + (c === color && tool !== 'eraser' ? ' on' : '')}
              style={{ background: c }}
              onClick={() => pickColor(c)}
              aria-label={c}
            />
          ))}
        </div>

        <div className="row">
          <label className="field">
            <span>Размер {size}</span>
            <input type="range" min="1" max="80" value={size} onChange={(e) => setSize(+e.target.value)} />
          </label>
          <div className="row tight">
            <button onClick={() => zoomCenter(1 / 1.25)}>−</button>
            <button className="zoom-label" onClick={resetView}>{Math.round(view.scale * 100)}%</button>
            <button onClick={() => zoomCenter(1.25)}>+</button>
          </div>
        </div>

        <div className="row">
          <button className={showTemplate ? 'on' : ''} onClick={() => setShowTemplate((v) => !v)}>Шаблон</button>
          <button className={templateOnTop ? 'on' : ''} onClick={() => setTemplateOnTop((v) => !v)}>Поверх рисунка</button>
          <button className={showGhosts ? 'on' : ''} onClick={() => setShowGhosts((v) => !v)}>Другие части</button>
          <label className="field">
            <span>Прозрачность</span>
            <input type="range" min="0.05" max="1" step="0.05" value={templateOpacity} onChange={(e) => setTemplateOpacity(+e.target.value)} />
          </label>
        </div>
      </div>
    </div>
  )
}
