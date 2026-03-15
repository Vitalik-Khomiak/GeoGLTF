# Models Folder

Поклади сюди свої `.glb` файли для опублікованої бібліотеки.

Приклад:

- `cube.glb`
- `pyramid.glb`
- `prism.glb`

Після цього додай записи у `assets/library.json`.

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
