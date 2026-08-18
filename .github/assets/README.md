# README assets

Images used by the root `README.md`. Nothing here is shipped with the app,
which is why it lives outside the Next.js project rather than in a served
assets folder.

| File | Used for |
| --- | --- |
| `logo-light.png` | The banner at the top of the README |

## Adding a dark-mode variant

GitHub has a dark theme and most people use it. If your logo has dark artwork
on a light or transparent background, it will look wrong there. To serve a
different file per theme, add `logo-dark.png` next to this file and swap the
`<img>` tag at the top of the root README for this:

```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/logo-light.png">
    <img alt="Open Social" src=".github/assets/logo-light.png" width="520">
  </picture>
</p>
```

`<picture>` is the approach GitHub supports. The older `#gh-dark-mode-only`
anchor trick is deprecated.

## Sizing

Set `width` on the `<img>` tag, never CSS, which GitHub strips. The current
value is 520, which suits a wide banner. A square mark usually wants 120 to 180.
Do not set both width and height or the image will be distorted.

Export at roughly twice the display width so it stays sharp on retina screens.
