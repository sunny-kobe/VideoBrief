function characterWidth(character) {
  return /^[\x00-\x7F]$/.test(character) ? 0.55 : 1;
}

function isLatinTokenCharacter(character) {
  return /^[A-Za-z0-9_./+#-]$/.test(character);
}

export function wrapText(text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    const characters = Array.from(paragraph);
    let line = '';
    let width = 0;
    for (let index = 0; index < characters.length;) {
      const character = characters[index];
      if (isLatinTokenCharacter(character)) {
        let end = index + 1;
        while (end < characters.length && isLatinTokenCharacter(characters[end])) end += 1;
        const token = characters.slice(index, end).join('');
        const tokenWidth = Array.from(token).reduce((total, item) => total + characterWidth(item), 0);
        if (line && width + tokenWidth > maxWidth) {
          lines.push(line.trimEnd());
          line = '';
          width = 0;
        }
        if (tokenWidth <= maxWidth) {
          line += token;
          width += tokenWidth;
        } else {
          for (const item of Array.from(token)) {
            const itemWidth = characterWidth(item);
            if (line && width + itemWidth > maxWidth) {
              lines.push(line.trimEnd());
              line = '';
              width = 0;
            }
            line += item;
            width += itemWidth;
          }
        }
        index = end;
        continue;
      }

      const nextWidth = characterWidth(character);
      const cannotStartLine = /^[，。！？；：、,.!?;:)）\]】]$/.test(character);
      if (line && width + nextWidth > maxWidth && cannotStartLine) {
        line += character;
        width += nextWidth;
      } else if (line && width + nextWidth > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
        width = line ? nextWidth : 0;
      } else {
        line += character;
        width += nextWidth;
      }
      index += 1;
    }
    lines.push(line);
  }
  return lines;
}
