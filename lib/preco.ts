export function parsePreco(bruto: string): number | null {
  const preparado = bruto.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!preparado || /[^\d.,]/.test(preparado)) return null;
  const limpo = preparado;
  if (!limpo || !/^\d[\d.,]*$/.test(limpo)) return null;

  const virgulas = (limpo.match(/,/g) ?? []).length;
  const pontos = (limpo.match(/\./g) ?? []).length;
  let normalizado = limpo;

  if (virgulas > 0 && pontos > 0) {
    const decimal = limpo.lastIndexOf(",") > limpo.lastIndexOf(".") ? "," : ".";
    const milhar = decimal === "," ? "." : ",";
    const partes = limpo.split(decimal);
    if (partes.length !== 2 || !/^\d{1,2}$/.test(partes[1])) return null;
    const gruposInteiros = partes[0].split(milhar);
    if (
      gruposInteiros.length < 2 ||
      !/^\d{1,3}$/.test(gruposInteiros[0]) ||
      gruposInteiros.slice(1).some((p) => !/^\d{3}$/.test(p))
    ) {
      return null;
    }
    normalizado = `${gruposInteiros.join("")}.${partes[1]}`;
  } else if (virgulas > 0 || pontos > 0) {
    const separador = virgulas > 0 ? "," : ".";
    const partes = limpo.split(separador);
    if (partes.some((p) => !/^\d+$/.test(p))) return null;

    if (partes.length === 2 && partes[1].length <= 2) {
      normalizado = `${partes[0]}.${partes[1]}`;
    } else if (/^\d{1,3}$/.test(partes[0]) && partes.slice(1).every((p) => /^\d{3}$/.test(p))) {
      normalizado = partes.join("");
    } else if (
      partes.length > 2 &&
      /^\d{1,3}$/.test(partes[0]) &&
      partes.slice(1, -1).every((p) => /^\d{3}$/.test(p)) &&
      /^\d{1,2}$/.test(partes.at(-1)!)
    ) {
      normalizado = `${partes.slice(0, -1).join("")}.${partes.at(-1)}`;
    } else {
      return null;
    }
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return valor;
}

export function formatarPreco(valor: number): string {
  return valor.toFixed(2);
}
