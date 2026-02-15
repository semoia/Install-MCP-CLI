# @semoia/install-mcp

Node-based installer for Semoia MCP.

This CLI downloads the latest setup wizard from Semoia and runs it locally, so users get the same flow as:

```bash
curl -fsSL https://beta.trysemoia.com/scripts/install-mcp.sh | bash
```

## Usage

### Remote setup (default)

```bash
npx @semoia/install-mcp
```

### Target a specific client

```bash
npx @semoia/install-mcp cursor
```

### Help

```bash
npx @semoia/install-mcp --help
```

## Options

- `-h, --help`: Show help
- `--timeout <ms>`: Download timeout (default `30000`)
- `--dry-run`: Print resolved values and exit

This CLI is locked to the official setup endpoint:

`https://beta.trysemoia.com/api/setup-script?type=js`

Any unknown args are passed through to `setup.mjs`.

## Development

```bash
npm install
npm run build
node dist/index.js --help
```

## Notes

- Requires Node.js 18+
- Intended for end-user installation only (official Semoia domain).
- The installer only launches the wizard; client-specific config is handled by the downloaded setup script.
