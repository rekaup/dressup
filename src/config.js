// Размер холста (все части рисуются в этом разрешении). Должен совпадать с пропорциями шаблона.
export const CANVAS_W = 800
export const CANVAS_H = 1200

// Голая модель-шаблон. Положи свой файл в /public и поменяй путь (png с прозрачным фоном).
export const TEMPLATE_SRC = import.meta.env.BASE_URL + 'template.svg'

// Порядок = порядок слоёв снизу вверх. kind: 'template' — не рисуется, 'draw' — рисуется.
export const LAYERS = [
  { id: 'hairBack', name: 'Волосы (сзади)', kind: 'draw' },
  { id: 'body', name: 'Тело', kind: 'template' },
  { id: 'shoes', name: 'Обувь', kind: 'draw' },
  { id: 'bottom', name: 'Низ', kind: 'draw' },
  { id: 'top', name: 'Верх', kind: 'draw' },
  { id: 'face', name: 'Лицо', kind: 'draw' },
  { id: 'hairFront', name: 'Волосы (спереди)', kind: 'draw' },
  { id: 'accessory', name: 'Аксессуары', kind: 'draw' },
]
