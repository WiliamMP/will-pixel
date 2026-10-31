# will-pixel

Editor de pixel art para Windows, tema **Neon**. Mesma base do will-autoclick: Tauri 2 + Rust no backend, React 19 + TypeScript + shadcn/ui na interface. Licença MIT.

O dono vem do **Delphi** e está aprendendo Rust e React: ao explicar código novo, dê uma analogia curta com Delphi/Pascal. Responda em **português**.

## Arquitetura

- `src/lib/pixels.ts`: lógica pura da imagem (RGBA em `Uint8ClampedArray`, linha de Bresenham, balde). Sem DOM.
- `src/lib/color.ts`: conversões HSV/OKLab, distância perceptual, cores parecidas, extrair (median cut), converter para paleta, variações com hue shifting. `src/lib/png.ts`: PNG <-> `Img`.
- `src/components/ColorPicker.tsx`: seletor HSV em círculo ou anel + triângulo, desenhado pixel a pixel num canvas.
- `src/components/PalettePanel.tsx`: variações e gerenciador de paletas (várias paletas salvas no localStorage).
- `src/lib/sheet.ts` + `src/components/SpriteSheetDialog.tsx`: gerador de spritesheet (grade de células do tamanho do maior sprite, PNG + JSON).
- `src/App.tsx`: a tela inteira. Os frames vivem num `useRef` (`img.current` = frame atual) e são repintados a cada render; histórico = cópia do frame por traço, com o número do frame. `src/components/Timeline.tsx`: faixa de frames, play e onion skin.
- `src-tauri/src/lib.rs`: `read_file` / `write_file` (bytes do PNG) e `close_splash`. Os caminhos vêm do plugin dialog. **Comando novo precisa entrar no `generate_handler!`.**
- `src/lib/splash.ts` + `splashscreen.html` + `src/splash.ts`: janela de splash.

## Convenções

- Interface em **português**; código, nomes e comentários em **inglês**.
- Ícones só do **lucide-react**. Visual: tokens Neon do `src/index.css`, fontes Geist.
- Atalhos deliberados levam um comentário `ponytail:` com o limite e o caminho de melhoria.

## Testes

```bash
npm run check          # self-checks de src/lib/*.check.ts
npx tsc --noEmit -p .
```

Teste visual: `npm run tauri dev`.
