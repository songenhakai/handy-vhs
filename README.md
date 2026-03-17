# Handy VHS

VHS effect implementation with TypeScript + React and frei0r plugin.

## Structure

```
handy-vhs/
├── src/
│   ├── App.tsx          # React components
│   ├── App.css          # Styles
│   ├── lib/
│   │   └── HandyVHS.ts  # Core VHS effect engine
│   ├── plugin/
│   │   ├── frei0r.h     # frei0r API header
│   │   └── handy_vhs.c  # frei0r plugin (C)
│   └── main.tsx
├── CMakeLists.txt       # Build config for frei0r plugin
├── package.json
└── vite.config.ts
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

## Build frei0r Plugin

```bash
mkdir build && cd build
cmake ..
make
```

## Install frei0r Plugin

Copy `build/handy_vhs.dylib` (macOS) or `build/handy_vhs.so` (Linux) to your frei0r plugins directory:

- macOS: `~/.frei0r-1/` or `/usr/local/lib/frei0r-1/`
- Linux: `~/.frei0r-1/` or `/usr/lib/frei0r-1/`

## Use in Video Editors

- Shotcut
- Kdenlive
- OpenShot
- Other frei0r-compatible editors

## License

MIT