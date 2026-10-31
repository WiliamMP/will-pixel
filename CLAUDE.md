# will-pixel

Editor de pixel art para Windows, tema **Neon**. Mesma base do will-autoclick: Tauri 2 + Rust no backend, React 19 + TypeScript + shadcn/ui na interface. Licença MIT.

O dono vem do **Delphi** e está aprendendo Rust e React: ao explicar código novo, dê uma analogia curta com Delphi/Pascal. Responda em **português**.

## Arquitetura

- `src/lib/pixels.ts`: lógica pura da imagem (RGBA em `Uint8ClampedArray`, linha de Bresenham, balde). Sem DOM.
- `src/App.tsx`: a tela inteira. A imagem vive num `useRef` e é repintada a cada render; histórico = cópia da imagem por traço.
- `src-tauri/src/lib.rs`: `read_file` / `write_file` (bytes do PNG) e `close_splash`. Os caminhos vêm do plugin dialog. **Comando novo precisa entrar no `generate_handler!`.**
- `src/lib/splash.ts` + `splashscreen.html` + `src/splash.ts`: janela de splash.

## Convenções

- Interface em **português**; código, nomes e comentários em **inglês**.
- Ícones só do **lucide-react**. Visual: tokens Neon do `src/index.css`, fontes Geist.
- Atalhos deliberados levam um comentário `ponytail:` com o limite e o caminho de melhoria.

## Testes

```bash
npm run check          # self-check de src/lib/pixels.ts
npx tsc --noEmit -p .
```

Teste visual: `npm run tauri dev`.
