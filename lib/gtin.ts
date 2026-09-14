export type TipoGtin = "EAN" | "UPC" | "GTIN";

export interface ResultadoGtin {
  valor: string;
  valido: boolean;
  tipo: TipoGtin | "";
  mensagem?: string;
}

export function normalizarGtin(valor: string): string {
  return valor.replace(/[\s.-]/g, "");
}

export function detectarTipoGtin(valor: string): TipoGtin | "" {
  if (valor.length === 8 || valor.length === 13) return "EAN";
  if (valor.length === 12) return "UPC";
  if (valor.length === 14) return "GTIN";
  return "";
}

export function validarGtin(valorBruto: string): ResultadoGtin {
  const valor = normalizarGtin(valorBruto.trim());
  if (!valor) return { valor: "", valido: false, tipo: "" };
  if (!/^\d+$/.test(valor)) {
    return { valor, valido: false, tipo: "", mensagem: "O GTIN deve conter somente números." };
  }

  const tipo = detectarTipoGtin(valor);
  if (!tipo) {
    return {
      valor,
      valido: false,
      tipo: "",
      mensagem: "O GTIN deve ter 8, 12, 13 ou 14 dígitos.",
    };
  }

  const digitos = valor.split("").map(Number);
  const informado = digitos.pop()!;
  let soma = 0;
  for (let i = digitos.length - 1, posicao = 0; i >= 0; i--, posicao++) {
    soma += digitos[i] * (posicao % 2 === 0 ? 3 : 1);
  }
  const esperado = (10 - (soma % 10)) % 10;

  if (informado !== esperado) {
    return { valor, valido: false, tipo, mensagem: "O dígito verificador do GTIN é inválido." };
  }

  return { valor, valido: true, tipo };
}
