import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analisarCsvEntrada, decodificarCsvUtf8, ErroCodificacaoCsv, gerarArquivosAmazonPorTipo, gerarCsvSaida } from "../lib/csv";
import { detectarTipoProduto, normalizarCor, normalizarTamanho } from "../lib/dictionaries";
import { atualizarValidacaoImagemOpcional, editarCampoFilho, editarClassificacaoGrupo, finalizarLinhas, prepararLinhasExportacao, processarLinhas, renomearGrupo } from "../lib/group";
import { validarGtin } from "../lib/gtin";
import { parsePreco } from "../lib/preco";
import { gerarRascunhoMercadoLivre } from "../lib/platforms/mercado-livre";
import { BatchSettings, InputRow, statusDaLinha } from "../lib/types";
import { criarZip } from "../lib/zip";
import { resumirValidacao } from "../lib/validation-summary";
import { verificarConfiguracao } from "../lib/configuracao";

const config: BatchSettings = {
  plataforma: "amazon",
  marca: "ByteLab",
  departamento: "mens",
  tipoProduto: "Shirt",
  quantidadePadrao: 10,
  generoAlvo: "male",
  faixaEtaria: "Adult",
  sistemaTamanho: "BR",
  semGtinComIsencao: true,
  mlCategoriaId: "",
  mlCondicao: "new",
  mlTipoAnuncio: "gold_special",
};

function entrada(parcial: Partial<InputRow> = {}): InputRow {
  return {
    linha: 2,
    sku: "CAM-001-P",
    nome: "Camiseta Básica",
    grupo: "",
    tipoProduto: "",
    departamento: "",
    preco: "R$ 49,90",
    cor: "preto",
    tamanho: "P",
    imagemUrl: "https://example.com/camiseta.jpg",
    gtin: "",
    ...parcial,
  };
}

test("interpreta preços brasileiros e internacionais sem aceitar conteúdo parcial", () => {
  assert.equal(parsePreco("R$ 1.234,56"), 1234.56);
  assert.equal(parsePreco("1,234.56"), 1234.56);
  assert.equal(parsePreco("1.234"), 1234);
  assert.equal(parsePreco("49,9"), 49.9);
  assert.equal(parsePreco("12,34,56"), null);
  assert.equal(parsePreco("-10"), null);
  assert.equal(parsePreco("abc10"), null);
});

test("normaliza cores e tamanhos do catálogo", () => {
  assert.deepEqual(normalizarCor("  AZUL MARINHO "), { valor: "Navy", reconhecida: true });
  assert.deepEqual(normalizarTamanho("Único"), { valor: "One Size", reconhecida: true });
  assert.deepEqual(normalizarTamanho("42"), { valor: "42", reconhecida: true });
});

test("detecta tipos comuns sem confundir famílias diferentes", () => {
  assert.equal(detectarTipoProduto("Camiseta básica de algodão"), "Shirt");
  assert.equal(detectarTipoProduto("Calça jeans slim"), "Pants");
  assert.equal(detectarTipoProduto("Vestido longo estampado"), "Dress");
  assert.equal(detectarTipoProduto("Produto especial sem categoria"), "");
});

test("valida GTIN e identifica o tipo", () => {
  assert.deepEqual(validarGtin("4006381333931"), { valor: "4006381333931", valido: true, tipo: "EAN" });
  assert.equal(validarGtin("4006381333932").valido, false);
  assert.equal(validarGtin("ABC").valido, false);
});

test("usa a coluna opcional grupo para reunir nomes ligeiramente diferentes", () => {
  const resultado = processarLinhas(
    [
      entrada({ grupo: "CAM-001", nome: "Camiseta Básica", linha: 2 }),
      entrada({ grupo: "CAM-001", nome: "Camiseta Basica Algodão", sku: "CAM-001-M", tamanho: "M", linha: 3 }),
    ],
    config
  );
  assert.equal(resultado.totalGrupos, 1);
  assert.equal(resultado.totalFilhos, 2);
  assert.ok(resultado.linhas.filter((linha) => linha.tipo === "child").every((linha) => statusDaLinha(linha) === "aviso"));
});

test("bloqueia SKU e combinação de variação duplicados", () => {
  const resultado = processarLinhas(
    [entrada({ linha: 2 }), entrada({ linha: 3 })],
    config
  );
  const filhos = resultado.linhas.filter((linha) => linha.tipo === "child");
  assert.ok(filhos.every((linha) => statusDaLinha(linha) === "bloqueado"));
  assert.ok(filhos.every((linha) => linha.issues.some((issue) => issue.codigo === "variacao_duplicada")));
});

test("detecta estrutura CSV malformada e reconhece a coluna grupo", () => {
  const csv = [
    "sku,nome,grupo,preco,cor,tamanho,url da imagem",
    "A,Camiseta,CAM-1,49.90,preto,P,https://example.com/a.jpg,extra",
  ].join("\n");
  const resultado = analisarCsvEntrada(csv);
  assert.equal(resultado.linhas[0].grupo, "CAM-1");
  assert.ok(resultado.errosEstrutura.length > 0);
});

test("lê tipo de produto e departamento opcionais da planilha", () => {
  const csv = [
    "sku,nome,grupo,tipo_produto,departamento,preco,cor,tamanho,url da imagem",
    "A,Camiseta,CAM-1,camiseta,masculino,49.90,preto,P,https://example.com/a.jpg",
  ].join("\n");
  const resultado = analisarCsvEntrada(csv);
  assert.equal(resultado.colunasFaltantes.length, 0);
  assert.equal(resultado.linhas[0].tipoProduto, "camiseta");
  assert.equal(resultado.linhas[0].departamento, "masculino");
});

test("processa vários tipos no mesmo CSV e separa a exportação Amazon", () => {
  const configSemTipo: BatchSettings = { ...config, tipoProduto: "" };
  const resultado = processarLinhas(
    [
      entrada({ linha: 2, grupo: "CAM", nome: "Camiseta Básica", sku: "CAM-P" }),
      entrada({ linha: 3, grupo: "CAL", nome: "Calça Jeans", sku: "CAL-38", tamanho: "38" }),
      entrada({ linha: 4, grupo: "VES", nome: "Vestido Longo", sku: "VES-U", tamanho: "Único" }),
    ],
    configSemTipo
  );
  const pais = resultado.linhas.filter((linha) => linha.tipo === "parent");
  assert.deepEqual(pais.map((pai) => pai.tipoProduto), ["Shirt", "Pants", "Dress"]);
  assert.ok(resultado.linhas.filter((linha) => linha.tipo === "child").every((linha) =>
    linha.issues.some((issue) => issue.codigo === "tipo_produto_detectado")
  ));
  const arquivos = gerarArquivosAmazonPorTipo(resultado.linhas);
  assert.deepEqual(arquivos.map((arquivo) => arquivo.nomeSeguro), ["shirt", "pants", "dress"]);
  assert.ok(arquivos.every((arquivo) => arquivo.totalVariacoes === 1));
});

test("permite confirmar a classificação detectada de uma família", () => {
  const resultado = processarLinhas([entrada()], { ...config, tipoProduto: "" });
  const pai = resultado.linhas.find((linha) => linha.tipo === "parent")!;
  const atualizadas = editarClassificacaoGrupo(resultado.linhas, pai.sku, "tipoProduto", pai.tipoProduto, config);
  const filho = atualizadas.find((linha) => linha.tipo === "child")!;
  assert.equal(filho.tipoProduto, "Shirt");
  assert.equal(filho.tipoProdutoOrigem, "manual");
  assert.equal(filho.tipoProdutoConfirmado, true);
  assert.equal(filho.issues.some((issue) => issue.codigo === "tipo_produto_detectado"), false);
});

test("bloqueia tipos conflitantes dentro da mesma família", () => {
  const resultado = processarLinhas(
    [
      entrada({ linha: 2, grupo: "MISTO", tipoProduto: "Shirt" }),
      entrada({ linha: 3, grupo: "MISTO", sku: "B", tamanho: "M", tipoProduto: "Pants" }),
    ],
    config
  );
  assert.ok(resultado.linhas.filter((linha) => linha.tipo === "child").every((linha) => statusDaLinha(linha) === "bloqueado"));
});

test("exporta cada pai antes de seus filhos e protege fórmulas de planilha", () => {
  const resultado = processarLinhas([entrada({ sku: "=RISCO" })], config);
  const csv = gerarCsvSaida(resultado.linhas);
  const indicePai = csv.indexOf("parent");
  const indiceFilho = csv.indexOf("child");
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(indicePai >= 0 && indiceFilho > indicePai);
  assert.match(csv, /'=RISCO/);
});

test("gera Mercado Livre somente como rascunho identificado", () => {
  const configMl: BatchSettings = {
    ...config,
    plataforma: "mercado_livre",
    mlCategoriaId: "MLB1234",
  };
  const resultado = processarLinhas([entrada()], configMl);
  const rascunho = JSON.parse(gerarRascunhoMercadoLivre(resultado.linhas, configMl));
  assert.equal(rascunho.status, "draft_not_validated");
  assert.match(rascunho.disclaimer, /não validado/i);
  assert.equal(rascunho.items[0].category_id, "MLB1234");
});

test("gera um ZIP único para lotes com vários tipos", async () => {
  const zip = criarZip([
    { nome: "catalogo-shirt.csv", conteudo: "sku,item_name\nA,Camiseta" },
    { nome: "catalogo-pants.csv", conteudo: "sku,item_name\nB,Calca" },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(zip.type, "application/zip");
});

test("planilha válida: zero erros, estoque individual normalizado e saída com valores reais", () => {
  const csv = "SKU,Nome,Preço,Cor,Tamanho,Url da Imagem,Estoque,Tipo de Produto\nCAM1,Camiseta Lisa,49.90,preto,P,https://example.com/a.jpg,3,camiseta\nCAM2,Camiseta Lisa,59.90,branco,M,https://example.com/b.jpg,0,camiseta";
  const parse = analisarCsvEntrada(csv);
  const processadas = processarLinhas(parse.linhas, config).linhas;
  const resumo = resumirValidacao(processadas);
  assert.deepEqual([resumo.skusLidos, resumo.alertas, resumo.errosCriticos], [2, 0, 0]);
  assert.deepEqual(processadas.filter((linha) => linha.tipo === "child").map((linha) => linha.quantidade), ["3", "0"]);
  const saida = gerarCsvSaida(prepararLinhasExportacao(processadas));
  assert.match(saida, /CAM1/);
  assert.match(saida, /CAM2/);
  assert.match(saida, /49\.90/);
});

test("SKU duplicado: duas linhas originais, duas ocorrências críticas, ambas fora da exportação", () => {
  const csv = "sku,nome,preco,cor,tamanho,imagem\nDUP,Camiseta Lisa,49,preto,P,https://example.com/a.jpg\nDUP,Camiseta Lisa,49,preto,M,https://example.com/b.jpg\nOK,Camiseta Lisa,49,branco,G,https://example.com/c.jpg";
  const saida = processarLinhas(analisarCsvEntrada(csv).linhas, config).linhas;
  const resumo = resumirValidacao(saida);
  const duplicados = resumo.categorias.find((categoria) => categoria.rotulo === "SKU duplicado")!;
  assert.equal(duplicados.problemas.length, 2);
  assert.deepEqual(duplicados.problemas.map((item) => item.linhaOrigem), [2, 3]);
  assert.equal(resumo.errosCriticos, 2);
  assert.deepEqual(prepararLinhasExportacao(saida).filter((linha) => linha.tipo === "child").map((linha) => linha.sku), ["OK"]);
  const duplicadoDaLinha3 = saida.find((linha) => linha.tipo === "child" && linha.linhaOrigem === 3)!;
  const aposCorrecao = finalizarLinhas(saida.map((linha) =>
    linha.id === duplicadoDaLinha3.id ? editarCampoFilho(linha, "sku", "OUTRO", config) : linha
  )).linhas;
  assert.equal(resumirValidacao(aposCorrecao).errosCriticos, 0);
  assert.equal(prepararLinhasExportacao(aposCorrecao).filter((linha) => linha.tipo === "child").length, 3);
});

test("campos vazios e até coluna ausente seguem para validação sem derrubar o lote", () => {
  const csv = "sku,nome,preco,cor,url da imagem\n,Camiseta Lisa,49,,https://example.com/a.jpg\nB,,49,preto,https://example.com/b.jpg";
  const parse = analisarCsvEntrada(csv);
  assert.deepEqual(parse.colunasFaltantes, ["Tamanho"]);
  assert.equal(parse.linhas.length, 2);
  const saida = processarLinhas(parse.linhas, config).linhas;
  const resumo = resumirValidacao(saida);
  assert.equal(resumo.skusLidos, 2);
  assert.equal(resumo.categorias.find((categoria) => categoria.rotulo === "SKU vazio")?.problemas[0].linhaOrigem, 2);
  assert.equal(resumo.categorias.find((categoria) => categoria.rotulo === "Campo obrigatório: produto")?.problemas[0].linhaOrigem, 3);
  assert.equal(resumo.categorias.find((categoria) => categoria.rotulo === "Campo obrigatório: tamanho")?.problemas.length, 2);
  const semNome = saida.find((linha) => linha.tipo === "child" && linha.sku === "B")!;
  const aposEdicao = editarCampoFilho(semNome, "sku", "B2", config);
  assert.ok(aposEdicao.issues.some((issue) => issue.codigo === "nome_ausente"));
  const corrigidas = finalizarLinhas(renomearGrupo(saida, semNome.skuPai, "Camiseta Lisa")).linhas;
  assert.equal(corrigidas.find((linha) => linha.id === semNome.id)?.issues.some((issue) => issue.codigo === "nome_ausente"), false);
});

test("valores inválidos: preço, estoque, tamanho e GTIN bloqueiam; imagem inválida apenas alerta", () => {
  const csv = "SKU,Nome,Preco,Cor,Tamanho,Imagem,Quantidade,GTIN\nA,Camiseta Lisa,-10,verde,0,sem-endereco,dez,123";
  const saida = processarLinhas(analisarCsvEntrada(csv).linhas, config).linhas;
  const resumo = resumirValidacao(saida);
  const encontrados = resumo.categorias.flatMap((categoria) => categoria.problemas);
  for (const [campo, valor] of [["preco", "-10"], ["quantidade", "dez"], ["tamanho", "0"], ["gtin", "123"]]) {
    const problema = encontrados.find((item) => item.campo === campo);
    assert.equal(problema?.valorEncontrado, valor, campo);
    assert.equal(problema?.issue.severidade, "erro");
  }
  assert.equal(encontrados.find((item) => item.campo === "imagemUrl")?.valorEncontrado, "sem-endereco");
  assert.equal(encontrados.find((item) => item.campo === "imagemUrl")?.issue.severidade, "aviso");
  assert.equal(prepararLinhasExportacao(saida).length, 0);
});

test("A — CSV com imagem preenchida preserva URL sem bloquear a exportação", () => {
  const csv = 'sku,nome,preco,cor,tamanho,url da imagem,tipo_produto\nA,Camiseta Básica,"R$ 49,90",preto,P,https://example.com/a.jpg,camiseta';
  const parse = analisarCsvEntrada(csv);
  assert.deepEqual(parse.errosEstrutura, []);
  assert.deepEqual(parse.colunasFaltantes, []);
  const processadas = processarLinhas(parse.linhas, config).linhas;
  assert.equal(resumirValidacao(processadas).errosCriticos, 0);
  assert.equal(processadas.find((linha) => linha.tipo === "child")?.imagemUrl, "https://example.com/a.jpg");
  assert.match(gerarCsvSaida(prepararLinhasExportacao(processadas)), /https:\/\/example.com\/a.jpg/);
});

test("B — coluna de imagem presente e células vazias não geram problemas de imagem", () => {
  const csv = 'sku,nome,preco,cor,tamanho,url da imagem,tipo_produto\nA,Camiseta Básica,"R$ 49,90",preto,P,,camiseta\nB,Camiseta Básica,"R$ 59,90",branco,M,,camiseta';
  const processadas = processarLinhas(analisarCsvEntrada(csv).linhas, config).linhas;
  const resumo = resumirValidacao(processadas);
  assert.deepEqual([resumo.skusLidos, resumo.errosCriticos, resumo.alertas], [2, 0, 0]);
  assert.equal(prepararLinhasExportacao(processadas).filter((linha) => linha.tipo === "child").length, 2);
  assert.ok(processadas.filter((linha) => linha.tipo === "child").every((linha) => linha.imagemUrl === ""));
});

test("C — arquivo sem coluna de imagem continua até exportação com campo em branco", () => {
  const csv = 'sku,nome,preco,cor,tamanho,tipo_produto\nA,Camiseta Básica,"R$ 49,90",preto,P,camiseta';
  const parse = analisarCsvEntrada(csv);
  assert.deepEqual(parse.colunasFaltantes, []);
  assert.equal(parse.linhas[0].imagemUrl, "");
  const processadas = processarLinhas(parse.linhas, config).linhas;
  assert.equal(resumirValidacao(processadas).errosCriticos, 0);
  assert.ok(gerarCsvSaida(prepararLinhasExportacao(processadas)).includes("main_image_url"));
  assert.ok(!processadas.some((linha) => linha.issues.some((issue) => issue.campo === "imagemUrl")));
});

test("D — UTF-8 válido mantém todos os acentos e símbolos; byte realmente inválido é diagnosticado", () => {
  const csv = 'sku,nome,preço,cor,tamanho,tipo_produto\nA,"Camisa á à ã â é ê í ó ô õ ú ç — 10% / (promoção) - R$",49,preto,P,camiseta\nB,Peça � original,55,branco,M,camiseta';
  const texto = decodificarCsvUtf8(new TextEncoder().encode(csv));
  const parse = analisarCsvEntrada(texto);
  assert.deepEqual(parse.errosEstrutura, []);
  assert.equal(parse.linhas[0].nome, 'Camisa á à ã â é ê í ó ô õ ú ç — 10% / (promoção) - R$');
  assert.equal(parse.linhas[1].nome, "Peça � original");
  assert.equal(resumirValidacao(processarLinhas(parse.linhas, config).linhas).errosCriticos, 0);
  assert.throws(() => decodificarCsvUtf8(new Uint8Array([0x73, 0x6b, 0x75, 0x2c, 0xe9])), ErroCodificacaoCsv);
});

test('E — preço "R$ 49,90" entre aspas é uma única coluna e vira 49.90', () => {
  const csv = 'sku,nome,preço,cor,tamanho,tipo_produto\nA,Camiseta Básica,"R$ 49,90",preto,P,camiseta';
  const parse = analisarCsvEntrada(decodificarCsvUtf8(new TextEncoder().encode(csv)));
  assert.equal(parse.errosEstrutura.length, 0);
  assert.equal(parse.linhas[0].preco, "R$ 49,90");
  assert.equal(parse.linhas[0].cor, "preto");
  assert.equal(processarLinhas(parse.linhas, config).linhas.find((linha) => linha.tipo === "child")?.preco, "49.90");
});

test("F — SKU repetido não impede leitura; as linhas aparecem na validação e são excluídas da exportação", () => {
  const csv = 'sku,nome,preco,cor,tamanho,tipo_produto\nREP,Camiseta Básica,49,preto,P,camiseta\nREP,Camiseta Básica,59,branco,M,camiseta\nOK,Camiseta Básica,69,azul,G,camiseta';
  const parse = analisarCsvEntrada(csv);
  assert.deepEqual(parse.errosEstrutura, []);
  assert.equal(parse.linhas.length, 3);
  const processadas = processarLinhas(parse.linhas, config).linhas;
  assert.deepEqual(resumirValidacao(processadas).categorias.find((cat) => cat.rotulo === "SKU duplicado")?.problemas.map((p) => p.linhaOrigem), [2, 3]);
  assert.deepEqual(prepararLinhasExportacao(processadas).filter((linha) => linha.tipo === "child").map((linha) => linha.sku), ["OK"]);
});

test("falha estrutural permanece diferente de erro de produto", () => {
  const malformado = 'sku,nome,preco,cor,tamanho\nA,Camiseta Básica,49,preto,P,extra';
  assert.match(analisarCsvEntrada(malformado).errosEstrutura[0], /quantidade de colunas diferente/);
  const valorInvalido = 'sku,nome,preco,cor,tamanho\nA,Camiseta Básica,erro,preto,P';
  assert.equal(analisarCsvEntrada(valorInvalido).errosEstrutura.length, 0);
  assert.equal(resumirValidacao(processarLinhas(analisarCsvEntrada(valorInvalido).linhas, config).linhas).errosCriticos, 1);
});

test("imagem opcional em catálogo antigo remove bloqueio herdado sem apagar demais erros", () => {
  const processadas = processarLinhas([entrada({ imagemUrl: "", preco: "inválido" })], config).linhas;
  const antigo = processadas.map((linha) => linha.tipo === "child" ? {
    ...linha, issues: [...linha.issues, { campo: "imagemUrl", severidade: "erro" as const, mensagem: "URL da imagem ausente.", codigo: "imagem_ausente" }],
  } : linha);
  const atualizado = atualizarValidacaoImagemOpcional(antigo);
  assert.equal(resumirValidacao(atualizado).errosCriticos, 1);
  assert.equal(atualizado.some((linha) => linha.issues.some((issue) => issue.campo === "imagemUrl")), false);
});

test("asteriscos da configuração refletem exigência de estoque e não bloqueiam departamento opcional", () => {
  const semEstoque = entrada({ imagemUrl: "", quantidade: undefined, departamento: "" });
  assert.deepEqual(verificarConfiguracao([semEstoque], { ...config, departamento: "" }), { precisaQuantidadePadrao: true, podeContinuar: true });
  assert.equal(verificarConfiguracao([semEstoque], { ...config, marca: "" }).podeContinuar, false);
  assert.equal(verificarConfiguracao([semEstoque], { ...config, quantidadePadrao: -1 }).podeContinuar, false);
  assert.deepEqual(verificarConfiguracao([entrada({ quantidade: "5" })], config), { precisaQuantidadePadrao: false, podeContinuar: true });
  assert.equal(verificarConfiguracao([semEstoque], { ...config, plataforma: "mercado_livre", mlCategoriaId: "" }).podeContinuar, false);
});

test("estrutura diferente e linhas vazias: cabeçalhos mapeados e linhas físicas corretas", () => {
  const csv = "Seller_SKU;Título do Produto;Valor de Venda;Color_Name;Size_Name;Main_Image_URL;Available_Quantity\n\nALT1;Camiseta Lisa;R$ 49,90;preto;P;https://example.com/a.jpg;7\nALT2;Camiseta Lisa;49.90;branco;M;https://example.com/b.jpg;";
  const parse = analisarCsvEntrada(csv);
  assert.equal(parse.errosEstrutura.length, 0);
  assert.deepEqual(parse.linhas.map((linha) => linha.linha), [3, 4]);
  assert.equal(parse.linhas[0].sku, "ALT1");
  assert.equal(parse.linhas[0].quantidade, "7");
  assert.equal(parse.linhas[1].quantidade, "");
  const resumo = resumirValidacao(processarLinhas(parse.linhas, config).linhas);
  assert.equal(resumo.categorias.find((categoria) => categoria.rotulo === "Estoque inválido")?.problemas[0].linhaOrigem, 4);
  assert.equal(resumo.errosCriticos, 1);
});

test("tamanho desconhecido gera alerta real e pode ser corrigido sem perder preço original", () => {
  const original = processarLinhas([entrada({ tamanho: "Grande GG X", preco: "R$ 49,90" })], config).linhas;
  const filho = original.find((linha) => linha.tipo === "child")!;
  const problema = resumirValidacao(original).categorias.find((categoria) => categoria.rotulo === "Tamanho não reconhecido")!;
  assert.equal(problema.problemas[0].valorEncontrado, "Grande GG X");
  assert.equal(problema.problemas[0].issue.severidade, "aviso");
  const corrigido = editarCampoFilho(filho, "tamanho", "GG", config);
  assert.equal(corrigido.tamanho, "XL");
  assert.equal(corrigido.preco, "49.90");
  assert.equal(corrigido.issues.some((issue) => issue.campo === "tamanho"), false);
});

test("CSV de exemplo do produto: lê todas as variações e separa tipos detectados por família", () => {
  const csv = readFileSync("public/exemplo-produtos.csv", "utf8");
  const parse = analisarCsvEntrada(csv);
  assert.equal(parse.linhas.length, 9);
  assert.equal(parse.errosEstrutura.length, 0);
  const saida = processarLinhas(parse.linhas, { ...config, tipoProduto: "" }).linhas;
  const resumo = resumirValidacao(saida);
  assert.equal(resumo.skusLidos, 9);
  assert.equal(resumo.errosCriticos, 0);
  assert.deepEqual(gerarArquivosAmazonPorTipo(prepararLinhasExportacao(saida)).map((arquivo) => arquivo.totalVariacoes), [5, 3, 1]);
});

test("CSV originalmente enviado pelo usuário sem tipo/grupo: processa 9 SKUs em 3 famílias e exporta 3 tipos", () => {
  const csv = readFileSync("tests/fixtures/entrada-original-usuario.csv", "utf8");
  const parse = analisarCsvEntrada(csv);
  assert.equal(parse.linhas.length, 9);
  assert.equal(parse.colunasFaltantes.length, 0);
  const resultado = processarLinhas(parse.linhas, { ...config, tipoProduto: "" });
  assert.equal(resultado.totalGrupos, 3);
  assert.equal(resultado.totalFilhos, 9);
  const resumo = resumirValidacao(resultado.linhas);
  assert.equal(resumo.errosCriticos, 0);
  assert.equal(resumo.alertas, 9); // Detecção de tipo exige uma confirmação por variação.
  assert.deepEqual(gerarArquivosAmazonPorTipo(prepararLinhasExportacao(resultado.linhas)).map((a) => a.totalVariacoes), [5, 3, 1]);
});
