export function chave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export const CORES: Record<string, string> = {
  preto: "Black",
  branco: "White",
  cinza: "Gray",
  "cinza claro": "Light Gray",
  "cinza escuro": "Dark Gray",
  azul: "Blue",
  "azul marinho": "Navy",
  "azul claro": "Light Blue",
  "azul escuro": "Dark Blue",
  vermelho: "Red",
  verde: "Green",
  amarelo: "Yellow",
  laranja: "Orange",
  rosa: "Pink",
  roxo: "Purple",
  lilas: "Lilac",
  marrom: "Brown",
  bege: "Beige",
  dourado: "Gold",
  prateado: "Silver",
  vinho: "Burgundy",
  caqui: "Khaki",
  "off white": "Off White",
  multicolorido: "Multicolor",
  estampado: "Print",
};

export const TAMANHOS: Record<string, string> = {
  pp: "XS",
  p: "S",
  m: "M",
  g: "L",
  gg: "XL",
  xg: "XL",
  eg: "XXL",
  "eg2": "XXXL",
  xxg: "XXL",
  xs: "XS",
  s: "S",
  l: "L",
  xl: "XL",
  xxl: "XXL",
  xxxl: "XXXL",
  unico: "One Size",
  "tamanho unico": "One Size",
  u: "One Size",
};

export interface DepartamentoInfo {
  valor: string;
  rotulo: string;
  generoAlvo: string;
  faixaEtaria: string;
}

// Departamento já implica gênero-alvo e faixa etária no vocabulário da Amazon —
// por isso não pedimos essas duas informações de novo ao vendedor, só derivamos daqui.
export const DEPARTAMENTOS: DepartamentoInfo[] = [
  { valor: "mens", rotulo: "Masculino adulto (mens)", generoAlvo: "male", faixaEtaria: "Adult" },
  { valor: "womens", rotulo: "Feminino adulto (womens)", generoAlvo: "female", faixaEtaria: "Adult" },
  { valor: "unisex-adult", rotulo: "Unissex adulto", generoAlvo: "unisex", faixaEtaria: "Adult" },
  { valor: "girls", rotulo: "Infantil - menina", generoAlvo: "female", faixaEtaria: "Kids" },
  { valor: "boys", rotulo: "Infantil - menino", generoAlvo: "male", faixaEtaria: "Kids" },
];

const ALIASES_DEPARTAMENTO: Record<string, string> = {
  mens: "mens",
  masculino: "mens",
  homem: "mens",
  homens: "mens",
  male: "mens",
  womens: "womens",
  feminino: "womens",
  mulher: "womens",
  mulheres: "womens",
  female: "womens",
  unissex: "unisex-adult",
  unisex: "unisex-adult",
  "unissex adulto": "unisex-adult",
  "unisex adult": "unisex-adult",
  "unisex-adult": "unisex-adult",
  girls: "girls",
  menina: "girls",
  meninas: "girls",
  boys: "boys",
  menino: "boys",
  meninos: "boys",
};

export function normalizarDepartamento(valor: string): { valor: string; reconhecido: boolean } {
  const k = chave(valor);
  if (!k) return { valor: "", reconhecido: false };
  const encontrado = ALIASES_DEPARTAMENTO[k];
  return encontrado ? { valor: encontrado, reconhecido: true } : { valor: valor.trim(), reconhecido: false };
}

export function derivarDeDepartamento(departamento: string): { generoAlvo: string; faixaEtaria: string } {
  const info = DEPARTAMENTOS.find((d) => d.valor === departamento);
  return { generoAlvo: info?.generoAlvo ?? "", faixaEtaria: info?.faixaEtaria ?? "" };
}

export interface TipoProdutoInfo {
  valor: string;
  rotulo: string;
  aliases: string[];
  palavrasChave: string[];
}

/**
 * Vocabulário inicial para organizar lotes de vestuário. A classificação é
 * propositalmente conservadora: quando não há correspondência clara, o valor
 * fica pendente para revisão em vez de o sistema adivinhar.
 */
export const TIPOS_PRODUTO: TipoProdutoInfo[] = [
  {
    valor: "Shirt",
    rotulo: "Camiseta / camisa (Shirt)",
    aliases: ["shirt", "shirts", "camiseta", "camisa", "t-shirt", "tshirt", "polo", "regata"],
    palavrasChave: ["camiseta", "camisa", "t-shirt", "tshirt", "polo", "regata"],
  },
  {
    valor: "Pants",
    rotulo: "Calça (Pants)",
    aliases: ["pants", "pant", "trousers", "calca", "calcas", "jeans"],
    palavrasChave: ["calca", "calcas", "jeans", "trousers"],
  },
  {
    valor: "Dress",
    rotulo: "Vestido (Dress)",
    aliases: ["dress", "dresses", "vestido", "vestidos"],
    palavrasChave: ["vestido", "vestidos", "dress"],
  },
  {
    valor: "Jacket",
    rotulo: "Jaqueta / casaco (Jacket)",
    aliases: ["jacket", "jackets", "jaqueta", "jaquetas", "casaco", "casacos", "blazer"],
    palavrasChave: ["jaqueta", "jaquetas", "casaco", "casacos", "blazer", "jacket"],
  },
  {
    valor: "Shorts",
    rotulo: "Short / bermuda (Shorts)",
    aliases: ["short", "shorts", "bermuda", "bermudas"],
    palavrasChave: ["short", "shorts", "bermuda", "bermudas"],
  },
  {
    valor: "Skirt",
    rotulo: "Saia (Skirt)",
    aliases: ["skirt", "skirts", "saia", "saias"],
    palavrasChave: ["saia", "saias", "skirt"],
  },
  {
    valor: "Sweater",
    rotulo: "Suéter / tricô (Sweater)",
    aliases: ["sweater", "sweaters", "sueter", "tricô", "trico", "pulover", "pullover"],
    palavrasChave: ["sueter", "trico", "pulover", "pullover", "sweater"],
  },
  {
    valor: "Sweatshirt",
    rotulo: "Moletom (Sweatshirt)",
    aliases: ["sweatshirt", "sweatshirts", "moletom", "moletons"],
    palavrasChave: ["moletom", "moletons", "sweatshirt"],
  },
];

const TIPO_POR_ALIAS = new Map(
  TIPOS_PRODUTO.flatMap((tipo) => [tipo.valor, ...tipo.aliases].map((alias) => [chave(alias), tipo.valor] as const))
);

export function normalizarTipoProduto(valor: string): { valor: string; reconhecido: boolean } {
  const k = chave(valor);
  if (!k) return { valor: "", reconhecido: false };
  const encontrado = TIPO_POR_ALIAS.get(k);
  return encontrado ? { valor: encontrado, reconhecido: true } : { valor: valor.trim(), reconhecido: false };
}

function contemTermo(texto: string, termo: string): boolean {
  const alvo = ` ${chave(texto).replace(/[^a-z0-9]+/g, " ")} `;
  const procurado = ` ${chave(termo).replace(/[^a-z0-9]+/g, " ")} `;
  return alvo.includes(procurado);
}

export function detectarTipoProduto(...textos: string[]): string {
  const combinados = textos.filter(Boolean).join(" ");
  if (!combinados.trim()) return "";
  const encontrados = TIPOS_PRODUTO.filter((tipo) =>
    tipo.palavrasChave.some((palavra) => contemTermo(combinados, palavra))
  );
  return encontrados.length === 1 ? encontrados[0].valor : "";
}

export const CORES_CANONICAS: string[] = Array.from(new Set(Object.values(CORES))).sort();
export const TAMANHOS_CANONICOS: string[] = Array.from(new Set(Object.values(TAMANHOS))).sort();

export function normalizarCor(corBruta: string): { valor: string; reconhecida: boolean } {
  const k = chave(corBruta);
  if (!k) return { valor: "", reconhecida: false };
  const encontrada = CORES[k];
  if (encontrada) return { valor: encontrada, reconhecida: true };
  return { valor: tituloComercial(corBruta), reconhecida: false };
}

export function normalizarTamanho(tamanhoBruto: string): { valor: string; reconhecida: boolean } {
  const k = chave(tamanhoBruto);
  if (!k) return { valor: "", reconhecida: false };
  const encontrada = TAMANHOS[k];
  if (encontrada) return { valor: encontrada, reconhecida: true };
  // numeric sizes (ex: 38, 40, 42) pass through unchanged — already an Amazon-friendly format
  if (/^\d+([.,]\d+)?$/.test(k) && Number(k.replace(",", ".")) > 0) return { valor: tamanhoBruto.trim(), reconhecida: true };
  return { valor: tamanhoBruto.trim(), reconhecida: false };
}

const PALAVRAS_MINUSCULAS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "com",
  "para",
  "em",
  "a",
  "o",
]);

export function tituloComercial(texto: string): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return "";
  return limpo
    .split(" ")
    .map((palavra, i) => {
      const lower = palavra.toLowerCase();
      if (i > 0 && PALAVRAS_MINUSCULAS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
