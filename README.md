# JKAnime para Mangayomi — experimental 0.1.0

Extensión JavaScript `DefaultExtension extends MProvider` para agregar JKAnime
como fuente de anime en español. Lee el sitio actual directamente: no necesita
servidor propio, cuenta ni la antigua API de chrismichaelps.

## Agregar en Mangayomi TV

Agregá esta URL como repositorio de **Anime**, actualizá el catálogo e instalá
**JKAnime**:

```text
https://raw.githubusercontent.com/marblingdesing-ai/mangayomi-jkanime/main/anime_index.json
```

No requiere GitHub Pages. La instalación en Mangayomi/Onn TV todavía no fue
comprobada. La ubicación de la opción de repositorios varía por versión.

## Implementado

- Explorar: directorio paginado del sitio, no un ranking de popularidad.
- Novedades: animes, donghuas y OVAs de la portada; una sola página, con series
  deduplicadas. No incluye enlaces del sitio hentai separado.
- Búsqueda y navegación con portadas de serie. En novedades se usa
  `data-animepic`; nunca se usa una miniatura de episodio como portada.
- Fichas: título, portada, sinopsis, géneros únicos, estado y capítulos.
- Capítulos: listado AJAX real del sitio, con sesión y token CSRF obtenidos al
  abrir la ficha, ordenado de mayor a menor y deduplicado. No se usa el recuento
  de la ficha para inventar enlaces: algunas series en emisión declaran 0.
  Se conservan números decimales y huecos. Se consultan todas las páginas de
  episodios con un máximo de dos solicitudes simultáneas y límite de 200 páginas;
  si falla una se informa el error, sin presentar una lista parcial como completa.
  Abrir series muy largas puede tardar más. No se inventan fechas.
- Servidores: lectura del JSON `servers` de cada episodio; decodificación de
  URLs y conexión a extractores nativos de Mangayomi para Voe, MP4Upload,
  Streamwish (hosts hgcloud.to/streamwish.to) y Streamtape. Si falla uno se
  intenta el siguiente. Se conservan las cabeceras y pistas del extractor.
- No se ejecutan scripts remotos con `eval`. Los reproductores internos JK,
  UM/UMV, Mega, Mediafire, Mixdrop y otros hosts no están implementados.
- Si no se obtiene video se devuelve un error explícito. Las páginas de
  reproductor no se presentan como archivos reproducibles.

El código para Mangayomi no necesita dependencias Node. Cheerio se usa solamente
en el adaptador de pruebas de escritorio para simular `Document`.

## Validación — 1 de noviembre de 2026

**7 pruebas locales aprobadas**, con varios casos por prueba: directorio y
paginación, JSON con comillas y llaves, deduplicación, portadas, búsqueda vacía,
errores HTTP y cambios de estructura, slugs con punto, paginación real de
capítulos aunque la ficha indique 0, huecos, números decimales, sesión/CSRF,
géneros, fallo de un extractor, conservación de cabeceras y rechazo de embeds.
Los extractores de video están simulados en estas pruebas.

Prueba real del adaptador con cinco consultas al sitio (cuatro HTML y un POST
para el listado de episodios):

| Resultado | Observado |
| --- | --- |
| Directorio, página 1 | 30 animes y página siguiente |
| Novedades | 41 series deduplicadas |
| Búsqueda `naruto` | 23 resultados |
| Ficha Dragon Ball Super: Beerus | 4 episodios publicados, aunque la ficha declara 0 |
| Rutas de imágenes devueltas | portadas `/animes/image/` |

Se comprobó también que Naruto declara 220 episodios, que su endpoint AJAX
responde con episodios publicados y que Naruto/1 contiene JSON de servidores.
Los conteos y servidores pueden cambiar. No se descargó ni reprodujo el video.
No se guardan enlaces firmados, tokens de sesión ni datos de navegación en el
repositorio.

**Pendiente:** carga en QuickJS de Mangayomi, instalación desde este índice,
extracción real de video, reproducción, audio, subtítulos y uso con el control
remoto en Onn TV. Las pruebas de escritorio no confirman esos puntos.

Para repetir las pruebas con Node.js 22 o posterior:

```sh
npm ci --ignore-scripts
npm test
npm run smoke
```

`smoke` requiere Internet y `curl.exe` en Windows. Se detiene ante errores HTTP;
no evita desafíos, bloqueos ni protecciones del sitio.

## Investigación y referencias

- [Proyecto solicitado: chrismichaelps/jkanime](https://github.com/chrismichaelps/jkanime/tree/d6e586a5cf1c2a4c256bc9aba354feaebe066afe): referencia histórica, con aviso de fin de mantenimiento en 2020. Su despliegue público devolvió HTTP 404 `DEPLOYMENT_NOT_FOUND` al comprobarlo. El código nuevo no depende de ese despliegue ni copia su ejecución de scripts remotos.
- [JKAnime](https://jkanime.net/): formularios de búsqueda, JSON del directorio, tarjetas con `data-animepic`, recuento de episodios y JSON de servidores observados en las páginas actuales.
- [Contrato de Mangayomi consultado](https://github.com/kodjodevf/mangayomi/tree/fd89a37ac6c1dcbc0fad361fd874fee21bf74c7e): `lib/eval/javascript/service.dart`, `dom_selector.dart`, `http.dart`, `extractors.dart` y modelos de fuente, manga y video. El índice usa `itemType: 1` y `sourceCodeLanguage: 1`.

La versión mínima indicada en el índice (`0.5.0`) es una referencia histórica
del formato JavaScript, no una versión probada. Cambios del sitio o de los
extractores pueden requerir actualizar la extensión.
