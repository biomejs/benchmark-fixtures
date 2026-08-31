# Biome Benchmark Fixtures

Deterministic generated fixtures for Biome performance benchmarks.

## SCSS corpus

The corpus contains one broad syntax-coverage file and five focused files for source-mechanic performance candidates. The files are generated artifacts; edit `generate.mjs`, not files under `generated/`.

| File | Purpose |
| --- | --- |
| `generated/full-spectrum.scss` | Covers every syntax ID in the generator catalog. |
| `generated/hot-ambiguous-nested-rules.scss` | Declaration-versus-nested-rule ambiguity. |
| `generated/hot-url-interpolation.scss` | Raw URL and interpolation scanning. |
| `generated/hot-interpolated-strings.scss` | Segmented interpolated strings. |
| `generated/hot-tight-binary-expressions.scss` | Tight operators and precedence loops. |
| `generated/hot-lists-maps-arguments.scss` | Large expression collections and arguments. |

These focused files are candidates for measuring parser hot paths. Benchmark data must establish their runtime importance.

## Generate

Requires Node.js 20.19 or newer.

```shell
npm run generate
```

## Verify

```shell
npm test
npm run check
```

`manifest.json` records stable sizes, SHA-256 hashes, seeds, and syntax counts. Generation contains no timestamps or machine-specific data.

## Consumption

Pin consumers to an immutable repository commit. Do not download fixtures from the moving `main` branch in a performance baseline.

Generator version 2 is the first supported immutable baseline. Version-1 commits are development history and must not be consumed as baselines.

## License

MIT
