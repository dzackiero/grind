# Grind promo: Instagram story

A 15 second, 1080 × 1920 story that promotes the app. Everything is code, so it can be edited and made again.

| File | What it is |
|---|---|
| `grind-story.html` | The animation. One function, `render(t)`, draws any moment, so it can be played or exported frame by frame. Open it in a browser to watch it loop (space pauses). `?t=4.5` shows one moment. |
| `render-story.mjs` | Chrome shows each frame and ffmpeg joins them into `out/grind-story.mp4` (silent). Also writes a few still frames. |
| `make-sfx.mjs` | Synthesises the sound effects and puts them on the video: `out/grind-story-sfx.mp4` and `out/grind-story-sfx.wav`. |

## Make it

Needs Node 22 or newer, Chrome or Edge, and ffmpeg on the PATH.

```bash
node promo/render-story.mjs      # the video, about 50 seconds
node promo/make-sfx.mjs          # the same video with sound
node promo/render-story.mjs --quick   # first second only, to try a change
```

Everything lands in `promo/out/`, which git ignores.

## Notes

- The mark is drawn from the same numbers as the app (`src/lib/brand-mark.ts`). If the logo changes there, change `markSVG` in `grind-story.html` too; the test only watches the files in `public/brand`.
- Instagram covers about the top 250 px and the bottom 340 px with its own buttons, so the content stays between them.
- The sounds are synthetic and sparse on purpose. For music, add one from Instagram's library when posting; the silent video is there for that.
- The web fonts (Archivo, Geist) are loaded from Google Fonts, so the first render needs a connection.
