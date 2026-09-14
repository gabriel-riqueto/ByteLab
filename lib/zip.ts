export interface ArquivoZip {
  nome: string;
  conteudo: string;
}

const TABELA_CRC32 = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let valor = n;
    for (let k = 0; k < 8; k++) valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
    tabela[n] = valor >>> 0;
  }
  return tabela;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = TABELA_CRC32[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function escrever16(view: DataView, offset: number, valor: number) {
  view.setUint16(offset, valor, true);
}

function escrever32(view: DataView, offset: number, valor: number) {
  view.setUint32(offset, valor >>> 0, true);
}

function bufferProprio(bytes: Uint8Array): ArrayBuffer {
  const copia = new Uint8Array(bytes.length);
  copia.set(bytes);
  return copia.buffer;
}

/** Cria um ZIP sem compressão para reunir os arquivos Amazon em um único download. */
export function criarZip(arquivos: ArquivoZip[]): Blob {
  const encoder = new TextEncoder();
  const partesLocais: Uint8Array[] = [];
  const diretorioCentral: Uint8Array[] = [];
  let offsetLocal = 0;

  for (const arquivo of arquivos) {
    const nome = encoder.encode(arquivo.nome);
    const dados = encoder.encode(arquivo.conteudo);
    const checksum = crc32(dados);

    const cabecalhoLocal = new Uint8Array(30 + nome.length);
    const local = new DataView(cabecalhoLocal.buffer);
    escrever32(local, 0, 0x04034b50);
    escrever16(local, 4, 20);
    escrever16(local, 6, 0x0800);
    escrever16(local, 8, 0);
    escrever16(local, 10, 0);
    escrever16(local, 12, 0);
    escrever32(local, 14, checksum);
    escrever32(local, 18, dados.length);
    escrever32(local, 22, dados.length);
    escrever16(local, 26, nome.length);
    escrever16(local, 28, 0);
    cabecalhoLocal.set(nome, 30);
    partesLocais.push(cabecalhoLocal, dados);

    const centralBytes = new Uint8Array(46 + nome.length);
    const central = new DataView(centralBytes.buffer);
    escrever32(central, 0, 0x02014b50);
    escrever16(central, 4, 20);
    escrever16(central, 6, 20);
    escrever16(central, 8, 0x0800);
    escrever16(central, 10, 0);
    escrever16(central, 12, 0);
    escrever16(central, 14, 0);
    escrever32(central, 16, checksum);
    escrever32(central, 20, dados.length);
    escrever32(central, 24, dados.length);
    escrever16(central, 28, nome.length);
    escrever16(central, 30, 0);
    escrever16(central, 32, 0);
    escrever16(central, 34, 0);
    escrever16(central, 36, 0);
    escrever32(central, 38, 0);
    escrever32(central, 42, offsetLocal);
    centralBytes.set(nome, 46);
    diretorioCentral.push(centralBytes);

    offsetLocal += cabecalhoLocal.length + dados.length;
  }

  const tamanhoCentral = diretorioCentral.reduce((total, parte) => total + parte.length, 0);
  const fim = new Uint8Array(22);
  const eocd = new DataView(fim.buffer);
  escrever32(eocd, 0, 0x06054b50);
  escrever16(eocd, 4, 0);
  escrever16(eocd, 6, 0);
  escrever16(eocd, 8, arquivos.length);
  escrever16(eocd, 10, arquivos.length);
  escrever32(eocd, 12, tamanhoCentral);
  escrever32(eocd, 16, offsetLocal);
  escrever16(eocd, 20, 0);

  return new Blob(
    [...partesLocais, ...diretorioCentral, fim].map(bufferProprio),
    { type: "application/zip" }
  );
}
