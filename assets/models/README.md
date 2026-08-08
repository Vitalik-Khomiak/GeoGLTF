# Models Folder

`.glb` файли опублікованої бібліотеки.

Більшість навчальних тіл описано в `tools/make-models.mjs` і генерується
командою `node tools/make-models.mjs`. Правити геометрію треба там, а не
у файлах: розміри тіл входять в умови завдань, тому вони мають лишатися
відтворюваними. Перевірка — `node tools/check-models.mjs`.

Сюди ж можна класти й готові `.glb` з інших джерел.

Після додавання файлу — запис у `assets/library.json`, шлях у `PRECACHE`
у `sw.js` і підняття версії кеша.

Приклад структури:

```json
{
  "assets": [
    {
      "title": "Куб",
      "description": "Базова модель для просторових вправ",
      "file": "./assets/models/cube.glb",
      "sizeLabel": "320 KB"
    },
    {
      "title": "Піраміда",
      "description": "Модель для теми многогранників",
      "file": "./assets/models/pyramid.glb"
    }
  ]
}
```
