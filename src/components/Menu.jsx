import { useEffect } from 'react'

export default function Menu({ actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Меню</b>
          <button onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {actions.map((a) => (
          <button
            key={a.label}
            className={'menu-item' + (a.danger ? ' danger' : '')}
            onClick={() => { onClose(); a.onClick() }}
          >
            <span className="menu-icon">{a.icon}</span>
            <span>
              {a.label}
              {a.hint && <small>{a.hint}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
