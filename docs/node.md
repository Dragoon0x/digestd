# running on node instead of bun

digestd is built for bun first. bun handles native typescript, native
sqlite, and single-binary compilation out of the box, which is why
it's the default.

if you don't want to install bun, node 22+ works with `--experimental-strip-types`.

## requirements

- node 22 or later
- a sqlite library since node doesn't bundle one yet

## install

```bash
git clone https://github.com/Dragoon0x/digestd
cd digestd
npm install
npm install better-sqlite3   # node-compatible sqlite
```

## run

```bash
node --experimental-strip-types src/cli.ts run
```

or add to package.json scripts:

```json
{
  "scripts": {
    "start:node": "node --experimental-strip-types src/cli.ts"
  }
}
```

## what won't work on node yet

`src/state/db.ts` imports from `bun:sqlite`. to use node you need to
swap that import for `better-sqlite3`. the api is nearly identical but
not 100%. a node-compat adapter is on the v0.4 list.

if you want this sooner, open a PR. it's a small change.

## why bun by default

three reasons:

1. **single binary**. `bun build --compile` produces a standalone
   executable. users grab one file from github releases. no node, no
   runtime, no install dance. that's the whole point of v0.4.
2. **native typescript**. no transpile step in development.
3. **native sqlite**. no native dep that breaks on every electron-like
   install.

node will catch up. when `node --experimental-sqlite` stabilizes,
the gap closes.
