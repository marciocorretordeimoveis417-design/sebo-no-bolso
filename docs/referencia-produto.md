# Referência do produto — Sebo

Texto guardado em 21 de outubro de 2026 como referência do que foi planejado. A conferência com o código deste repositório está no final.

## O que já temos pronto (ativos do SaaS)

O sistema conta com um ecossistema completo de produção escalável:

1. Interface Mobile-First unificada: layout responsivo profissional com barra de navegação inferior persistente, estilo aplicativo nativo, nas 3 telas centrais (Dashboard, Cadastro e Detalhes).
2. Motor de visão computacional custo zero: integração com o Google Gemini 2.5 Flash que processa a foto da capa e o OCR da página de créditos em paralelo, extraindo automaticamente Título, Autor, Editora, Ano e ISBN sem gerar faturas de API.
3. Sistema de compactação inteligente: otimização de imagens no frontend que reduz arquivos pesados da câmera antes do envio, eliminando quedas ou erros de sobrecarga (rate limit).
4. Banco de dados relacional seguro: tabelas de livros e perfis ativas no Supabase e protegidas por regras reais de Row Level Security (RLS), impedindo vazamento de dados entre sebos diferentes.
5. Persistência completa (CRUD): botões operacionais para cadastrar, editar dados e excluir/dar baixa em livros em tempo real.
6. Extração comercial (CSV): mecanismo de exportação de planilhas com tratamento de texto estruturado, impedindo que o Excel quebre ou desconfigure os 13 dígitos do ISBN.
7. Servidor em nuvem de alta disponibilidade: deploy concluído na Vercel com link público e certificado de segurança HTTPS ativo para uso imediato na rua ou no balcão.

## Fase 2 — distribuição e escala comercial

Com a operação interna de cadastro rápida e validada, a Fase 2 transforma o ganho de tempo em faturamento para o livreiro, automatizando a saída dos livros para os marketplaces.

### 2.1 Precificação automatizada e realista

Conectar uma API de busca (ecossistema de APIs abertas ou web scraping controlado) para que, além de preencher a ficha do livro, o Gemini compare os preços atuais do exemplar na Estante Virtual, Amazon e Mercado Livre, sugerindo na tela a margem ideal de lucro.

### 2.2 Integração omnichannel (cadastro único multi-lojas)

Em vez de o usuário baixar o CSV e subir manualmente, criar integrações via API (começando pelo Mercado Livre ou Shopee) para que, ao clicar em "Salvar livro" no celular, o anúncio seja criado de forma simultânea e automática nas lojas virtuais do cliente, com controle de estoque centralizado.

### 2.3 Monetização do SaaS

Conectar o gateway de pagamento do Stripe ou Asaas (Pix e cartão) diretamente ao fluxo do Supabase. Bloquear o uso após os primeiros 50 livros cadastrados, exigindo a assinatura do plano mensal (exemplo: R$ 79,00) para liberar o uso ilimitado.

## Conferência com o repositório (21/10/2026)

| Item | No código hoje |
| --- | --- |
| 1. Barra inferior nas três telas | Sim. Dashboard e cadastro usam o mesmo layout. Detalhes é um painel sobre o acervo, e a barra fica acessível por baixo dele no celular. |
| 2. Gemini 2.5 Flash, em paralelo, sem custo | Não. A leitura usa uma fila de modelos, começando por `gemini-3.5-flash-lite`. Capa e créditos vão no mesmo pedido, não em duas chamadas paralelas. A chave do Gemini é de API; o custo zero não está garantido no código. |
| 3. Compactação antes do envio à IA | Não. A redução para miniatura de 240 px só grava a capa no aparelho, depois que o livro já foi salvo. A análise envia a foto original, até 12 MB. |
| 4. RLS entre sebos | O aplicativo filtra livros pelo `usuario_id`. As políticas de RLS não estão neste repositório, então a proteção no Supabase não foi conferida daqui. |
| 5. CRUD | Cadastro, edição e exclusão existem. Não há ação separada de “marcar como vendido”. |
| 6. CSV com ISBN preservado | Sim. O ISBN sai como `="978..."`. |
| 7. Deploy na Vercel com HTTPS | Não há configuração da Vercel neste repositório. O código foi enviado ao GitHub (`sebo-no-bolso`); isso não comprova um endereço público na Vercel. |

A Fase 2 (preço de mercado, Mercado Livre/Shopee e assinatura Stripe/Asaas) ainda não está no código.
