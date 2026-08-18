# README assets

Images used by the repository README. Nothing in here is shipped with the app,
which is why it lives outside `public/`.

Expected files, referenced by the `<picture>` block at the top of `/README.md`:

| File | Shown when | Notes |
| --- | --- | --- |
| `logo-light.png` | GitHub is in light mode | Also the fallback for anything that ignores `<picture>` |
| `logo-dark.png` | GitHub is in dark mode | Usually the same mark in a lighter colour |

If you only have one logo and it reads well on both backgrounds, save the same
file under both names, or simplify the block in the README down to a single
`<img>` tag.

SVG is preferred over PNG when you have it: it stays sharp at any size and is
usually a fraction of the file size. If you use SVG, change the file extensions
in the README block to match.
