<p align="center">
  <img src="public/icon.svg" width="96" alt="will-pixel" />
</p>

<h1 align="center">will-pixel</h1>

<p align="center">Editor de pixel art para Windows, feito com Tauri, React e Rust.</p>

## Funcionalidades

- Lápis (`B`), borracha (`E`), balde (`G`) e conta-gotas (`I`)
- Seleção retangular (`M`): `Esc` desmarca, `Del` apaga; espelhar na horizontal e na vertical
- Mover (`V`) a seleção ou a imagem toda, arrastando ou pelas setas (1 px)
- Simetria (`S`): esquerda/direita, cima/baixo, 4 lados e radial
- Modo textura (`T`): repetição 3x3 com as emendas marcadas
- Seletor de cor em círculo ou anel + triângulo; gerenciador com várias paletas salvas, extrair paleta de imagem, converter para paleta e variações com hue shifting
- Frames de animação, play na prévia e onion skin (`O`); prévia com repetir, vai e volta, uma vez e frame a frame
- Gerador de spritesheet (espaçamento, margem, alinhamento) em PNG + JSON
- Gerador de 4 direções (sul, oeste, leste, norte) numa folha, com os pés alinhados
- Tileset: grade configurável (tamanho, margem, espaçamento), seleção de tiles e exportação dos recortes em PNG ou como frames no editor; grade de corte (`C`) e telas retangulares para props grandes
- Importa e exporta PNG

## Como rodar

```bash
npm install
npm run tauri dev
```

Instalador: `npm run tauri build` (fica em `src-tauri/target/release/bundle/`).

## Testes

```bash
npm run check
npx tsc --noEmit -p .
```

## Licença

[MIT](LICENSE)
