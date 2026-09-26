# 3D graphics (source)

The images in `public/graphics/3d-*.{png,jpg}` are rendered offline from `scenes.js` with three.js in headless Chromium — no stock imagery, no runtime WebGL.

Re-render (from a scratch folder, so `three` never enters the site bundle):

```bash
mkdir /tmp/render && cp scripts/graphics/* /tmp/render && cd /tmp/render
npm init -y && npm i three@0.170 playwright-core
node serve.mjs &                       # static server on :4567
node shot.mjs "scene.html?s=fintech&w=1600&h=1200" out.png 1600 1200
```

Scenes: `blockchain`, `fintech`, `ai`, `cloud`, `digital`, `globe`, `tokens`, `security`, `exchange`, `api`.
Light scenes render on a transparent background (trim and pad before saving); `ai` and `globe` render on navy.
The globe logs projected pin positions for the Gurgaon, Dallas and London labels used on the site.
