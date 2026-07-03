import { fetch } from 'wix-fetch';
import wixLocation from 'wix-location';

const API_BASE = 'https://sambah.onrender.com';
let produtos = [];
let whatsappUrlAtual = '';

$w.onReady(function () {
  prepararTela();
  carregarCardapio();

  $w('#enviarPedidoButton').onClick(enviarPedido);
  $w('#abrirWhatsAppButton').onClick(() => {
    if (whatsappUrlAtual) {
      wixLocation.to(whatsappUrlAtual);
    }
  });
});

function prepararTela() {
  whatsappUrlAtual = '';
  $w('#abrirWhatsAppButton').disable();
  $w('#resultadoText').text = 'Carregando cardápio do SamBah...';

  $w('#formaEntregaDropdown').options = [
    { label: 'Retirada', value: 'retirada' },
    { label: 'Delivery', value: 'delivery' },
    { label: 'Estou no local', value: 'mesa' },
    { label: 'Evento / grande pedido', value: 'evento' }
  ];

  $w('#formaPagamentoDropdown').options = [
    { label: 'Pix', value: 'pix' },
    { label: 'Cartão', value: 'cartao' },
    { label: 'Dinheiro', value: 'dinheiro' },
    { label: 'Combinar', value: 'combinar' }
  ];
}

async function carregarCardapio() {
  try {
    const response = await fetch(`${API_BASE}/api/site/cardapio`, { method: 'get' });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Não foi possível carregar o cardápio.');
    }

    produtos = (data.produtos || []).filter((produto) => produto.ativo);
    $w('#produtoDropdown').options = produtos.map((produto) => ({
      label: `${produto.nome} - ${produto.categoria}`,
      value: produto.id
    }));

    $w('#resultadoText').text = 'Cardápio carregado. Escolha seu produto e envie o pedido.';
  } catch (error) {
    $w('#resultadoText').text = `Erro ao carregar cardápio: ${error.message}`;
  }
}

async function enviarPedido() {
  whatsappUrlAtual = '';
  $w('#abrirWhatsAppButton').disable();

  const nome = String($w('#nomeInput').value || '').trim();
  const telefone = String($w('#telefoneInput').value || '').trim();
  const produto = produtos.find((item) => item.id === $w('#produtoDropdown').value);
  const quantidade = Number($w('#quantidadeInput').value || 0);
  const observacaoItem = String($w('#observacaoItemInput').value || '').trim();
  const formaEntrega = $w('#formaEntregaDropdown').value || 'retirada';
  const endereco = String($w('#enderecoInput').value || '').trim();
  const formaPagamento = $w('#formaPagamentoDropdown').value || 'combinar';
  const observacoes = String($w('#observacoesInput').value || '').trim();

  const erro = validarPedido({ nome, telefone, produto, quantidade });
  if (erro) {
    $w('#resultadoText').text = erro;
    return;
  }

  const payload = {
    nome,
    telefone,
    origem: 'site-insano-wix',
    tipo: 'pedido',
    itens: [{
      nome: produto.nome,
      quantidade,
      preco: produto.preco,
      observacao: observacaoItem
    }],
    formaEntrega,
    endereco,
    formaPagamento,
    observacoes,
    totalEstimado: produto.preco ? produto.preco * quantidade : null
  };

  $w('#resultadoText').text = 'Enviando pedido para o SamBah...';

  try {
    const response = await fetch(`${API_BASE}/api/site/pedido`, {
      method: 'post',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Não foi possível enviar o pedido.');
    }

    let mensagem = `Pedido recebido pelo SamBah.\nPedido ID: ${data.pedidoId}\nStatus: ${data.status}`;
    if (data.whatsappMessage) {
      mensagem += `\n\n${data.whatsappMessage}`;
    }

    if (data.whatsappUrl) {
      whatsappUrlAtual = data.whatsappUrl;
      $w('#abrirWhatsAppButton').enable();
      mensagem += '\n\nClique em Abrir WhatsApp para continuar o atendimento.';
    } else {
      mensagem += '\n\nPedido recebido. Configure INSANO_WHATSAPP_NUMBER no Render para liberar o botão de WhatsApp.';
    }

    $w('#resultadoText').text = mensagem;
  } catch (error) {
    $w('#resultadoText').text = `Erro no pedido: ${error.message}`;
  }
}

function validarPedido({ nome, telefone, produto, quantidade }) {
  if (!nome) return 'Informe seu nome.';
  if (!telefone) return 'Informe seu telefone.';
  if (!produto) return 'Escolha um produto.';
  if (!Number.isFinite(quantidade) || quantidade < 1) return 'Informe quantidade mínima 1.';
  return '';
}

