# Where these pictures come from

Every picture on `/web-instruments` is a photograph quantised to the cell
and to the site's palette by `scripts/img/pixelate.mjs` and written out as
an ordinary PNG at 4 px a cell. Nothing here is drawn by hand. Every file
was run through `node scripts/img/strip-metadata.mjs` before it was
committed, per the repo rule.

The set is one set: the same grey (`--palette mute`), the same dither,
the same outline, and shown at one scale, a CSS px an image px (halved only
where the room is short). The cell counts are chosen so they read as one
set at that scale: the long instruments at 120 cells, the tall ones at 100.

| file         | source                                                                                                                                                                                                                | pixelate command                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `rhodes.png` | [Rhodes Mk II 73 cropped.jpg](https://commons.wikimedia.org/wiki/File:Rhodes_Mk_II_73_cropped.jpg), Jcsutton (English Wikipedia), cropped by Evill, CC BY-SA 3.0 (GFDL, migrated), converted to PNG with `sips` first | `--cells 120 --palette mute --key 40 --flood --dither --outline --trim --png rhodes.png --scale 4` |
| `synth.png`  | [EMS Putney VCS 3.jpg](https://commons.wikimedia.org/wiki/File:EMS_Putney_VCS_3.jpg), Rosa Menkman (Flickr), CC BY 2.0, converted to PNG with `sips` first                                                            | `--cells 100 --palette mute --key 40 --flood --dither --outline --trim --png synth.png --scale 4`  |

The photographs stand on white, which `--flood` drops: only the background
that reaches the edge goes, so the details inside the instrument stay.

`../canvas/web-instruments.png`, the object this entry is on the canvas, is
`rhodes.png` itself run back through the tool at the site's cell,
`pixelate.mjs rhodes.png --cells 56 --palette mute --png ../canvas/web-instruments.png --scale 4`,
so the object on the ground is the page's drawing at fewer cells, small
enough to be shown 1:1 on its tile.

## What the licence asks of us

The bass, the ukulele and the drums have no picture in this repository:
their photographs were never released under an open licence, so the stage
stands empty for them. Add your own (a photograph you hold the rights to,
pixelated with the command in the table) as `bass.png`, `ukulele.png` and
`drums.png`, with an `<img class="shot" data-for="...">` line in the entry.

- **CC BY-SA** (`rhodes.png`): name the author, and the derivative carries
  the same licence. The pixelated PNG made from that photograph, and the
  canvas object made from the same one, are therefore offered under
  CC BY-SA 3.0; the rest of the site is not.
- **CC BY** (`synth.png`): name the author and the licence, and say it was
  changed (it was: quantised to the cell and to three greys). The pixelated
  PNG carries no share-alike condition.
