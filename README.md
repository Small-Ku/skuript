# Skuript

Userscripts by [Small_Ku](https://github.com/Small-Ku).

## Building

```bash
# Create a minified build for distribution
bun run build

# Generate a non-minified development build with inline sourcemap
bun run build:dev

# Watch for changes and automatically run development builds
bun run build:watch

# View additional building options
bun run build.ts --help
```

## Acknowledgements

The workspace is based on [Xmonkey Userscript: Bun + TypeScript Boilerplate](https://github.com/genzj/bun-ts-userscript-starter) but modified for multiple userscripts.
