import { CANVAS_W, CANVAS_H } from '../config.js'

export default function Preview({ layers }) {
  return (
    <div
      className="stage checker"
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, '--ar': CANVAS_W / CANVAS_H }}
    >
      {layers.map((l) => (
        <img key={l.id} src={l.src} alt="" draggable={false} className="layer-img" />
      ))}
    </div>
  )
}
